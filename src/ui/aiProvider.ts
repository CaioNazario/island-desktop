import type { ProviderId, UsageLevel } from '../core/aiUsage.js';
import type { ProviderStatus } from '../system/aiUsage.js';
import { colors, derivedColors } from './tokens.js';

// Nome, ícone e mensagens de cada provedor (specs/12-uso-ia.md "Provedores").
export const PROVIDER_META: Record<ProviderId, { name: string; icon: string }> = {
  claude: { name: 'Claude', icon: 'asterisk-fill' },
  codex: { name: 'Codex', icon: 'open-ai-logo-fill' },
};

export const aiIconName = 'sparkle';

/** Cores por nível (sessão e semanal): barra e texto do %. */
export const LEVEL_COLORS: Record<UsageLevel, { bar: string; text: string }> = {
  normal: { bar: colors.accent, text: colors.text },
  high: { bar: colors.accent300, text: colors.text },
  critical: { bar: derivedColors.alertRed, text: derivedColors.alertText },
};

/** Aviso do cartão em Pango markup; `null` quando não há o que avisar. */
export function statusNotice(id: ProviderId, status: ProviderStatus): string | null {
  const meta = PROVIDER_META[id];
  switch (status) {
    case 'missing':
      return `Faça login no ${meta.name}`;
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
