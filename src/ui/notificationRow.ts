import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatRelativeTime } from '../core/notifications.js';
import type { NotificationEntry } from '../system/notifications.js';
import {
  closeIconName,
  notificationAppIcon,
  notificationFallbackIconName,
  phosphor,
} from './icons.js';
import { colors } from './tokens.js';

// Medidas que mudam entre `notif`, banner e item do `stack`
// (specs/04-notificacoes.md); o resto do layout é o mesmo nos três.
export interface NotificationRowMetrics {
  blockSize: number;
  blockRadius: number;
  iconSize: number;
  closeSize: number;
  closeIconSize: number;
  /** `notif`/banner: fundo `neutral-900`; `stack`: transparente `neutral-500`. */
  closeFilled: boolean;
  gap: number;
}

function closeStyle(metrics: NotificationRowMetrics, hover: boolean): string {
  const size = `width: ${metrics.closeSize}px; height: ${metrics.closeSize}px;`;
  const radius = `border-radius: ${metrics.closeSize / 2}px;`;
  if (metrics.closeFilled) {
    const bg = hover ? colors.neutral800 : colors.neutral900;
    return `${size} ${radius} background-color: ${bg}; color: ${colors.neutral300};`;
  }
  const bg = hover ? colors.neutral800 : 'transparent';
  const fg = hover ? colors.text : colors.neutral500;
  return `${size} ${radius} background-color: ${bg}; color: ${fg};`;
}

function closeButton(metrics: NotificationRowMetrics, onClose: () => void): St.Button {
  const button = new St.Button({
    child: new St.Icon({ gicon: phosphor(closeIconName), icon_size: metrics.closeIconSize }),
    track_hover: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const refresh = (): void => {
    button.style = closeStyle(metrics, button.hover);
  };
  button.connectObject('notify::hover', refresh, 'clicked', () => onClose(), button);
  refresh();
  return button;
}

// Bloco do ícone + nome/tempo/texto + ×. `setEntry()` troca a notificação sem
// recriar os atores (o `notif` troca o conteúdo pela nova).
export const NotificationRow = GObject.registerClass(
  class NotificationRow extends St.BoxLayout {
    private readonly icon: St.Icon;
    private readonly appLabel: St.Label;
    private readonly timeLabel: St.Label;
    private readonly textLabel: St.Label;
    private receivedAtMs = 0;

    constructor(metrics: NotificationRowMetrics, onClose: () => void) {
      super({ style: `spacing: ${metrics.gap}px;`, x_expand: true });

      this.icon = new St.Icon({
        icon_size: metrics.iconSize,
        fallback_gicon: phosphor(notificationFallbackIconName),
        style: `color: ${colors.accent300};`,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });
      const block = new St.Bin({
        child: this.icon,
        y_align: Clutter.ActorAlign.CENTER,
        style: `
          width: ${metrics.blockSize}px;
          height: ${metrics.blockSize}px;
          border-radius: ${metrics.blockRadius}px;
          background-color: ${colors.accent900};
        `,
      });

      this.appLabel = new St.Label({ style: 'font-size: 13px; font-weight: 500;' });
      this.timeLabel = new St.Label({
        style: `font-size: 11px; color: ${colors.neutral500};`,
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.END,
      });
      const header = new St.BoxLayout({ style: 'spacing: 8px;' });
      header.add_child(this.appLabel);
      header.add_child(this.timeLabel);

      this.textLabel = new St.Label({ style: `font-size: 12px; color: ${colors.neutral400};` });
      const lines = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      lines.add_child(header);
      lines.add_child(this.textLabel);

      this.add_child(block);
      this.add_child(lines);
      this.add_child(closeButton(metrics, onClose));
    }

    setEntry(entry: NotificationEntry): void {
      this.icon.gicon = notificationAppIcon(entry.appIcon);
      this.appLabel.text = entry.appName;
      this.textLabel.text = entry.text;
      this.receivedAtMs = entry.receivedAtMs;
      this.refreshTime();
    }

    /** "Atualiza a cada minuto enquanto visível" (specs/04-notificacoes.md). */
    refreshTime(): void {
      this.timeLabel.text = formatRelativeTime(Date.now() - this.receivedAtMs);
    }
  },
);

export type NotificationRowActor = InstanceType<typeof NotificationRow>;
