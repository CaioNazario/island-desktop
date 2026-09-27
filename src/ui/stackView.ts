import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { NotificationEntry, NotificationFeed } from '../system/notifications.js';
import { notificationFallbackIconName, phosphor, silentBellIconName } from './icons.js';
import { NotificationRow, type NotificationRowActor } from './notificationRow.js';
import { colors } from './tokens.js';

const FLASH_MS = 2500;
const FLASH_TRANSITION_MS = 600;

export interface StackViewOptions {
  /** A contagem mudou: a altura de `stack` depende dela (specs/03-ilha.md). */
  onSizeChanged: () => void;
  /** Clique num item: fecha a ilha antes da ação padrão, para o app receber o foco. */
  onActivate: (entry: NotificationEntry) => void;
}

function header(count: St.Label, clearButton: St.Button): St.BoxLayout {
  const box = new St.BoxLayout({
    style: 'spacing: 8px; height: 28px; padding: 0 6px; margin-bottom: 4px;',
  });
  const bell = new St.Icon({
    gicon: phosphor(notificationFallbackIconName),
    icon_size: 14,
    style: `color: ${colors.neutral300};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const title = new St.Label({
    text: 'Notificações',
    style: 'font-size: 13px; font-weight: 500;',
    y_align: Clutter.ActorAlign.CENTER,
  });
  box.add_child(bell);
  box.add_child(title);
  box.add_child(count);
  box.add_child(new St.Widget({ x_expand: true }));
  box.add_child(clearButton);
  return box;
}

function countChip(): St.Label {
  return new St.Label({
    style: `
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 9px;
      background-color: ${colors.neutral900};
      color: ${colors.neutral300};
    `,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

function clearAllButton(onClick: () => void): St.Button {
  const button = new St.Button({
    label: 'Limpar tudo',
    track_hover: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const refresh = (): void => {
    const bg = button.hover ? colors.neutral800 : colors.neutral900;
    button.style = `
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      background-color: ${bg};
      color: ${colors.neutral300};
      font-size: 11px;
    `;
  };
  button.connectObject('notify::hover', refresh, 'clicked', () => onClick(), button);
  refresh();
  return button;
}

function emptyState(): St.BoxLayout {
  const box = new St.BoxLayout({
    style: `spacing: 8px; height: 72px; color: ${colors.neutral500};`,
    x_align: Clutter.ActorAlign.CENTER,
  });
  box.add_child(
    new St.Icon({
      gicon: phosphor(silentBellIconName),
      icon_size: 16,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  box.add_child(
    new St.Label({
      text: 'Nenhuma notificação',
      style: 'font-size: 12.5px;',
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  return box;
}

// Item da lista: 50px, raio 12, padding 0 6px, hover `neutral-900`; a
// notificação nova fica em `accent-900` por 2500ms.
interface StackItem {
  actor: St.Button;
  row: NotificationRowActor;
  /** Reaplica o fundo (hover/destaque) com a transição de 600ms. */
  refresh: () => void;
}

function stackItem(
  entry: NotificationEntry,
  flashing: () => boolean,
  onActivate: () => void,
): StackItem {
  const row: NotificationRowActor = new NotificationRow(
    {
      blockSize: 32,
      blockRadius: 9,
      iconSize: 18,
      closeSize: 22,
      closeIconSize: 11,
      closeFilled: false,
      gap: 12,
    },
    () => entry.dismiss(),
  );
  row.setEntry(entry);
  const item = new St.Button({ child: row, track_hover: true, x_expand: true });
  const refresh = (): void => {
    let bg = 'transparent';
    if (item.hover) bg = colors.neutral900;
    else if (flashing()) bg = colors.accent900;
    item.style = `
      height: 50px;
      padding: 0 6px;
      border-radius: 12px;
      background-color: ${bg};
      transition-duration: ${FLASH_TRANSITION_MS}ms;
    `;
  };
  item.connectObject('notify::hover', refresh, 'clicked', () => onActivate(), item);
  refresh();
  return { actor: item, row, refresh };
}

// Modo `stack` (specs/04-notificacoes.md): as 8 mais recentes, 6 visíveis
// com rolagem. A lista é redesenhada a cada mudança do feed; são no máximo 8.
export const StackView = GObject.registerClass(
  class StackView extends St.BoxLayout {
    private readonly feed: NotificationFeed;
    private readonly options: StackViewOptions;
    private readonly countLabel: St.Label;
    private readonly clearButton: St.Button;
    private readonly list: St.BoxLayout;
    private readonly scroll: St.ScrollView;
    private readonly empty: St.BoxLayout;
    private readonly unsubscribe: () => void;
    private items: StackItem[] = [];
    private shownCount: number;
    private flashKey: object | null = null;
    private flashTimerId: number | null = null;

    constructor(feed: NotificationFeed, options: StackViewOptions) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'padding: 12px;',
        x_expand: true,
        y_expand: true,
      });
      this.feed = feed;
      this.options = options;

      this.countLabel = countChip();
      this.clearButton = clearAllButton(() => this.feed.clearAll());
      this.add_child(header(this.countLabel, this.clearButton));

      this.list = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 2px;',
        x_expand: true,
      });
      this.scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
        child: this.list,
      });
      this.add_child(this.scroll);
      this.empty = emptyState();
      this.add_child(this.empty);

      // Já com a contagem inicial: `onSizeChanged` não dispara durante a
      // construção da ilha, antes de ela ter as camadas.
      this.shownCount = feed.entries.length;
      this.unsubscribe = feed.onChange(() => this.sync());
      this.connectObject('destroy', () => this.onDestroy(), this);
      this.sync();
    }

    get itemCount(): number {
      return this.shownCount;
    }

    /** Notificação nova com a lista aberta: entra no topo destacada. */
    flash(entry: NotificationEntry): void {
      this.clearFlashTimer();
      this.flashKey = entry.key;
      this.flashTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FLASH_MS, () => {
        this.flashTimerId = null;
        this.flashKey = null;
        this.items.forEach((item) => item.refresh());
        return GLib.SOURCE_REMOVE;
      });
      this.items.forEach((item) => item.refresh());
    }

    refreshTimes(): void {
      this.items.forEach((item) => item.row.refreshTime());
    }

    private sync(): void {
      const entries = this.feed.entries;
      this.items.forEach((item) => item.actor.destroy());
      this.items = entries.map((entry) =>
        stackItem(
          entry,
          () => entry.key === this.flashKey,
          () => this.options.onActivate(entry),
        ),
      );
      this.items.forEach((item) => this.list.add_child(item.actor));

      this.countLabel.text = String(entries.length);
      this.clearButton.visible = entries.length > 0;
      this.scroll.visible = entries.length > 0;
      this.empty.visible = entries.length === 0;

      if (entries.length === this.shownCount) return;
      this.shownCount = entries.length;
      this.options.onSizeChanged();
    }

    private clearFlashTimer(): void {
      if (this.flashTimerId === null) return;
      GLib.Source.remove(this.flashTimerId);
      this.flashTimerId = null;
    }

    private onDestroy(): void {
      this.unsubscribe();
      this.clearFlashTimer();
    }
  },
);

export type StackViewActor = InstanceType<typeof StackView>;
