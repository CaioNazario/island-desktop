import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type { Mode } from '../core/island.js';
import { effects } from './tokens.js';

// Camada de um modo (specs/03-ilha.md "Cada modo é uma camada própria,
// centrada no topo da ilha, com o tamanho do seu modo"): o conteúdo mantém o
// layout final enquanto a ilha anima, e a `surface` corta o que sobra.
//
// O `BinLayout` só respeita `x_align`/`y_align` de filho com `*_expand`; sem
// isso, centraliza.
export function modeLayer(content: Clutter.Actor): St.Widget {
  const layer = new St.Widget({
    layout_manager: new Clutter.BinLayout(),
    x_expand: true,
    y_expand: true,
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.START,
  });
  layer.set_pivot_point(0.5, 0.5);
  layer.add_child(content);
  return layer;
}

function hiddenTransform(mode: Mode): {
  scaleX: number;
  scaleY: number;
  translationY: number;
} {
  const { hiddenScale, notifHiddenScale, notifHiddenOffsetY } = effects.contentScale;
  return mode === 'notif'
    ? { scaleX: notifHiddenScale, scaleY: notifHiddenScale, translationY: notifHiddenOffsetY }
    : { scaleX: hiddenScale, scaleY: hiddenScale, translationY: 0 };
}

// Crossfade (specs/03-ilha.md "Animação"): a camada que entra vai a
// opacidade 1 em 220ms com atraso de 80ms e escala 0.94→1 em 300ms; a que
// sai faz o inverso.
export function showLayer(surface: St.Widget, layer: St.Widget, mode: Mode): void {
  layer.remove_all_transitions();
  if (layer.get_parent() === null) {
    surface.add_child(layer);
    layer.opacity = 0;
    Object.assign(layer, hiddenTransform(mode));
  } else {
    surface.set_child_above_sibling(layer, null);
  }
  layer.ease({
    opacity: 255,
    delay: effects.contentCrossfade.delayMs,
    duration: effects.contentCrossfade.durationMs,
    mode: Clutter.AnimationMode.EASE,
  });
  layer.ease({
    scaleX: 1,
    scaleY: 1,
    translationY: 0,
    duration: effects.contentScale.durationMs,
    mode: Clutter.AnimationMode.EASE,
  });
}

export function hideLayer(surface: St.Widget, layer: St.Widget, mode: Mode): void {
  layer.remove_all_transitions();
  layer.ease({
    opacity: 0,
    delay: effects.contentCrossfade.delayMs,
    duration: effects.contentCrossfade.durationMs,
    mode: Clutter.AnimationMode.EASE,
    // Interrompida, a camada voltou a entrar (ou a ilha foi destruída):
    // fica onde está.
    onStopped: (isFinished: boolean) => {
      if (isFinished) surface.remove_child(layer);
    },
  });
  layer.ease({
    ...hiddenTransform(mode),
    duration: effects.contentScale.durationMs,
    mode: Clutter.AnimationMode.EASE,
  });
}
