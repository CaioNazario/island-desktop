import Clutter from 'gi://Clutter';

import type { ScrollInput } from '../core/environments.js';
import type { SwitchDirection } from '../system/environments.js';
import { easeBezier } from './spring.js';

const DISCRETE: Partial<Record<Clutter.ScrollDirection, 'up' | 'down' | 'left' | 'right'>> = {
  [Clutter.ScrollDirection.UP]: 'up',
  [Clutter.ScrollDirection.DOWN]: 'down',
  [Clutter.ScrollDirection.LEFT]: 'left',
  [Clutter.ScrollDirection.RIGHT]: 'right',
};

/**
 * Evento de rolagem → entrada da regra de troca (spike S8). A roda conta só
 * pelos discretos: um `SMOOTH` de roda repetiria o mesmo clique.
 */
export function scrollInput(event: Clutter.Event): ScrollInput | null {
  const direction = event.get_scroll_direction();
  const fromWheel = event.get_scroll_source() === Clutter.ScrollSource.WHEEL;
  if (direction === Clutter.ScrollDirection.SMOOTH) {
    if (fromWheel) return null;
    const [dx, dy] = event.get_scroll_delta();
    const finished = event.get_scroll_finish_flags() !== Clutter.ScrollFinishFlags.NONE;
    return { kind: 'smooth', dx, dy, finished };
  }
  const discrete = DISCRETE[direction];
  return discrete ? { kind: 'discrete', direction: discrete, fromWheel } : null;
}

// Animação da troca (specs/15-ambientes.md): só o conteúdo de widgets das
// duas pílulas se mexe.
const SLIDE = {
  offset: 44,
  outMs: 160,
  inMs: 340,
  fadeInMs: 240,
  bezier: [0.2, 0.9, 0.25, 1] as const,
};

export class WidgetSlide {
  private readonly areas: readonly Clutter.Actor[];
  private sliding = false;

  constructor(areas: readonly Clutter.Actor[]) {
    this.areas = areas;
  }

  /**
   * Sai para `−d·44px` apagando, troca o conteúdo com `swap`, entra de
   * `d·44px`. Uma troca no meio cancela a anterior e parte do estado atual.
   */
  slide(direction: SwitchDirection, swap: () => void): void {
    this.sliding = true;
    this.areas.forEach((area, index) => {
      area.remove_all_transitions();
      area.ease({
        translationX: -direction * SLIDE.offset,
        opacity: 0,
        duration: SLIDE.outMs,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete: index === 0 ? () => this.enter(direction, swap) : undefined,
      });
    });
  }

  /** O conteúdo acompanha o dedo antes da troca; 0 volta ao lugar. */
  drag(px: number): void {
    if (this.sliding) return;
    this.areas.forEach((area) => {
      area.remove_all_transitions();
      if (px !== 0) area.translation_x = px;
      else easeBezier(area, { translationX: 0 }, SLIDE.bezier, { duration: SLIDE.inMs });
    });
  }

  private enter(direction: SwitchDirection, swap: () => void): void {
    swap();
    this.areas.forEach((area, index) => {
      area.translation_x = direction * SLIDE.offset;
      easeBezier(area, { translationX: 0 }, SLIDE.bezier, {
        duration: SLIDE.inMs,
        onComplete: index === 0 ? () => (this.sliding = false) : undefined,
      });
      area.ease({ opacity: 255, duration: SLIDE.fadeInMs, mode: Clutter.AnimationMode.EASE });
    });
  }
}
