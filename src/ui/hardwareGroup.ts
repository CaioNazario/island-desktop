import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
  fittingBlocks,
  WIDEST_VALUE,
  type HardwareBlock,
  type HardwareBlockId,
  type HardwareTone,
} from '../core/hardware.js';
import type { HardwareSource } from '../system/hardware.js';
import { colors, derivedColors, typography } from './tokens.js';

const BLOCK_ORDER: readonly HardwareBlockId[] = ['cpu', 'ram', 'gpu', 'temp', 'net'];

const TONE_COLOR: Record<HardwareTone, string> = {
  normal: colors.text,
  busy: colors.accent300,
  hot: derivedColors.alertRed,
};

// `letter-spacing: .08em` do design, convertido para px no tamanho do rótulo.
const LABEL_LETTER_SPACING = typography.sizes.hardwareLabel * 0.08;

// `line-height: 1` do design: o St usa a altura de linha do Pango (Inter
// 11.5px ocupa 15px), o que deixava o bloco com 29px na pílula de 30. O
// rótulo mede o tamanho da fonte e o texto fica centrado nessa faixa, como no
// navegador; assim o bloco tem 22px e sobra 4px em cima e embaixo.
const TightLabel = GObject.registerClass(
  class TightLabel extends St.Label {
    private readonly lineHeight: number;

    constructor(lineHeight: number, params: Partial<St.Label.ConstructorProps>) {
      super(params);
      this.lineHeight = lineHeight;
      this.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    }

    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      return [this.lineHeight, this.lineHeight];
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      super.vfunc_allocate(box);
      const [, textHeight] = this.clutter_text.get_preferred_height(-1);
      const childBox = new Clutter.ActorBox();
      childBox.set_origin(0, Math.round((this.lineHeight - textHeight) / 2));
      childBox.set_size(box.get_width(), textHeight);
      this.clutter_text.allocate(childBox);
    }
  },
);

const VALUE_STYLE = `
  font-size: ${typography.sizes.md}px;
  font-weight: ${typography.weightLabel};
  font-feature-settings: ${typography.numericFeatureSettings};
`;

// Bloco de duas linhas (specs/10-hardware.md). A largura vem de um rótulo
// invisível com o valor mais largo, sob o valor real no mesmo BinLayout: o
// bloco mede sempre o máximo e a pílula não pula quando o valor oscila.
const HardwareBlockView = GObject.registerClass(
  class HardwareBlockView extends St.BoxLayout {
    private readonly titleLabel: InstanceType<typeof TightLabel>;
    private readonly valueLabel: InstanceType<typeof TightLabel>;

    constructor(id: HardwareBlockId) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'spacing: 2px;',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.titleLabel = new TightLabel(typography.sizes.hardwareLabel, {
        style: `
          font-size: ${typography.sizes.hardwareLabel}px;
          font-weight: ${typography.weightLabel};
          letter-spacing: ${LABEL_LETTER_SPACING}px;
          color: ${colors.neutral500};
        `,
      });
      this.valueLabel = new TightLabel(typography.sizes.md, { x_align: Clutter.ActorAlign.START });
      const valueBox = new St.Widget({ layout_manager: new Clutter.BinLayout() });
      valueBox.add_child(
        new TightLabel(typography.sizes.md, {
          text: WIDEST_VALUE[id],
          opacity: 0,
          style: VALUE_STYLE,
        }),
      );
      valueBox.add_child(this.valueLabel);
      this.add_child(this.titleLabel);
      this.add_child(valueBox);
    }

    display(block: HardwareBlock): void {
      this.titleLabel.text = block.label;
      this.valueLabel.text = block.value;
      this.valueLabel.style = `${VALUE_STYLE} color: ${TONE_COLOR[block.tone]};`;
      this.visible = true;
    }
  },
);

type HardwareBlockViewActor = InstanceType<typeof HardwareBlockView>;

const GAP = 10;

// Grupo de hardware da pílula direita (specs/02-barra.md, item 1): encostado
// à esquerda, padding 0 10px, gap 10px. Bloco sem leitura (sem GPU ou sensor,
// ou antes da segunda amostra) fica escondido. Sem espaço com a ilha no maior
// modo, somem NET → GPU → TEMP; o corte usa essa largura e não a atual para
// os blocos não piscarem quando a ilha abre e fecha. Bloco cortado é alocado
// depois da borda e some pelo clip, sem mexer em `visible` dentro do allocate.
export const HardwareGroup = GObject.registerClass(
  class HardwareGroup extends St.Widget {
    /** Quanto o grupo está mais largo do que ficaria com a ilha no maior modo. */
    slack = 0;
    private readonly views = new Map<HardwareBlockId, HardwareBlockViewActor>();

    constructor(source: HardwareSource) {
      super({
        style: 'padding: 0 10px;',
        clip_to_allocation: true,
        x_expand: true,
        // FILL: o allocate precisa da vaga inteira para medir o espaço; com
        // START a alocação vira a largura natural e o corte tira tudo.
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.CENTER,
      });
      for (const id of BLOCK_ORDER) {
        const view = new HardwareBlockView(id);
        view.visible = false;
        this.views.set(id, view);
        this.add_child(view);
      }
      const sync = (): void => this.sync(source.blocks);
      sync();
      const unsubscribe = source.onChange(sync);
      this.connectObject('destroy', () => unsubscribe(), this);
    }

    override vfunc_get_preferred_width(_forHeight: number): [number, number] {
      const ids = this.readingIds();
      const min = this.rowWidth(fittingBlocks(ids, (id) => this.widthOf(id), 0, GAP));
      const natural = this.rowWidth(ids);
      return this.get_theme_node().adjust_preferred_width(min, natural);
    }

    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      let height = 0;
      for (const id of this.readingIds()) {
        height = Math.max(height, this.views.get(id)!.get_preferred_height(-1)[1]);
      }
      return this.get_theme_node().adjust_preferred_height(height, height);
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);
      const content = this.get_theme_node().get_content_box(box);
      const ids = this.readingIds();
      const budget = content.get_width() - this.slack;
      const shown = new Set(fittingBlocks(ids, (id) => this.widthOf(id), budget, GAP));
      const childBox = new Clutter.ActorBox();
      let x = content.x1;
      for (const id of ids) {
        const view = this.views.get(id)!;
        const [, width] = view.get_preferred_width(-1);
        const [, height] = view.get_preferred_height(width);
        childBox.x1 = shown.has(id) ? x : box.get_width();
        childBox.x2 = childBox.x1 + width;
        childBox.y1 = Math.round(content.y1 + (content.get_height() - height) / 2);
        childBox.y2 = childBox.y1 + height;
        view.allocate(childBox);
        if (shown.has(id)) x += width + GAP;
      }
    }

    private readingIds(): HardwareBlockId[] {
      return BLOCK_ORDER.filter((id) => this.views.get(id)!.visible);
    }

    private widthOf(id: HardwareBlockId): number {
      return this.views.get(id)!.get_preferred_width(-1)[1];
    }

    private rowWidth(ids: readonly HardwareBlockId[]): number {
      const blocks = ids.reduce((sum, id) => sum + this.widthOf(id), 0);
      return blocks + GAP * Math.max(0, ids.length - 1);
    }

    private sync(blocks: readonly HardwareBlock[]): void {
      const byId = new Map(blocks.map((block) => [block.id, block]));
      for (const [id, view] of this.views) {
        const block = byId.get(id);
        if (block) view.display(block);
        else view.visible = false;
      }
    }
  },
);

export type HardwareGroupActor = InstanceType<typeof HardwareGroup>;
