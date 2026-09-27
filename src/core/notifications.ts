// Roteamento de notificação nova e tempo relativo (specs/04-notificacoes.md;
// design/logic.js `pushNotif`, ~136).

import type { Mode } from './island.js';

/** `list`: só entra na lista, sem abrir `notif` nem banner. */
export type NotificationRoute = 'notif' | 'stack' | 'banner' | 'list';

export interface IncomingNotification {
  critical: boolean;
  low: boolean;
  /** Já reconhecida pelo Shell ao chegar (ex.: app residente com foco). */
  acknowledged: boolean;
  /** `showBanners` da política da fonte: "Não perturbe" + a opção por app. */
  bannersAllowed: boolean;
}

export interface IslandSnapshot {
  mode: Mode;
  cardOpen: boolean;
}

// O Shell nunca mostra banner de notificação já reconhecida nem de urgência
// baixa (`_onNotificationRequestBanner`, js/ui/messageTray.js, 50.4).
function onlyInList(notification: IncomingNotification): boolean {
  if (notification.acknowledged || notification.low) return true;
  return !notification.bannersAllowed && !notification.critical;
}

export function routeNotification(
  notification: IncomingNotification,
  island: IslandSnapshot,
): NotificationRoute {
  if (onlyInList(notification)) return 'list';
  if (island.cardOpen) return 'banner';
  if (island.mode === 'compact' || island.mode === 'notif') return 'notif';
  if (island.mode === 'stack') return 'stack';
  return 'banner';
}

const MINUTE_MS = 60_000;

export function formatRelativeTime(elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / MINUTE_MS);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
}
