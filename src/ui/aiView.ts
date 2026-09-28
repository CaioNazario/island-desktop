import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
  formatPercent,
  formatSessionReset,
  formatWeeklyReset,
  type ProviderId,
  type UsageWindow,
  usageLevel,
} from '../core/aiUsage.js';
import type { AiUsageSource, ProviderSnapshot } from '../system/aiUsage.js';
import { phosphor } from './icons.js';
import { aiIconName, LEVEL_COLORS, PROVIDER_META, statusNotice } from './aiProvider.js';
import { colors } from './tokens.js';

// Medidas de specs/12-uso-ia.md "Modo `ai`". A altura do cartão fecha a conta
// do `getSize('ai')`: 108 por provedor = cartão 102 + gap 6.
const MODE_PADDING = { y: 12, x: 14 };
const CARD_PADDING = { top: 10, x: 10, bottom: 12 };
const CARD_HEIGHT = 102;
const COLUMN_GAP = 14;
// Camada 478 (480 menos o anel) − padding do modo − padding do cartão − gap.
const COLUMN_WIDTH = (478 - 2 * MODE_PADDING.x - 2 * CARD_PADDING.x - COLUMN_GAP) / 2;
const BAR_HEIGHT = 4;
const SESSION_FILL_MS = 600;

type WindowKind = 'session' | 'weekly';

// Uma coluna: "Sessão · 5h" / "Semanal" com o % à direita, barra 4px e
// "Reinicia {quando}".
const UsageColumn = GObject.registerClass(
  class UsageColumn extends St.BoxLayout {
    private readonly kind: WindowKind;
    private readonly percentLabel: St.Label;
    private readonly fill: St.Widget;
    private readonly resetLabel: St.Label;
    private window: UsageWindow | null = null;

    constructor(kind: WindowKind) {
      super({ orientation: Clutter.Orientation.VERTICAL, width: COLUMN_WIDTH });
      this.kind = kind;

      const header = new St.BoxLayout({ style: 'font-size: 11px; margin-bottom: 5px;' });
      header.add_child(
        new St.Label({
          text: kind === 'session' ? 'Sessão · 5h' : 'Semanal',
          style: `color: ${colors.neutral400};`,
          x_expand: true,
        }),
      );
      this.percentLabel = new St.Label({ style: 'font-weight: 500;' });
      header.add_child(this.percentLabel);
      this.add_child(header);

      const track = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        style: `background-color: ${colors.neutral800}; border-radius: 2px;`,
        height: BAR_HEIGHT,
      });
      this.fill = new St.Widget({
        width: 0,
        height: BAR_HEIGHT,
        x_align: Clutter.ActorAlign.START,
      });
      track.add_child(this.fill);
      this.add_child(track);

      this.resetLabel = new St.Label({
        style: `font-size: 10.5px; color: ${colors.neutral500}; margin-top: 5px;`,
      });
      this.add_child(this.resetLabel);
    }

    display(window: UsageWindow | null): void {
      this.window = window;
      const percent = window?.percent ?? 0;
      const level = LEVEL_COLORS[usageLevel(percent)];
      this.percentLabel.text = window ? formatPercent(percent) : '—';
      this.percentLabel.style = `font-weight: 500; color: ${window ? level.text : colors.neutral500};`;
      this.fill.style = `background-color: ${level.bar}; border-radius: 2px;`;
      const width = Math.round((COLUMN_WIDTH * percent) / 100);
      // Só a barra da sessão anima no design.
      if (this.kind === 'session')
        this.fill.ease({ width, duration: SESSION_FILL_MS, mode: Clutter.AnimationMode.EASE });
      else this.fill.width = width;
      this.refreshTime();
    }

    /** "Reinicia em 2h 14min" anda com o relógio. */
    refreshTime(): void {
      const resetsAt = this.window?.resetsAt ?? null;
      if (resetsAt === null) {
        this.resetLabel.text = '';
        return;
      }
      const when =
        this.kind === 'session'
          ? formatSessionReset(resetsAt, Date.now())
          : formatWeeklyReset(resetsAt);
      this.resetLabel.text = `Reinicia ${when}`;
    }
  },
);

type UsageColumnActor = InstanceType<typeof UsageColumn>;

// Cartão por provedor: topo (ícone, nome, plano e aviso) e duas colunas.
// Sem credencial, o aviso fica no lugar das colunas.
const ProviderCard = GObject.registerClass(
  class ProviderCard extends St.BoxLayout {
    private readonly id: ProviderId;
    private readonly planChip: St.Label;
    private readonly topNotice: St.Label;
    private readonly columns: St.BoxLayout;
    private readonly session: UsageColumnActor;
    private readonly weekly: UsageColumnActor;
    private readonly missingNotice: St.Label;

    constructor(id: ProviderId) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `
          padding: ${CARD_PADDING.top}px ${CARD_PADDING.x}px ${CARD_PADDING.bottom}px;
          border-radius: 14px;
          background-color: ${colors.neutral900};
        `,
        height: CARD_HEIGHT,
      });
      this.id = id;
      const meta = PROVIDER_META[id];

      const top = new St.BoxLayout({ style: 'spacing: 10px; margin-bottom: 10px;' });
      const iconBlock = new St.Bin({
        style: `width: 28px; height: 28px; border-radius: 8px; background-color: ${colors.accent900};`,
        child: new St.Icon({
          gicon: phosphor(meta.icon),
          icon_size: 16,
          style: `color: ${colors.accent300};`,
        }),
      });
      top.add_child(iconBlock);
      top.add_child(
        new St.Label({
          text: meta.name,
          style: `font-size: 13px; font-weight: 500; color: ${colors.text};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.planChip = new St.Label({
        style: `
          font-size: 10.5px;
          padding: 1px 7px;
          border-radius: 8px;
          border: 1px solid ${colors.neutral700};
          color: ${colors.neutral300};
        `,
        y_align: Clutter.ActorAlign.CENTER,
      });
      top.add_child(this.planChip);
      this.topNotice = new St.Label({
        style: `font-size: 10.5px; color: ${colors.neutral500};`,
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
      });
      top.add_child(this.topNotice);
      this.add_child(top);

      this.columns = new St.BoxLayout({ style: `spacing: ${COLUMN_GAP}px;` });
      this.session = new UsageColumn('session');
      this.weekly = new UsageColumn('weekly');
      this.columns.add_child(this.session);
      this.columns.add_child(this.weekly);
      this.add_child(this.columns);

      this.missingNotice = new St.Label({
        style: `font-size: 11px; color: ${colors.neutral400};`,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.missingNotice);
    }

    display(provider: ProviderSnapshot): void {
      const notice = statusNotice(this.id, provider.status);
      const missing = provider.status === 'missing';
      this.planChip.text = provider.plan ?? '';
      this.planChip.visible = provider.plan !== null;
      this.columns.visible = !missing;
      this.missingNotice.visible = missing;
      this.topNotice.visible = !missing && notice !== null;
      const target = missing ? this.missingNotice : this.topNotice;
      if (notice) target.clutter_text.set_markup(notice);
      if (missing) return;
      this.session.display(provider.usage?.session ?? null);
      this.weekly.display(provider.usage?.weekly ?? null);
    }

    refreshTime(): void {
      this.session.refreshTime();
      this.weekly.refreshTime();
    }
  },
);

type ProviderCardActor = InstanceType<typeof ProviderCard>;

export interface AiModeViewOptions {
  /** O número de provedores mudou: a ilha refaz a altura. */
  onSizeChanged: () => void;
}

// Modo `ai` (specs/12-uso-ia.md): cabeçalho + um cartão por provedor ligado.
export const AiModeView = GObject.registerClass(
  class AiModeView extends St.BoxLayout {
    private readonly source: AiUsageSource;
    private readonly options: AiModeViewOptions;
    private readonly summary: St.Label;
    private readonly cards: ReadonlyMap<ProviderId, ProviderCardActor>;
    private readonly unsubscribe: () => void;
    private shownCount = 0;

    constructor(source: AiUsageSource, options: AiModeViewOptions) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: `padding: ${MODE_PADDING.y}px ${MODE_PADDING.x}px; spacing: 6px;`,
        x_expand: true,
        y_expand: true,
      });
      this.source = source;
      this.options = options;

      const header = new St.BoxLayout({ style: 'height: 26px; padding: 0 4px; spacing: 8px;' });
      header.add_child(
        new St.Icon({
          gicon: phosphor(aiIconName),
          icon_size: 14,
          style: `color: ${colors.neutral300};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      header.add_child(
        new St.Label({
          text: 'Uso de IA',
          style: `font-size: 13px; font-weight: 500; color: ${colors.text};`,
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );
      this.summary = new St.Label({
        style: `font-size: 11px; color: ${colors.neutral500};`,
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
      });
      header.add_child(this.summary);
      this.add_child(header);

      const cards = new Map<ProviderId, ProviderCardActor>();
      for (const id of Object.keys(PROVIDER_META) as ProviderId[]) {
        const card = new ProviderCard(id);
        cards.set(id, card);
        this.add_child(card);
      }
      this.cards = cards;

      this.unsubscribe = source.onChange(() => this.sync());
      this.connectObject('destroy', () => this.unsubscribe(), this);
      // A ilha ainda não guardou esta view: sem `onSizeChanged` aqui.
      this.shownCount = source.providers.length;
      this.sync();
    }

    /** Provedores ligados: a altura do modo depende deles. */
    get providerCount(): number {
      return this.shownCount;
    }

    /** O modo abriu: atualiza quem tem cache com mais de 60s. */
    onOpen(): void {
      this.source.refreshIfStale();
    }

    refreshTimes(): void {
      for (const card of this.cards.values()) if (card.visible) card.refreshTime();
    }

    private sync(): void {
      const providers = this.source.providers;
      for (const [id, card] of this.cards) {
        const provider = providers.find((p) => p.id === id);
        card.visible = provider !== undefined;
        if (provider) card.display(provider);
      }
      const connected = providers.filter((p) => p.status !== 'missing').length;
      this.summary.text = `${connected} ${connected === 1 ? 'conectado' : 'conectados'}`;
      if (providers.length !== this.shownCount) {
        this.shownCount = providers.length;
        this.options.onSizeChanged();
      }
    }
  },
);

export type AiModeViewActor = InstanceType<typeof AiModeView>;
