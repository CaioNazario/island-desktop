import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { EnvironmentSource } from '../system/environments.js';
import { BarButton, type BarButtonActor } from './barButton.js';
import { phosphor } from './icons.js';
import { colors } from './tokens.js';

const DOT = { height: 4, radius: 2, activeWidth: 12, width: 4, gap: 3, animMs: 250 };

function dotStyle(active: boolean): string {
  const color = active ? colors.accent : colors.neutral700;
  return `
    height: ${DOT.height}px;
    border-radius: ${DOT.radius}px;
    background-color: ${color};
    transition-duration: ${DOT.animMs}ms;
  `;
}

// Pontos de ambiente (specs/15-ambientes.md): um por ambiente, o ativo mais
// largo e `accent`. Largura e cor animam em 250ms. Com `onSelect`, cada ponto
// é clicável e vai direto para aquele ambiente.
export const EnvironmentDots = GObject.registerClass(
  class EnvironmentDots extends St.BoxLayout {
    private readonly source: EnvironmentSource;
    private readonly onSelect: ((index: number) => void) | null;
    private dots: St.Widget[] = [];

    constructor(source: EnvironmentSource, onSelect: ((index: number) => void) | null = null) {
      super({ style: `spacing: ${DOT.gap}px;`, y_align: Clutter.ActorAlign.CENTER });
      this.source = source;
      this.onSelect = onSelect;
      this.sync(false);
      const unsubscribe = source.onChange(() => this.sync(true));
      this.connectObject('destroy', () => unsubscribe(), this);
    }

    private sync(animate: boolean): void {
      const count = this.source.environments.length;
      if (count !== this.dots.length) {
        this.destroy_all_children();
        this.dots = Array.from({ length: count }, (_v, index) => this.addDot(index));
        animate = false;
      }
      this.dots.forEach((dot, index) => {
        const active = index === this.source.index;
        const width = active ? DOT.activeWidth : DOT.width;
        dot.style = dotStyle(active);
        if (animate)
          dot.ease({ width, duration: DOT.animMs, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        else dot.width = width;
      });
    }

    private addDot(index: number): St.Widget {
      const dot = new St.Widget({ y_align: Clutter.ActorAlign.CENTER });
      if (!this.onSelect) {
        this.add_child(dot);
        return dot;
      }
      // Área de clique na altura toda do botão: o ponto tem só 4px.
      const button = new St.Button({ child: dot, style: 'padding: 10px 0;' });
      const onSelect = this.onSelect;
      button.connectObject('clicked', () => onSelect(index), button);
      this.add_child(button);
      return dot;
    }
  },
);

export type EnvironmentDotsActor = InstanceType<typeof EnvironmentDots>;

// Conteúdo do modo `env` (specs/15-ambientes.md): ícone 16px `accent-300` ·
// nome 13px/500 · pontos, centralizado com gap 10px.
export const EnvironmentModeRow = GObject.registerClass(
  class EnvironmentModeRow extends St.BoxLayout {
    private readonly source: EnvironmentSource;
    private readonly icon: St.Icon;
    private readonly label: St.Label;

    constructor(source: EnvironmentSource) {
      super({
        style: 'spacing: 10px;',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.source = source;
      this.icon = new St.Icon({
        icon_size: 16,
        style: `color: ${colors.accent300};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.label = new St.Label({
        style: `color: ${colors.text}; font-size: 13px; font-weight: 500;`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.icon);
      this.add_child(this.label);
      this.add_child(new EnvironmentDots(source));
      this.sync();
      const unsubscribe = source.onChange(() => this.sync());
      this.connectObject('destroy', () => unsubscribe(), this);
    }

    private sync(): void {
      const env = this.source.active;
      this.icon.gicon = phosphor(env.icon);
      this.label.text = env.name;
    }
  },
);

// Botão de ambiente, no início da pílula esquerda (specs/15-ambientes.md):
// ícone 14px `accent-300` + pontos, gap 7px. Clique num ponto troca de
// ambiente; o clique no botão é do editor (spec 17).
export function environmentButton(
  source: EnvironmentSource,
  onSelect: (index: number) => void,
  onClick: () => void,
): BarButtonActor {
  const icon = new St.Icon({
    icon_size: 14,
    style: `color: ${colors.accent300};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const content = new St.BoxLayout({ style: 'spacing: 7px;' });
  content.add_child(icon);
  content.add_child(new EnvironmentDots(source, onSelect));
  const button = new BarButton(content, onClick, 'padding: 0 8px;');

  const sync = (): void => {
    icon.gicon = phosphor(source.active.icon);
  };
  sync();
  const unsubscribe = source.onChange(sync);
  button.connectObject('destroy', () => unsubscribe(), button);
  return button;
}
