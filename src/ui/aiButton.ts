import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { formatPercent, type ProviderId, usageLevel, usageTooltip } from '../core/aiUsage.js';
import type { AiUsageSource, ProviderSnapshot } from '../system/aiUsage.js';
import { BarButton } from './barButton.js';
import { phosphor } from './icons.js';
import { aiIconName, LEVEL_COLORS, PROVIDER_META } from './aiProvider.js';
import { colors } from './tokens.js';
import { Tooltip } from './tooltip.js';

const MINI_BAR = { width: 26, height: 4, radius: 2 };
const FILL_MS = 600;
const PERCENT_STYLE = 'font-size: 11.5px; font-weight: 500; font-feature-settings: "tnum";';

// Um provedor no botão (gap 6px): ícone 13px · mini barra 26×4 com a sessão ·
// % alinhado à direita em largura fixa.
const ProviderItem = GObject.registerClass(
  class ProviderItem extends St.BoxLayout {
    private readonly fill: St.Widget;
    private readonly percentLabel: St.Label;
    private readonly tooltip: Tooltip;
    private readonly providerName: string;

    constructor(id: ProviderId) {
      // `reactive` só para o hover do tooltip; o clique sobe para o botão.
      super({
        style: 'spacing: 6px;',
        reactive: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.providerName = PROVIDER_META[id].name;
      this.tooltip = new Tooltip(this);
      this.add_child(
        new St.Icon({
          gicon: phosphor(PROVIDER_META[id].icon),
          icon_size: 13,
          style: `color: ${colors.neutral300};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );

      const track = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        style: `background-color: ${colors.neutral800}; border-radius: ${MINI_BAR.radius}px;`,
        width: MINI_BAR.width,
        height: MINI_BAR.height,
        y_align: Clutter.ActorAlign.CENTER,
      });
      // Posição fixa em vez de `x_expand`: o BinLayout só respeita o `x_align`
      // de filho que expande, e o expand subiria até esticar o botão na pílula.
      this.fill = new St.Widget({
        width: 0,
        height: MINI_BAR.height,
        x: 0,
      });
      track.add_child(this.fill);
      this.add_child(track);

      // Largura do "100%" com dígitos tabulares: o botão não pula quando o % muda.
      const percentBox = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        y_align: Clutter.ActorAlign.CENTER,
      });
      percentBox.add_child(new St.Label({ text: '100%', opacity: 0, style: PERCENT_STYLE }));
      this.percentLabel = new St.Label({ x_align: Clutter.ActorAlign.END, style: PERCENT_STYLE });
      percentBox.add_child(this.percentLabel);
      this.add_child(percentBox);
    }

    display(provider: ProviderSnapshot): void {
      const session = provider.status === 'missing' ? null : provider.usage?.session;
      const level = LEVEL_COLORS[usageLevel(session?.percent ?? 0)];
      this.percentLabel.text = session ? formatPercent(session.percent) : '—';
      this.percentLabel.style = `${PERCENT_STYLE} color: ${session ? level.text : colors.neutral500};`;
      this.fill.style = `background-color: ${level.bar}; border-radius: ${MINI_BAR.radius}px;`;
      this.fill.ease({
        width: Math.round((MINI_BAR.width * (session?.percent ?? 0)) / 100),
        duration: FILL_MS,
        mode: Clutter.AnimationMode.EASE,
      });
      this.tooltip.text = usageTooltip(
        this.providerName,
        provider.status === 'missing' ? null : provider.usage,
      );
    }
  },
);

type ProviderItemActor = InstanceType<typeof ProviderItem>;

// Botão de IA na pílula esquerda (specs/12-uso-ia.md): padding 0 10px, gap
// 12px entre provedores. Sem provedor ligado, `sparkle` + "IA".
export const AiButton = GObject.registerClass(
  class AiButton extends BarButton {
    private readonly source: AiUsageSource;
    private readonly items: ReadonlyMap<ProviderId, ProviderItemActor>;
    private readonly placeholder: St.BoxLayout;
    private readonly unsubscribe: () => void;

    constructor(source: AiUsageSource, onClick: () => void) {
      const content = new St.BoxLayout({ style: 'spacing: 12px;' });
      super(content, onClick, 'padding: 0 10px;');
      this.source = source;

      const items = new Map<ProviderId, ProviderItemActor>();
      for (const id of Object.keys(PROVIDER_META) as ProviderId[]) {
        const item = new ProviderItem(id);
        items.set(id, item);
        content.add_child(item);
      }
      this.items = items;

      this.placeholder = new St.BoxLayout({
        style: `spacing: 6px; font-size: 12px; color: ${colors.neutral400};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.placeholder.add_child(
        new St.Icon({
          gicon: phosphor(aiIconName),
          icon_size: 14,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.placeholder.add_child(new St.Label({ text: 'IA', y_align: Clutter.ActorAlign.CENTER }));
      content.add_child(this.placeholder);

      this.unsubscribe = source.onChange(() => this.sync());
      this.connectObject('destroy', () => this.unsubscribe(), this);
      this.sync();
    }

    private sync(): void {
      const providers = this.source.providers;
      for (const [id, item] of this.items) {
        const provider = providers.find((p) => p.id === id);
        item.visible = provider !== undefined;
        if (provider) item.display(provider);
      }
      this.placeholder.visible = providers.length === 0;
    }
  },
);

export type AiButtonActor = InstanceType<typeof AiButton>;
