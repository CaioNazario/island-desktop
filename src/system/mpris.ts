import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  PlayerTracker,
  positionAt,
  type PlaybackStatus,
  type PlayerSnapshot,
  type PositionAnchor,
} from '../core/music.js';

/** Faixa do player atual (specs/05-musica.md "Fonte: MPRIS"). */
export interface MusicTrack {
  readonly identity: string;
  readonly playing: boolean;
  readonly title: string;
  readonly artists: readonly string[];
  readonly lengthUs: number;
  /** `mpris:artUrl`; vazio sem capa. */
  readonly artUrl: string;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
}

export interface MusicSource {
  /** `null` quando nenhum player é atual: a seção de música some. */
  readonly track: MusicTrack | null;
  /** Posição do player atual em µs, avançada localmente enquanto toca. */
  readonly positionUs: number;
  previous(): void;
  playPause(): void;
  next(): void;
  /** Faixa, estado ou player atual mudou. */
  onChange(callback: () => void): () => void;
  /** O player atual tocando trocou de faixa: gatilho do modo `music`. */
  onTrackChange(callback: () => void): () => void;
  /** A cada 1s enquanto toca, e em seek. */
  onPosition(callback: () => void): () => void;
}

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const POSITION_TICK_MS = 1000;

// A XML que o Shell 50.4 embute (data/dbus-interfaces) não tem `Position`
// nem `Seeked`.
const ROOT_XML = `<node>
  <interface name="org.mpris.MediaPlayer2">
    <property name="Identity" type="s" access="read"/>
  </interface>
</node>`;

const PLAYER_XML = `<node>
  <interface name="${PLAYER_IFACE}">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <signal name="Seeked">
      <arg name="Position" type="x"/>
    </signal>
  </interface>
</node>`;

// `makeProxyWrapper` expõe as propriedades como getters (`null` até o cache
// chegar) e os métodos como `<Nome>Async`.
interface RootProxy extends Gio.DBusProxy {
  readonly Identity: string | null;
}

interface PlayerProxy extends Gio.DBusProxy {
  readonly CanGoNext: boolean | null;
  readonly CanGoPrevious: boolean | null;
  readonly Metadata: Record<string, GLib.Variant> | null;
  readonly PlaybackStatus: string | null;
  PlayPauseAsync(): Promise<void>;
  NextAsync(): Promise<void>;
  PreviousAsync(): Promise<void>;
}

const RootProxyWrapper = Gio.DBusProxy.makeProxyWrapper<RootProxy>(ROOT_XML);
const PlayerProxyWrapper = Gio.DBusProxy.makeProxyWrapper<PlayerProxy>(PLAYER_XML);

function nowMs(): number {
  return GLib.get_monotonic_time() / 1000;
}

function statusOf(value: string | null): PlaybackStatus {
  return value === 'Playing' || value === 'Paused' ? value : 'Stopped';
}

// Metadados validados como no Shell (js/ui/mpris.js): cliente manda lixo.
function metadataOf(proxy: PlayerProxy): {
  trackId: string;
  title: string;
  artists: string[];
  lengthUs: number;
  artUrl: string;
} {
  const raw: Record<string, unknown> = {};
  for (const [key, variant] of Object.entries(proxy.Metadata ?? {}))
    raw[key] = variant.deepUnpack();
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const artists = raw['xesam:artist'];
  const length = raw['mpris:length'];
  return {
    trackId: text(raw['mpris:trackid']),
    title: text(raw['xesam:title']),
    artists: Array.isArray(artists) ? artists.filter((a) => typeof a === 'string') : [],
    lengthUs: typeof length === 'number' && length > 0 ? length : 0,
    artUrl: text(raw['mpris:artUrl']),
  };
}

class Player {
  root: RootProxy | null = null;
  player: PlayerProxy | null = null;
  anchor: PositionAnchor = { positionUs: 0, atMs: 0, playing: false };
  // Os dois proxies respondem (pronto ou erro) antes de o player contar.
  private pendingProxies = 2;
  // Faixa e estado da última leitura de `Position`: o Firefox reenvia os
  // metadados várias vezes por segundo sem mudar nada.
  private syncedState = '';
  // Leitura em andamento: quem chega no meio espera por ela.
  private syncing: Promise<void> = Promise.resolve();
  private positionRead = false;

  constructor(
    readonly busName: string,
    private readonly cancellable: Gio.Cancellable,
    private readonly onUpdate: (player: Player) => void,
    private readonly onSeeked: (player: Player) => void,
  ) {
    RootProxyWrapper(
      Gio.DBus.session,
      busName,
      MPRIS_PATH,
      (proxy, error) => {
        this.pendingProxies--;
        if (!error && proxy) this.root = proxy;
        this.onUpdate(this);
      },
      cancellable,
    );
    PlayerProxyWrapper(
      Gio.DBus.session,
      busName,
      MPRIS_PATH,
      (proxy, error) => {
        this.pendingProxies--;
        if (error || !proxy) {
          this.onUpdate(this);
          return;
        }
        this.player = proxy;
        proxy.connectObject(
          'g-properties-changed',
          () => this.onUpdate(this),
          'g-signal',
          (_proxy: PlayerProxy, _sender: string, signal: string, parameters: GLib.Variant) => {
            if (signal !== 'Seeked') return;
            const [positionUs] = parameters.deepUnpack<[number]>();
            this.anchor = { positionUs, atMs: nowMs(), playing: this.playing };
            this.onSeeked(this);
          },
          this,
        );
        this.onUpdate(this);
      },
      cancellable,
    );
  }

  // Respondeu tudo o que ia responder: os dois proxies e, se deram certo, a
  // primeira leitura de `Position` (senão o primeiro quadro sai em 0:00).
  get settled(): boolean {
    return this.pendingProxies === 0 && (!this.ready || this.positionRead);
  }

  get ready(): boolean {
    return this.root !== null && this.player !== null;
  }

  get playing(): boolean {
    return this.player?.PlaybackStatus === 'Playing';
  }

  snapshot(): PlayerSnapshot {
    const { trackId, title } = metadataOf(this.player!);
    return { status: statusOf(this.player!.PlaybackStatus), trackId, title };
  }

  track(): MusicTrack {
    const { title, artists, lengthUs, artUrl } = metadataOf(this.player!);
    return {
      identity: this.root!.Identity ?? '',
      playing: this.playing,
      title,
      artists,
      lengthUs,
      artUrl,
      canGoPrevious: this.player!.CanGoPrevious === true,
      canGoNext: this.player!.CanGoNext === true,
    };
  }

  // `Position` não entra no `PropertiesChanged` nem no cache do proxy: relê
  // na troca de faixa e no play/pause.
  async syncPosition(): Promise<void> {
    const player = this.player;
    if (!player || !this.root) return;
    const { trackId, title } = metadataOf(player);
    const state = `${trackId}\n${title}\n${player.PlaybackStatus}`;
    if (state === this.syncedState) {
      await this.syncing;
      return;
    }
    this.syncedState = state;
    this.syncing = this.readPosition(player);
    await this.syncing;
  }

  private async readPosition(player: PlayerProxy): Promise<void> {
    try {
      const reply = await player.call(
        'org.freedesktop.DBus.Properties.Get',
        new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
        Gio.DBusCallFlags.NONE,
        -1,
        this.cancellable,
      );
      const [position] = reply.deepUnpack<[GLib.Variant]>();
      const positionUs = position.deepUnpack<number>();
      this.anchor = { positionUs, atMs: nowMs(), playing: this.playing };
    } catch {
      // Player saiu ou não implementa `Position`: fica na última leitura.
    }
    this.positionRead = true;
  }

  destroy(): void {
    this.player?.disconnectObject(this);
    this.root = null;
    this.player = null;
  }
}

// Players MPRIS do barramento de sessão (specs/05-musica.md).
export class SystemMpris implements MusicSource {
  private readonly cancellable = new Gio.Cancellable();
  private readonly players = new Map<string, Player>();
  private readonly tracker = new PlayerTracker();
  private readonly changeListeners = new Set<() => void>();
  private readonly trackListeners = new Set<() => void>();
  private readonly positionListeners = new Set<() => void>();
  private currentName: string | null = null;
  private lastEmitted = '';
  // A primeira leitura do `PlayerTracker` espera a listagem inicial inteira:
  // senão um segundo player já tocando contaria como novo e abriria `music`
  // a cada desbloqueio.
  private listed = false;
  private nameOwnerId: number;
  private tickId: number | null = null;

  constructor() {
    Gio._promisify(Gio.DBusProxy.prototype, 'call');
    Gio._promisify(Gio.DBusConnection.prototype, 'call');

    this.nameOwnerId = Gio.DBus.session.signal_subscribe(
      'org.freedesktop.DBus',
      'org.freedesktop.DBus',
      'NameOwnerChanged',
      '/org/freedesktop/DBus',
      null,
      Gio.DBusSignalFlags.NONE,
      (_connection, _sender, _path, _iface, _signal, parameters) => {
        const [name, oldOwner, newOwner] = parameters.deepUnpack<[string, string, string]>();
        if (!name.startsWith(MPRIS_PREFIX)) return;
        if (oldOwner) this.removePlayer(name);
        if (newOwner) this.addPlayer(name);
      },
    );
    this.listNames()
      .catch(() => {})
      .finally(() => {
        this.listed = true;
        this.refresh();
      });
  }

  get track(): MusicTrack | null {
    return this.current?.track() ?? null;
  }

  get positionUs(): number {
    const current = this.current;
    if (!current) return 0;
    return positionAt(current.anchor, nowMs(), current.track().lengthUs);
  }

  previous(): void {
    this.current?.player?.PreviousAsync().catch(() => {});
  }

  playPause(): void {
    this.current?.player?.PlayPauseAsync().catch(() => {});
  }

  next(): void {
    this.current?.player?.NextAsync().catch(() => {});
  }

  onChange(callback: () => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  onTrackChange(callback: () => void): () => void {
    this.trackListeners.add(callback);
    return () => this.trackListeners.delete(callback);
  }

  onPosition(callback: () => void): () => void {
    this.positionListeners.add(callback);
    return () => this.positionListeners.delete(callback);
  }

  destroy(): void {
    this.cancellable.cancel();
    Gio.DBus.session.signal_unsubscribe(this.nameOwnerId);
    this.stopTick();
    this.players.forEach((player) => player.destroy());
    this.players.clear();
    this.changeListeners.clear();
    this.trackListeners.clear();
    this.positionListeners.clear();
  }

  private get current(): Player | null {
    return this.currentName === null ? null : (this.players.get(this.currentName) ?? null);
  }

  private async listNames(): Promise<void> {
    const reply = await Gio.DBus.session.call(
      'org.freedesktop.DBus',
      '/org/freedesktop/DBus',
      'org.freedesktop.DBus',
      'ListNames',
      null,
      new GLib.VariantType('(as)'),
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
    );
    const [names] = reply.deepUnpack<[string[]]>();
    names.filter((name) => name.startsWith(MPRIS_PREFIX)).forEach((name) => this.addPlayer(name));
  }

  private addPlayer(name: string): void {
    if (this.players.has(name)) return;
    this.players.set(
      name,
      new Player(
        name,
        this.cancellable,
        (player) => this.onPlayerUpdate(player),
        (player) => {
          if (player === this.current) this.emitPosition();
        },
      ),
    );
  }

  private removePlayer(name: string): void {
    const player = this.players.get(name);
    if (!player) return;
    player.destroy();
    this.players.delete(name);
    this.refresh();
  }

  private async onPlayerUpdate(player: Player): Promise<void> {
    await player.syncPosition();
    if (this.players.get(player.busName) !== player) return;
    this.refresh();
  }

  private refresh(): void {
    if (!this.listed || [...this.players.values()].some((player) => !player.settled)) return;
    const snapshots = new Map<string, PlayerSnapshot>();
    for (const [name, player] of this.players)
      if (player.ready) snapshots.set(name, player.snapshot());
    const { current, trackChanged } = this.tracker.update(snapshots);
    this.currentName = current;

    if (this.current?.playing) this.startTick();
    else this.stopTick();

    // Só o que a UI mostra: reenvio de metadados iguais não re-renderiza.
    const visible = JSON.stringify([current, this.track]);
    if (visible !== this.lastEmitted) {
      this.lastEmitted = visible;
      this.changeListeners.forEach((callback) => callback());
    }
    if (trackChanged) this.trackListeners.forEach((callback) => callback());
    this.emitPosition();
  }

  private startTick(): void {
    if (this.tickId !== null) return;
    this.tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POSITION_TICK_MS, () => {
      this.emitPosition();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private stopTick(): void {
    if (this.tickId === null) return;
    GLib.Source.remove(this.tickId);
    this.tickId = null;
  }

  private emitPosition(): void {
    this.positionListeners.forEach((callback) => callback());
  }
}
