import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import NM from 'gi://NM';

import {
  buildNetworkList,
  type AccessPointInfo,
  type ActiveNetwork,
  type WifiNetwork,
  type WifiSecurity,
} from '../core/wifi.js';
import { launchSettingsPanel } from './settingsPanel.js';
import { WifiSecretInterceptor } from './wifiSecrets.js';

export type ConnectResult = 'connected' | 'wrong-password' | 'failed';

const ACTIVATION_TIMEOUT_SECONDS = 30;

// Mesma escolha do Shell (js/ui/status/network.js `_getApSecurityType`): o
// tipo mais forte que o AP e a placa suportam.
const SECURITY_TYPES = Object.values(NM.UtilsSecurityType)
  .filter((value): value is NM.UtilsSecurityType => typeof value === 'number')
  .sort((a, b) => b - a);

// Os tipos @girs chamam o enum de `NM.__80211Mode`, mas no GJS ele é
// `NM['80211Mode']` (identificador começando com dígito).
const NM80211Mode = (NM as unknown as Record<'80211Mode', typeof NM.__80211Mode>)['80211Mode'];

function securityTypeOf(device: NM.DeviceWifi, ap: NM.AccessPoint): NM.UtilsSecurityType {
  const adHoc = ap.mode === NM80211Mode.ADHOC;
  return (
    SECURITY_TYPES.find((type) =>
      NM.utils_security_valid(
        type,
        device.wireless_capabilities,
        true,
        adHoc,
        ap.flags,
        ap.wpa_flags,
        ap.rsn_flags,
      ),
    ) ?? NM.UtilsSecurityType.INVALID
  );
}

// OWE é criptografado mas sem senha: pro usuário, é aberta. WEP e LEAP são
// legados que o painel de senha (só WPA/SAE) não cobre, então vão pras
// Configurações junto com o 802.1X.
function classify(type: NM.UtilsSecurityType): WifiSecurity | null {
  switch (type) {
    case NM.UtilsSecurityType.NONE:
    case NM.UtilsSecurityType.OWE:
      return 'open';
    case NM.UtilsSecurityType.WPA_PSK:
    case NM.UtilsSecurityType.WPA2_PSK:
    case NM.UtilsSecurityType.SAE:
      return 'personal';
    case NM.UtilsSecurityType.INVALID:
      return null;
    default:
      return 'enterprise';
  }
}

function ssidToString(ssid: GLib.Bytes | null): string {
  const data = ssid?.get_data();
  return data ? (NM.utils_ssid_to_utf8(data) ?? '') : '';
}

function newClient(): Promise<NM.Client> {
  return new Promise((resolve, reject) => {
    NM.Client.new_async(null, (_source, result) => {
      try {
        resolve(NM.Client.new_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

interface BestAccessPoint {
  ap: NM.AccessPoint;
  type: NM.UtilsSecurityType;
}

interface PasswordAttempt {
  uuid: string;
  resolve: (result: ConnectResult) => void;
  timeoutId: number;
  activeConnection: NM.ActiveConnection | null;
}

// Wi-Fi via `NM.Client` (specs/08-controles-rapidos.md, modo `wifi`). Um
// cliente próprio, igual ao indicador de rede do Shell: o dele é privado.
export class SystemWifi {
  private client: NM.Client | null = null;
  private device: NM.DeviceWifi | null = null;
  private activeConnection: NM.ActiveConnection | null = null;
  private bestAps = new Map<string, BestAccessPoint>();
  private networkList: WifiNetwork[] = [];
  private attempt: PasswordAttempt | null = null;
  private destroyed = false;
  private readonly secretInterceptor: WifiSecretInterceptor;
  private readonly listeners = new Set<() => void>();

  constructor() {
    Gio._promisify(NM.Client.prototype, 'activate_connection_async');
    Gio._promisify(NM.Client.prototype, 'add_and_activate_connection_async');
    Gio._promisify(NM.RemoteConnection.prototype, 'delete_async');
    Gio._promisify(NM.DeviceWifi.prototype, 'request_scan_async');
    this.secretInterceptor = new WifiSecretInterceptor((uuid) => this.onSecretsRequested(uuid));
    void this.init();
  }

  /** Há placa Wi-Fi gerenciada pelo NM. Sem ela, o tile e o modo somem. */
  get available(): boolean {
    return this.device !== null;
  }

  get radioOn(): boolean {
    return this.client?.wireless_enabled ?? false;
  }

  get networks(): readonly WifiNetwork[] {
    return this.networkList;
  }

  get active(): ActiveNetwork | null {
    const connection = this.activeConnection;
    if (!connection) return null;
    const ssid = ssidToString(connection.connection?.get_setting_wireless()?.get_ssid() ?? null);
    if (connection.state === NM.ActiveConnectionState.ACTIVATED)
      return { ssid, status: 'connected' };
    if (connection.state === NM.ActiveConnectionState.ACTIVATING)
      return { ssid, status: 'connecting' };
    return null;
  }

  setRadio(on: boolean): void {
    if (this.client) this.client.wireless_enabled = on;
  }

  requestScan(): void {
    this.device?.request_scan_async(null).catch(() => {
      // O NM limita a frequência de scans; recusar um pedido não é erro.
    });
  }

  /** Rede aberta ou com perfil salvo: ativa sem pedir nada. */
  activate(ssid: string): void {
    const best = this.bestAps.get(ssid);
    if (!this.client || !this.device || !best) return;

    const [profile] = this.profilesFor(best.ap);
    const request = profile
      ? this.client.activate_connection_async(profile, this.device, best.ap.get_path(), null)
      : this.client.add_and_activate_connection_async(
          this.userConnection(ssid),
          this.device,
          best.ap.get_path(),
          null,
        );
    request.catch((error: Error) => {
      console.error(`Island: failed to activate Wi-Fi ${ssid}: ${error.message}`);
    });
  }

  /**
   * Rede WPA/WPA2/WPA3 pessoal sem perfil: cria o perfil com a PSK e ativa.
   * Resolve quando a conexão sobe, quando a senha é recusada ou depois de
   * 30s. Em falha, o perfil criado é apagado.
   */
  connectWithPassword(ssid: string, password: string): Promise<ConnectResult> {
    const best = this.bestAps.get(ssid);
    if (!this.client || !this.device || !best) return Promise.resolve('failed');

    this.finishAttempt('failed');

    const uuid = NM.utils_uuid_generate();
    const connection = this.userConnection(ssid, uuid);
    connection.add_setting(
      new NM.SettingWirelessSecurity({
        key_mgmt: best.type === NM.UtilsSecurityType.SAE ? 'sae' : 'wpa-psk',
        psk: password,
      }),
    );

    return new Promise((resolve) => {
      const attempt: PasswordAttempt = {
        uuid,
        resolve,
        activeConnection: null,
        timeoutId: GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          ACTIVATION_TIMEOUT_SECONDS,
          () => {
            attempt.timeoutId = 0;
            this.finishAttempt('failed');
            return GLib.SOURCE_REMOVE;
          },
        ),
      };
      this.attempt = attempt;

      this.client!.add_and_activate_connection_async(
        connection,
        this.device,
        best.ap.get_path(),
        null,
      )
        .then((activeConnection) => {
          if (this.attempt !== attempt) return;
          attempt.activeConnection = activeConnection;
          activeConnection.connectObject('notify::state', () => this.syncAttempt(), this);
          this.syncAttempt();
        })
        .catch((error: Error) => {
          console.error(`Island: failed to add Wi-Fi ${ssid}: ${error.message}`);
          if (this.attempt === attempt) this.finishAttempt('failed');
        });
    });
  }

  /** 802.1X, WEP: o diálogo de conexão das Configurações → Wi-Fi. */
  openSettings(ssid: string): void {
    const best = this.bestAps.get(ssid);
    if (!this.device || !best) {
      launchSettingsPanel('wifi');
      return;
    }
    // `get_path()` do `NM.Device` é o nome da interface; o caminho D-Bus
    // vem do `NM.Object` (mesmo contorno de js/ui/status/network.js).
    const devicePath = NM.Object.prototype.get_path.call(this.device);
    launchSettingsPanel('wifi', 'connect-8021x-wifi', devicePath, best.ap.get_path());
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.destroyed = true;
    this.secretInterceptor.destroy();
    // Não apaga o perfil de uma tentativa em andamento: `disable()` roda a
    // cada bloqueio de tela e a senha pode estar certa.
    if (this.attempt) {
      if (this.attempt.timeoutId) GLib.Source.remove(this.attempt.timeoutId);
      this.attempt.activeConnection?.disconnectObject(this);
      this.attempt = null;
    }
    this.activeConnection?.disconnectObject(this);
    this.device?.disconnectObject(this);
    this.client?.disconnectObject(this);
    this.listeners.clear();
  }

  private async init(): Promise<void> {
    let client: NM.Client;
    try {
      client = await newClient();
    } catch {
      // Sem NetworkManager: o Wi-Fi some da ilha (serviço opcional).
      return;
    }
    if (this.destroyed) return;

    this.client = client;
    client.connectObject(
      'notify::wireless-enabled',
      () => this.rebuild(),
      'device-added',
      () => this.syncDevice(),
      'device-removed',
      () => this.syncDevice(),
      'connection-added',
      () => this.rebuild(),
      'connection-removed',
      () => this.rebuild(),
      this,
    );
    this.syncDevice();
  }

  private syncDevice(): void {
    const device =
      this.client?.get_devices().find((d): d is NM.DeviceWifi => d instanceof NM.DeviceWifi) ??
      null;
    if (device === this.device) return;

    this.device?.disconnectObject(this);
    this.device = device;
    this.device?.connectObject(
      'access-point-added',
      () => this.rebuild(),
      'access-point-removed',
      () => this.rebuild(),
      'notify::last-scan',
      () => this.rebuild(),
      'notify::active-connection',
      () => this.syncActiveConnection(),
      this,
    );
    this.syncActiveConnection();
  }

  private syncActiveConnection(): void {
    const connection = this.device?.active_connection ?? null;
    if (connection !== this.activeConnection) {
      this.activeConnection?.disconnectObject(this);
      this.activeConnection = connection;
      this.activeConnection?.connectObject('notify::state', () => this.rebuild(), this);
    }
    this.rebuild();
  }

  private rebuild(): void {
    this.bestAps.clear();
    const infos: AccessPointInfo[] = [];

    if (this.device && this.radioOn) {
      for (const ap of this.device.get_access_points()) {
        const ssid = ssidToString(ap.get_ssid());
        const type = securityTypeOf(this.device, ap);
        const security = classify(type);
        if (ssid === '' || security === null) continue;

        infos.push({
          ssid,
          strength: ap.strength,
          security,
          hasProfile: this.profilesFor(ap).length > 0,
        });
        const best = this.bestAps.get(ssid);
        if (!best || ap.strength > best.ap.strength) this.bestAps.set(ssid, { ap, type });
      }
    }

    this.networkList = buildNetworkList(infos, this.active);
    this.listeners.forEach((callback) => callback());
  }

  private profilesFor(ap: NM.AccessPoint): NM.Connection[] {
    if (!this.client || !this.device) return [];
    return ap.filter_connections(this.device.filter_connections(this.client.get_connections()));
  }

  // Perfil só do usuário atual: não pede senha de admin (polkit
  // `settings.modify.system`) fora do grupo wheel. O Shell só faz isso
  // quando o polkit nega; aqui é sempre, pra não bloquear o main loop com a
  // checagem síncrona do polkit.
  private userConnection(ssid: string, uuid = NM.utils_uuid_generate()): NM.Connection {
    const connection = NM.SimpleConnection.new();
    const setting = new NM.SettingConnection({ id: ssid, uuid });
    setting.add_permission('user', GLib.get_user_name(), null);
    connection.add_setting(setting);
    return connection;
  }

  // O perfil foi criado com a PSK: qualquer pedido de segredo pra ele é o NM
  // dizendo que a senha foi recusada.
  private onSecretsRequested(uuid: string): boolean {
    if (this.attempt?.uuid !== uuid) return false;
    this.finishAttempt('wrong-password');
    return true;
  }

  private syncAttempt(): void {
    const state = this.attempt?.activeConnection?.state;
    if (state === NM.ActiveConnectionState.ACTIVATED) this.finishAttempt('connected');
    else if (state === NM.ActiveConnectionState.DEACTIVATED) this.finishAttempt('failed');
  }

  private finishAttempt(result: ConnectResult): void {
    const attempt = this.attempt;
    if (!attempt) return;
    this.attempt = null;

    if (attempt.timeoutId) GLib.Source.remove(attempt.timeoutId);
    attempt.activeConnection?.disconnectObject(this);

    if (result !== 'connected') {
      // Apagar o perfil também derruba a ativação em andamento.
      const profile = this.client?.get_connection_by_uuid(attempt.uuid) ?? null;
      profile?.delete_async(null).catch((error: Error) => {
        console.error(`Island: failed to delete Wi-Fi profile: ${error.message}`);
      });
    }
    attempt.resolve(result);
  }
}
