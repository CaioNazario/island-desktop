import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
  clickAction,
  headerStatus,
  signalLevel,
  validatePassword,
  type WifiNetwork,
} from '../core/wifi.js';
import type { ConnectResult } from '../system/wifi.js';
import { ControlsRow } from './controlsRow.js';
import {
  concealIconName,
  keyIconName,
  lockIconName,
  revealIconName,
  warningIconName,
  wifiIconName,
  wifiOffIconName,
  wifiSignalIconName,
} from './icons.js';
import type { IslandSystem } from './island.js';
import type { DragHooks } from './sliderRow.js';
import { Switch, type SwitchSource } from './switch.js';
import { colors, derivedColors } from './tokens.js';

export type PasswordField = 'none' | 'normal' | 'error';

type PasswordError = 'too-short' | Exclude<ConnectResult, 'connected'>;

const ERROR_TEXT: Record<PasswordError, string> = {
  'too-short': 'Senha precisa ter pelo menos 8 caracteres',
  'wrong-password': 'Senha incorreta',
  failed: 'Não foi possível conectar',
};

const PASSWORD_CHAR = '●';
const EMPTY_BUTTON_OPACITY = Math.round(0.45 * 255);

export interface WifiViewCallbacks {
  onWifiTileClick(): void;
  onBtTileClick(): void;
  /** O painel de senha abriu/fechou ou ganhou/perdeu erro: a ilha muda de altura. */
  onSizeChanged(): void;
  /** Abriu as Configurações: a ilha fecha pra janela não ficar atrás do grab. */
  onLeave(): void;
}

function vertical(params: Partial<St.BoxLayout.ConstructorProps> = {}): St.BoxLayout {
  return new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, ...params });
}

function textButton(label: string, style: string, onClick: () => void): St.Button {
  const button = new St.Button({
    label,
    style: `
      height: 32px;
      font-size: 12px;
      font-weight: 500;
      color: ${colors.accent};
      border-radius: 8px;
      ${style}
    `,
  });
  button.connectObject('clicked', () => onClick(), button);
  return button;
}

// Modo `wifi` (specs/08-controles-rapidos.md): linha de controles, divisor e
// seção de redes com cabeçalho + switch, lista rolável e painel de senha
// inline abaixo da rede escolhida.
export const WifiView = GObject.registerClass(
  class WifiView extends St.BoxLayout {
    private readonly system: IslandSystem;
    private readonly callbacks: WifiViewCallbacks;
    private readonly statusLabel: St.Label;
    private readonly scroll: St.ScrollView;
    private readonly listBox: St.BoxLayout;
    private readonly offArea: St.BoxLayout;
    private readonly passwordPanel: St.BoxLayout;
    private readonly passwordEntry: St.Entry;
    private readonly revealIcon: St.Icon;
    private readonly connectButton: St.Button;
    private readonly errorRow: St.BoxLayout;
    private readonly errorLabel: St.Label;
    private readonly unsubscribe: () => void;
    private passwordFor: string | null = null;
    private passwordError: PasswordError | null = null;
    private passwordVisible = false;
    private destroyed = false;

    constructor(system: IslandSystem, drag: DragHooks, callbacks: WifiViewCallbacks) {
      super({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true });
      this.system = system;
      this.callbacks = callbacks;

      this.add_child(
        new ControlsRow(system, drag, callbacks.onWifiTileClick, callbacks.onBtTileClick),
      );
      this.add_child(
        new St.Widget({
          style: `height: 1px; margin-bottom: 8px; background-color: ${colors.neutral800};`,
        }),
      );

      const section = vertical({ style: 'padding: 0 12px;', y_expand: true });
      this.add_child(section);

      const wifi = system.wifi;
      const header = new St.BoxLayout({
        style: 'height: 26px; padding: 0 6px; margin-bottom: 4px; spacing: 8px;',
      });
      header.add_child(
        new St.Icon({
          icon_name: wifiIconName,
          icon_size: 14,
          style: `color: ${colors.neutral300};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      header.add_child(
        new St.Label({
          text: 'Redes Wi‑Fi',
          style: `font-size: 13px; font-weight: 500; color: ${colors.text};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.statusLabel = new St.Label({
        style: `font-size: 11px; color: ${colors.neutral500};`,
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
      });
      header.add_child(this.statusLabel);
      const radio: SwitchSource = {
        get on() {
          return wifi.radioOn;
        },
        onChange: (callback) => wifi.onChange(callback),
      };
      header.add_child(new Switch(radio, () => wifi.setRadio(!wifi.radioOn)));
      section.add_child(header);

      this.listBox = vertical();
      this.scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        y_expand: true,
      });
      this.scroll.set_child(this.listBox);
      section.add_child(this.scroll);

      this.offArea = vertical({
        style: `height: 150px; spacing: 8px; color: ${colors.neutral500};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.offArea.add_child(
        new St.Icon({
          icon_name: wifiOffIconName,
          icon_size: 22,
          x_align: Clutter.ActorAlign.CENTER,
          y_expand: true,
          y_align: Clutter.ActorAlign.END,
        }),
      );
      this.offArea.add_child(
        new St.Label({
          text: 'Wi‑Fi desligado',
          style: 'font-size: 12.5px;',
          x_align: Clutter.ActorAlign.CENTER,
          y_expand: true,
          y_align: Clutter.ActorAlign.START,
        }),
      );
      section.add_child(this.offArea);

      // Painel persistente: a lista é recriada a cada scan, e o painel só é
      // reinserido abaixo da rede, sem perder o que já foi digitado.
      this.passwordEntry = new St.Entry({
        can_focus: true,
        x_expand: true,
        style: `
          font-size: 12.5px;
          color: ${colors.text};
          background-color: transparent;
          border-width: 0;
          box-shadow: none;
          padding: 0;
        `,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.passwordEntry.clutter_text.set_password_char(PASSWORD_CHAR);
      this.passwordEntry.clutter_text.connectObject(
        'activate',
        () => this.submitPassword(),
        'text-changed',
        () => this.onPasswordTyped(),
        this,
      );

      this.revealIcon = new St.Icon({ icon_name: revealIconName, icon_size: 14 });
      const revealButton = new St.Button({
        child: this.revealIcon,
        style: `width: 22px; height: 22px; border-radius: 11px; color: ${colors.neutral400};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      revealButton.connectObject('clicked', () => this.togglePasswordVisible(), this);

      const field = new St.BoxLayout({
        style: `
          height: 32px;
          padding: 0 10px;
          spacing: 8px;
          border-radius: 9px;
          background-color: ${colors.bg};
          border: 1px solid ${colors.neutral800};
        `,
        x_expand: true,
      });
      field.add_child(
        new St.Icon({
          icon_name: keyIconName,
          icon_size: 14,
          style: `color: ${colors.neutral400};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      field.add_child(this.passwordEntry);
      field.add_child(revealButton);

      this.connectButton = textButton(
        'Conectar',
        `padding: 0 12px; border: 1px solid ${colors.accent};`,
        () => this.submitPassword(),
      );
      const inputRow = new St.BoxLayout({ style: 'spacing: 8px;' });
      inputRow.add_child(field);
      inputRow.add_child(textButton('Cancelar', 'padding: 0 10px;', () => this.closePassword()));
      inputRow.add_child(this.connectButton);

      this.errorLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this.errorRow = new St.BoxLayout({
        style: `spacing: 6px; font-size: 11px; color: ${derivedColors.alertText};`,
      });
      this.errorRow.add_child(
        new St.Icon({
          icon_name: warningIconName,
          icon_size: 13,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.errorRow.add_child(this.errorLabel);

      this.passwordPanel = vertical({ style: 'spacing: 6px;' });
      this.passwordPanel.add_child(inputRow);
      this.passwordPanel.add_child(this.errorRow);

      this.unsubscribe = wifi.onChange(() => this.rebuild());
      this.connectObject('destroy', () => this.onDestroy(), this);
      this.rebuild();
    }

    get passwordField(): PasswordField {
      if (this.passwordFor === null) return 'none';
      return this.passwordError ? 'error' : 'normal';
    }

    /** Chamado quando a ilha entra em `wifi`. */
    onOpen(): void {
      this.setPassword(null, null);
      this.system.wifi.requestScan();
    }

    /** Esc com o painel de senha aberto fecha só o painel (spec 03, regra 9). */
    closePasswordIfOpen(): boolean {
      if (this.passwordFor === null) return false;
      this.closePassword();
      return true;
    }

    private rebuild(): void {
      const wifi = this.system.wifi;
      const radioOn = wifi.radioOn;

      this.statusLabel.text = headerStatus(radioOn, wifi.active);
      this.scroll.visible = radioOn;
      this.offArea.visible = !radioOn;

      if (this.passwordPanel.get_parent()) this.listBox.remove_child(this.passwordPanel);
      this.listBox.destroy_all_children();

      let passwordNetworkShown = false;
      for (const network of wifi.networks) {
        this.listBox.add_child(this.networkRow(network));
        if (network.ssid === this.passwordFor && clickAction(network) === 'password') {
          this.listBox.add_child(this.passwordPanel);
          passwordNetworkShown = true;
        }
      }

      if (this.passwordFor !== null && !passwordNetworkShown) this.setPassword(null, null);
    }

    private networkRow(network: WifiNetwork): St.Button {
      const connected = network.status === 'connected';
      const baseBg = connected ? colors.accent900 : 'transparent';

      const content = new St.BoxLayout({
        style: 'height: 36px; padding: 0 8px; spacing: 10px;',
        x_expand: true,
      });
      content.add_child(
        new St.Icon({
          icon_name: wifiSignalIconName(signalLevel(network.strength)),
          icon_size: 16,
          style: `color: ${connected ? colors.accent : colors.neutral300};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      content.add_child(
        new St.Label({
          text: network.ssid,
          style: `font-size: 12.5px; color: ${colors.text};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      if (network.security !== 'open') {
        content.add_child(
          new St.Icon({
            icon_name: lockIconName,
            icon_size: 11,
            style: `color: ${colors.neutral500};`,
            y_align: Clutter.ActorAlign.CENTER,
          }),
        );
      }
      const status =
        network.status === 'connected'
          ? { text: 'Conectado', color: colors.accent300 }
          : network.status === 'connecting'
            ? { text: 'Conectando…', color: colors.neutral400 }
            : null;
      if (status) {
        content.add_child(
          new St.Label({
            text: status.text,
            style: `font-size: 11px; color: ${status.color};`,
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
          }),
        );
      }

      const row = new St.Button({ child: content, track_hover: true, x_expand: true });
      const syncStyle = (): void => {
        const bg = row.hover && !connected ? colors.neutral900 : baseBg;
        row.style = `border-radius: 10px; background-color: ${bg};`;
      };
      syncStyle();
      row.connectObject(
        'notify::hover',
        syncStyle,
        'clicked',
        () => this.onNetworkClicked(network),
        row,
      );
      return row;
    }

    private onNetworkClicked(network: WifiNetwork): void {
      switch (clickAction(network)) {
        case 'activate':
          this.setPassword(null, null);
          this.system.wifi.activate(network.ssid);
          break;
        case 'password':
          if (this.passwordFor === network.ssid) this.closePassword();
          else this.setPassword(network.ssid, null);
          break;
        case 'settings':
          this.system.wifi.openSettings(network.ssid);
          this.callbacks.onLeave();
          break;
        case 'none':
          break;
      }
    }

    private submitPassword(): void {
      const ssid = this.passwordFor;
      if (ssid === null) return;

      const password = this.passwordEntry.get_text();
      if (validatePassword(password) === 'too-short') {
        this.setPassword(ssid, 'too-short');
        return;
      }

      this.closePassword();
      void this.system.wifi.connectWithPassword(ssid, password).then((result) => {
        if (this.destroyed || result === 'connected') return;
        this.setPassword(ssid, result);
      });
    }

    private closePassword(): void {
      this.setPassword(null, null);
    }

    private onPasswordTyped(): void {
      this.connectButton.opacity =
        this.passwordEntry.get_text() === '' ? EMPTY_BUTTON_OPACITY : 255;
      // "Digitar limpa o erro."
      if (this.passwordError !== null) this.setPassword(this.passwordFor, null);
    }

    private togglePasswordVisible(): void {
      this.passwordVisible = !this.passwordVisible;
      this.passwordEntry.clutter_text.set_password_char(this.passwordVisible ? '' : PASSWORD_CHAR);
      this.revealIcon.icon_name = this.passwordVisible ? concealIconName : revealIconName;
    }

    private setPassword(ssid: string | null, error: PasswordError | null): void {
      const opening = ssid !== null && ssid !== this.passwordFor;
      const before = this.passwordField;

      this.passwordFor = ssid;
      this.passwordError = error;

      if (opening || ssid === null) {
        this.passwordEntry.set_text('');
        if (this.passwordVisible) this.togglePasswordVisible();
      }

      this.errorRow.visible = error !== null;
      if (error !== null) this.errorLabel.text = ERROR_TEXT[error];
      this.passwordPanel.style = `
        margin: 2px 0 6px;
        padding: 10px;
        spacing: 6px;
        border-radius: 12px;
        background-color: ${colors.neutral900};
        border: 1px solid ${error ? derivedColors.passwordErrorBorder : colors.neutral800};
      `;

      if (opening || ssid === null) this.rebuild();
      if (ssid !== null) this.passwordEntry.grab_key_focus();
      if (this.passwordField !== before) this.callbacks.onSizeChanged();
    }

    private onDestroy(): void {
      this.destroyed = true;
      this.unsubscribe();
      this.passwordEntry.clutter_text.disconnectObject(this);
      if (!this.passwordPanel.get_parent()) this.passwordPanel.destroy();
    }
  },
);

export type WifiViewActor = InstanceType<typeof WifiView>;
