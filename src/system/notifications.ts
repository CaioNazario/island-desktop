import type Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { notificationText, type IncomingNotification } from '../core/notifications.js';

/** Quantas a lista mostra (specs/04-notificacoes.md "Modo `stack`"). */
const SHOWN_LIMIT = 8;

export interface NotificationEntry {
  /** Identidade estável entre leituras de `entries` (a notificação do Shell). */
  readonly key: object;
  readonly appName: string;
  readonly text: string;
  readonly appIcon: Gio.Icon | null;
  readonly receivedAtMs: number;
  /** Ação padrão (abre/foca o app ou site) e sai da lista. */
  activate(): void;
  dismiss(): void;
}

export interface NotificationFeed {
  /** As mais recentes primeiro, até 8. */
  readonly entries: readonly NotificationEntry[];
  readonly hasUnread: boolean;
  markAllRead(): void;
  clearAll(): void;
  /** Chegada (ou atualização no lugar) que pede atenção, como um banner nativo pediria. */
  onArrival(
    callback: (entry: NotificationEntry, incoming: IncomingNotification) => void,
  ): () => void;
  /** A lista ou o estado de não lido mudou. */
  onChange(callback: () => void): () => void;
}

// Fila de banners pendentes da MessageTray (js/ui/messageTray.js, 50.4).
// Não tem API pública para esvaziar.
interface MessageTrayQueue {
  _notificationQueue: MessageTray.Notification[];
}

function toEntry(notification: MessageTray.Notification): NotificationEntry {
  const source = notification.source;
  const appName = source?.title ?? '';
  return {
    key: notification,
    appName,
    text: notificationText(
      appName,
      notification.title ?? '',
      notification.body ?? '',
      notification.useBodyMarkup,
    ),
    appIcon: source?.icon ?? null,
    receivedAtMs: notification.datetime.to_unix() * 1000,
    activate: () => {
      notification.activate();
      // Residente sobrevive ao `activate()` no Shell; a spec tira da lista.
      if (source?.notifications.includes(notification)) notification.destroy();
    },
    dismiss: () => notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED),
  };
}

function toIncoming(notification: MessageTray.Notification): IncomingNotification {
  return {
    critical: notification.urgency === MessageTray.Urgency.CRITICAL,
    low: notification.urgency === MessageTray.Urgency.LOW,
    acknowledged: notification.acknowledged,
    bannersAllowed: notification.source?.policy.showBanners ?? true,
  };
}

// Notificações via `Main.messageTray` (specs/04-notificacoes.md "Fonte"): a
// Island é só uma view, sem cópia própria, e o histórico sobrevive ao lock.
// Os banners nativos ficam bloqueados enquanto a instância existe.
export class SystemNotifications implements NotificationFeed {
  private readonly sources = new Set<MessageTray.Source>();
  private readonly arrivalListeners = new Set<
    (entry: NotificationEntry, incoming: IncomingNotification) => void
  >();
  private readonly changeListeners = new Set<() => void>();

  constructor() {
    // Mesmo setter que o menu de data usa enquanto está aberto (js/ui/panel.js).
    Main.messageTray.bannerBlocked = true;
    Main.messageTray.connectObject(
      'source-added',
      (_tray: MessageTray.MessageTray, source: MessageTray.Source) => this.trackSource(source),
      'source-removed',
      (_tray: MessageTray.MessageTray, source: MessageTray.Source) => this.untrackSource(source),
      this,
    );
    Main.messageTray.getSources().forEach((source) => this.trackSource(source));
  }

  get entries(): readonly NotificationEntry[] {
    return this.allNotifications()
      .sort((a, b) => b.datetime.to_unix() - a.datetime.to_unix())
      .slice(0, SHOWN_LIMIT)
      .map(toEntry);
  }

  get hasUnread(): boolean {
    return this.allNotifications().some((notification) => !notification.acknowledged);
  }

  markAllRead(): void {
    this.allNotifications().forEach((notification) => (notification.acknowledged = true));
  }

  clearAll(): void {
    this.allNotifications().forEach((notification) =>
      notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED),
    );
  }

  onArrival(
    callback: (entry: NotificationEntry, incoming: IncomingNotification) => void,
  ): () => void {
    this.arrivalListeners.add(callback);
    return () => this.arrivalListeners.delete(callback);
  }

  onChange(callback: () => void): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  destroy(): void {
    Main.messageTray.disconnectObject(this);
    [...this.sources].forEach((source) => this.untrackSource(source));
    this.arrivalListeners.clear();
    this.changeListeners.clear();
    // Sem isso, o que chegou com a Island ativa pularia de uma vez como
    // banner nativo velho ao desbloquear.
    (Main.messageTray as unknown as MessageTrayQueue)._notificationQueue.splice(0);
    Main.messageTray.bannerBlocked = false;
  }

  private allNotifications(): MessageTray.Notification[] {
    return [...this.sources].flatMap((source) => [...source.notifications]);
  }

  private trackSource(source: MessageTray.Source): void {
    if (this.sources.has(source)) return;
    this.sources.add(source);
    source.connectObject(
      'notification-added',
      (_source: MessageTray.Source, notification: MessageTray.Notification) =>
        this.trackNotification(notification),
      'notification-request-banner',
      (_source: MessageTray.Source, notification: MessageTray.Notification) =>
        this.announce(notification),
      this,
    );
    source.notifications.forEach((notification) => this.trackNotification(notification));
    this.notifyChange();
  }

  private untrackSource(source: MessageTray.Source): void {
    if (!this.sources.delete(source)) return;
    source.disconnectObject(this);
    source.notifications.forEach((notification) => notification.disconnectObject(this));
    this.notifyChange();
  }

  private trackNotification(notification: MessageTray.Notification): void {
    notification.connectObject(
      // Título, corpo, `acknowledged` e `datetime` mudam no lugar.
      'notify',
      () => this.notifyChange(),
      'destroy',
      () => {
        notification.disconnectObject(this);
        this.notifyChange();
      },
      this,
    );
    this.notifyChange();
  }

  private announce(notification: MessageTray.Notification): void {
    const entry = toEntry(notification);
    const incoming = toIncoming(notification);
    this.arrivalListeners.forEach((callback) => callback(entry, incoming));
  }

  private notifyChange(): void {
    this.changeListeners.forEach((callback) => callback());
  }
}
