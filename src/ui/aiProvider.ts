import type { ProviderId, UsageLevel } from '../core/aiUsage.js';
import type { ProviderStatus } from '../system/aiUsage.js';
import { colors, derivedColors } from './tokens.js';

// Nome, ícone e mensagens de cada provedor (specs/12-uso-ia.md "Provedores").
export const PROVIDER_META: Record<ProviderId, { name: string; icon: string; login: string }> = {
  claude: { name: 'Claude', icon: 'asterisk-fill', login: 'claude' },
  codex: { name: 'Codex', icon: 'open-ai-logo-fill', login: 'codex login' },
};

export const aiIconName = 'sparkle';

/** Cores por nível (sessão e semanal): barra e texto do %. */
export const LEVEL_COLORS: Record<UsageLevel, { bar: string; text: string }> = {
  normal: { bar: colors.accent, text: colors.text },
  high: { bar: colors.accent300, text: colors.text },
  critical: { bar: derivedColors.alertRed, text: derivedColors.alertText },
};

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Aviso do cartão em Pango markup; `null` quando não há o que avisar. */
export function statusNotice(id: ProviderId, status: ProviderStatus): string | null {
  const meta = PROVIDER_META[id];
  switch (status) {
    case 'missing':
      return `Rode <span font_family="monospace">${escape(meta.login)}</span> para entrar`;
    case 'expired':
      return `Abra o ${id === 'claude' ? 'Claude Code' : meta.name} para renovar`;
    case 'offline':
      return 'Sem conexão';
    case 'error':
      return 'Resposta inesperada';
    case 'loading':
    case 'ok':
      return null;
  }
}
