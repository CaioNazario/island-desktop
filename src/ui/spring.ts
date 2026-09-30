import type Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

import { effects } from './tokens.js';

type EaseParams = Omit<Parameters<Clutter.Actor['ease']>[0], 'mode'>;

export type Bezier = readonly [number, number, number, number];

// O `ease()` só aceita um `AnimationMode`, então a curva vai direto nas
// transições que ele acabou de criar (js/ui/environment.js `_easeActor`,
// gnome-shell 50.4: remove e recria uma por propriedade).
export function easeBezier(
  actor: Clutter.Actor,
  props: Record<string, number>,
  bezier: Bezier,
  params: EaseParams,
): void {
  actor.ease({ ...params, ...props });
  const [x1, y1, x2, y2] = bezier;
  const c1 = new Graphene.Point({ x: x1, y: y1 });
  const c2 = new Graphene.Point({ x: x2, y: y2 });
  // A transição tem o nome da `GParamSpec`: `translationY` → `translation-y`.
  for (const name of Object.keys(props))
    actor
      .get_transition(name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
      ?.set_cubic_bezier_progress(c1, c2);
}

// Mola da ilha, `cubic-bezier(.3,1.2,.4,1)` (specs/01-design-tokens.md): passa
// ~1,25% do alvo.
export function easeSpring(
  actor: Clutter.Actor,
  props: Record<string, number>,
  params: EaseParams = {},
): void {
  easeBezier(actor, props, effects.islandSpring.bezier, {
    duration: effects.islandSpring.durationMs,
    ...params,
  });
}
