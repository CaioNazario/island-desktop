import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
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

// Grupo de hardware da pílula direita (specs/02-barra.md, item 1): encostado
// à esquerda, padding 0 10px, gap 10px. Bloco sem leitura (sem GPU ou sensor,
// ou antes da segunda amostra) fica escondido.
export const HardwareGroup = GObject.registerClass(
  class HardwareGroup extends St.BoxLayout {
    private readonly views = new Map<HardwareBlockId, HardwareBlockViewActor>();

    constructor(source: HardwareSource) {
      super({
        style: 'spacing: 10px; padding: 0 10px;',
        x_expand: true,
        x_align: Clutter.ActorAlign.START,
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
