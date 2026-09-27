import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
  btClickAction,
  btHeaderStatus,
  visibleBattery,
  type BtDevice,
  type DeviceStatus,
} from '../core/bluetooth.js';
import { ControlsRow, type ControlsRowOptions } from './controlsRow.js';
import {
  batteryIconName,
  btDeviceIconName,
  btIconName,
  btOffIconName,
  phosphor,
  spinnerIconName,
} from './icons.js';
import type { IslandSystem } from './island.js';
import {
  listRow,
  radioHeader,
  radioOffArea,
  scrollList,
  sectionDivider,
  vertical,
} from './radioList.js';
import type { DragHooks } from './sliderRow.js';
import { colors } from './tokens.js';

const SPIN_DURATION_MS = 1200;

const STATUS: Record<DeviceStatus, { text: string; color: string }> = {
  connected: { text: 'Conectado', color: colors.accent300 },
  disconnected: { text: 'Desconectado', color: colors.neutral500 },
  pair: { text: 'Parear', color: colors.accent300 },
  connecting: { text: 'Conectando…', color: colors.neutral400 },
  disconnecting: { text: 'Desconectando…', color: colors.neutral400 },
  pairing: { text: 'Pareando…', color: colors.neutral400 },
};

export interface BtViewCallbacks extends ControlsRowOptions {
  /** O rádio ligou/desligou: a ilha muda de altura. */
  onSizeChanged(): void;
  /** Abriu as Configurações: a ilha fecha pra janela não ficar atrás do grab. */
  onLeave(): void;
}

function groupLabel(text: string, padding: string): St.BoxLayout {
  const label = new St.BoxLayout({
    style: `
      padding: ${padding};
      spacing: 6px;
      font-size: 10.5px;
      letter-spacing: 0.6px;
      color: ${colors.neutral500};
    `,
  });
  label.add_child(new St.Label({ text: text.toUpperCase(), y_align: Clutter.ActorAlign.CENTER }));
  return label;
}

function deviceRowContent(device: BtDevice): St.BoxLayout {
  const content = new St.BoxLayout({
    style: 'height: 38px; padding: 0 8px; spacing: 10px;',
    x_expand: true,
  });
  content.add_child(deviceIcon(device));
  content.add_child(
    new St.Label({
      text: device.name,
      style: `font-size: 12.5px; color: ${colors.text};`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  const battery = visibleBattery(device);
  if (battery !== null) content.add_child(batteryBadge(battery));
  content.add_child(statusLabel(device.status));
  return content;
}

function deviceIcon(device: BtDevice): St.Icon {
  return new St.Icon({
    gicon: phosphor(btDeviceIconName(device.kind)),
    icon_size: 17,
    style: `color: ${device.connected ? colors.accent : colors.neutral300};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

function batteryBadge(percent: number): St.BoxLayout {
  const badge = new St.BoxLayout({
    style: `spacing: 4px; font-size: 11px; color: ${colors.neutral400};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  badge.add_child(new St.Icon({ gicon: phosphor(batteryIconName), icon_size: 13 }));
  badge.add_child(new St.Label({ text: `${percent}%`, y_align: Clutter.ActorAlign.CENTER }));
  return badge;
}

function statusLabel(status: DeviceStatus): St.Label {
  const { text, color } = STATUS[status];
  return new St.Label({
    text,
    style: `font-size: 11px; color: ${color};`,
    x_expand: true,
    x_align: Clutter.ActorAlign.END,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

// Modo `bt` (specs/08-controles-rapidos.md): linha de controles, divisor e
// seção com cabeçalho + switch e as listas "Meus dispositivos" e
// "Disponíveis" numa área rolável só.
export const BtView = GObject.registerClass(
  class BtView extends St.BoxLayout {
    private readonly system: IslandSystem;
    private readonly callbacks: BtViewCallbacks;
    private readonly statusLabel: St.Label;
    private readonly scroll: St.ScrollView;
    private readonly listBox: St.BoxLayout;
    private readonly offArea: St.BoxLayout;
    // Rótulos persistentes: a lista é recriada a cada mudança de dispositivo,
    // e o giro do ícone não pode reiniciar a cada vez.
    private readonly pairedLabel: St.BoxLayout;
    private readonly nearbyLabel: St.BoxLayout;
    private readonly spinner: St.Icon;
    private readonly unsubscribe: () => void;
    private releaseDiscovery: (() => void) | null = null;
    private radioOn: boolean;
    private destroyed = false;

    constructor(system: IslandSystem, drag: DragHooks, callbacks: BtViewCallbacks) {
      super({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true });
      this.system = system;
      this.callbacks = callbacks;

      this.add_child(new ControlsRow(system, drag, callbacks));
      this.add_child(sectionDivider());

      const section = vertical({ style: 'padding: 0 12px;', y_expand: true });
      this.add_child(section);

      const bt = system.bluetooth;
      const { header, statusLabel } = radioHeader({
        icon: btIconName,
        title: 'Bluetooth',
        radio: bt,
      });
      this.statusLabel = statusLabel;
      section.add_child(header);

      const { scroll, list } = scrollList();
      this.scroll = scroll;
      this.listBox = list;
      section.add_child(this.scroll);

      this.offArea = radioOffArea({
        icon: btOffIconName,
        text: 'Bluetooth desligado',
        height: 190,
      });
      section.add_child(this.offArea);

      this.pairedLabel = groupLabel('Meus dispositivos', '4px 8px 2px');
      this.nearbyLabel = groupLabel('Disponíveis', '8px 8px 2px');
      this.spinner = new St.Icon({
        gicon: phosphor(spinnerIconName),
        icon_size: 11,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.spinner.set_pivot_point(0.5, 0.5);
      this.nearbyLabel.add_child(this.spinner);

      this.radioOn = bt.radioOn;
      this.unsubscribe = bt.onChange(() => this.rebuild());
      this.connectObject('destroy', () => this.onDestroy(), this);
      this.rebuild();
    }

    get radioIsOn(): boolean {
      return this.radioOn;
    }

    /** Chamado quando a ilha entra em `bt`. */
    onOpen(): void {
      this.releaseDiscovery ??= this.system.bluetooth.holdDiscovery();
      this.spinner.rotation_angle_z = 0;
      this.spinner.ease({
        rotationAngleZ: 360,
        duration: SPIN_DURATION_MS,
        mode: Clutter.AnimationMode.LINEAR,
        repeatCount: -1,
      });
    }

    /** Chamado quando a ilha sai de `bt`. */
    onClose(): void {
      this.releaseDiscovery?.();
      this.releaseDiscovery = null;
      this.spinner.remove_all_transitions();
    }

    private rebuild(): void {
      const bt = this.system.bluetooth;
      const radioOn = bt.radioOn;

      this.statusLabel.text = btHeaderStatus(radioOn, bt.connectedCount);
      this.scroll.visible = radioOn;
      this.offArea.visible = !radioOn;

      for (const label of [this.pairedLabel, this.nearbyLabel])
        if (label.get_parent()) this.listBox.remove_child(label);
      this.listBox.destroy_all_children();

      this.listBox.add_child(this.pairedLabel);
      for (const device of bt.paired) this.listBox.add_child(this.deviceRow(device));
      this.listBox.add_child(this.nearbyLabel);
      for (const device of bt.nearby) this.listBox.add_child(this.deviceRow(device));

      if (radioOn !== this.radioOn) {
        this.radioOn = radioOn;
        this.callbacks.onSizeChanged();
      }
    }

    private deviceRow(device: BtDevice): St.Button {
      return listRow({
        content: deviceRowContent(device),
        active: device.connected,
        onClick: () => this.onDeviceClicked(device),
      });
    }

    private onDeviceClicked(device: BtDevice): void {
      const bt = this.system.bluetooth;
      switch (btClickAction(device, bt.busy)) {
        case 'connect':
          bt.connect(device.path);
          break;
        case 'disconnect':
          bt.disconnect(device.path);
          break;
        case 'pair':
          void bt.pair(device.path).then((result) => {
            if (result !== 'needs-pin') return;
            bt.openSettings();
            if (!this.destroyed) this.callbacks.onLeave();
          });
          break;
        case 'none':
          break;
      }
    }

    private onDestroy(): void {
      this.destroyed = true;
      this.onClose();
      this.unsubscribe();
      for (const label of [this.pairedLabel, this.nearbyLabel])
        if (!label.get_parent()) label.destroy();
    }
  },
);

export type BtViewActor = InstanceType<typeof BtView>;
