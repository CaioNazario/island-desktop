import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { Mode } from '../core/island.js';
import { colors, effects } from './tokens.js';

/** O que a ilha mostra: um modo ou o cartão central (specs/05-musica.md). */
export type LayerId = Mode | 'card';

// Layout da `surface` da ilha: cada camada no seu tamanho preferido,
// centrada no topo, mesmo maior que a ilha. O `BinLayout` espremeria a
// camada até o tamanho da ilha durante a animação (CLAMP em
// `clutter_actor_allocate_align_fill`, mutter 50.4).
export const ModeLayersLayout = GObject.registerClass(
  class ModeLayersLayout extends Clutter.LayoutManager {
    override vfunc_get_preferred_width(
      container: Clutter.Actor,
      forHeight: number,
    ): [number, number] {
      let natural = 0;
      for (const child of container.get_children())
        natural = Math.max(natural, child.get_preferred_width(forHeight)[1]);
      return [0, natural];
    }

    override vfunc_get_preferred_height(
      container: Clutter.Actor,
      forWidth: number,
    ): [number, number] {
      let natural = 0;
      for (const child of container.get_children())
        natural = Math.max(natural, child.get_preferred_height(forWidth)[1]);
      return [0, natural];
    }

    override vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox): void {
      for (const child of container.get_children()) {
        const [, width] = child.get_preferred_width(-1);
        child.allocate_preferred_size(box.x1 + (box.get_width() - width) / 2, box.y1);
      }
    }
  },
);

// Superfície da ilha: fundo, anel e o corte do conteúdo (`overflow: hidden`
// no design). As camadas dos modos ficam dentro dela.
export const IslandSurface = GObject.registerClass(
  {
    Properties: {
      // Animável com `ease_property` (specs/03-ilha.md: "raio: 460ms ease").
      radius: GObject.ParamSpec.double(
        'radius',
        null,
        null,
        GObject.ParamFlags.READWRITE,
        0,
        Number.MAX_SAFE_INTEGER,
        0,
      ),
    },
  },
  class IslandSurface extends St.Widget {
    private readonly ring: number;
    private radiusPx = -1;

    constructor(ring: number) {
      super({
        layout_manager: new ModeLayersLayout(),
        clip_to_allocation: true,
        x_expand: true,
        y_expand: true,
      });
      this.ring = ring;
    }

    get radius(): number {
      return this.radiusPx;
    }

    set radius(radius: number) {
      if (this.radiusPx === radius) return;
      this.radiusPx = radius;
      this.style = `background-color: ${colors.bg}; border-radius: ${radius}px; border: ${this.ring}px solid ${colors.neutral800};`;
      this.notify('radius');
    }
  },
);

export type IslandSurfaceActor = InstanceType<typeof IslandSurface>;

// Camada de um modo (specs/03-ilha.md "Cada modo é uma camada própria,
// centrada no topo da ilha, com o tamanho do seu modo"): o conteúdo mantém o
// layout final enquanto a ilha anima, e a `surface` corta o que sobra.
export function modeLayer(content: Clutter.Actor): St.Widget {
  const layer = new St.Widget({ layout_manager: new Clutter.BinLayout() });
  layer.set_pivot_point(0.5, 0.5);
  layer.add_child(content);
  return layer;
}

function hiddenTransform(mode: LayerId): {
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
export function showLayer(surface: St.Widget, layer: St.Widget, mode: LayerId): void {
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

export function hideLayer(surface: St.Widget, layer: St.Widget, mode: LayerId): void {
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
