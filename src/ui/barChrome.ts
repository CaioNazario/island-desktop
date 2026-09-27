import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { IslandState, Mode } from '../core/island.js';
import type { BatterySource } from '../system/battery.js';
import { Banner, BANNER_GAP, BANNER_HEIGHT, BANNER_WIDTH, type BannerActor } from './banner.js';
import {
  CENTER_CARD_TOP,
  CENTER_CARD_WIDTH,
  CenterCard,
  type CenterCardActor,
} from './centerCard.js';
import { Island, type IslandActor, type IslandSystem } from './island.js';
import { Pill, type PillActor } from './pill.js';
import { RightPill } from './rightPill.js';
import { layout } from './tokens.js';

// Container das três pílulas (specs/02-barra.md): pílulas laterais dividem
// igualmente o espaço que sobra da ilha; a ilha cresce para baixo sem mover
// as laterais. Alocação manual porque St não tem flexbox (padrão espelhado
// em js/ui/panel.js Panel.vfunc_allocate, que faz o mesmo para suas 3 caixas).
const BarChrome = GObject.registerClass(
  class BarChrome extends St.Widget {
    private readonly leftPill: PillActor;
    private readonly island: IslandActor;
    private readonly rightPill: PillActor;
    private readonly card: CenterCardActor;
    private readonly banner: BannerActor;

    constructor(
      leftPill: PillActor,
      island: IslandActor,
      rightPill: PillActor,
      card: CenterCardActor,
      banner: BannerActor,
    ) {
      super({ reactive: false });
      this.leftPill = leftPill;
      this.island = island;
      this.rightPill = rightPill;
      this.card = card;
      this.banner = banner;
      this.add_child(leftPill);
      this.add_child(island);
      this.add_child(rightPill);
      // O banner fica por cima do cartão (z-index 35 × 25 no design).
      this.add_child(card);
      this.add_child(banner);
    }

    // Altura via preferred size, sem ouvir notify::width/height da ilha: esses
    // notifies também saem de dentro do nosso vfunc_allocate (quando a ilha é
    // alocada), e reagir com queue_relayout/set_height ali deixa o chrome sujo
    // no fim do layout ("Can't update stage views ... needs an allocation").
    // O set_width/set_height da ilha já propaga o relayout até aqui
    // (clutter_actor_real_queue_relayout em clutter-actor.c, mutter 50.4), e o
    // uiGroup usa ClutterFixedLayout, que aloca no tamanho preferido.
    override vfunc_get_preferred_height(_forWidth: number): [number, number] {
      const [, islandHeight] = this.island.get_preferred_height(-1);
      // O banner fica abaixo da ilha e também precisa de área no chrome.
      const bannerBottom = this.banner.visible ? islandHeight + BANNER_GAP + BANNER_HEIGHT : 0;
      const cardBottom = this.card.visible ? CENTER_CARD_TOP + this.cardHeight() : 0;
      const height = Math.max(layout.barHeight, islandHeight, bannerBottom, cardBottom);
      return [height, height];
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);

      const allocWidth = box.x2 - box.x1;
      const islandWidth = this.island.width;
      const islandHeight = this.island.height;
      const sideWidth = Math.max(
        0,
        (allocWidth - 2 * layout.sideMargin - 2 * layout.pillGap - islandWidth) / 2,
      );

      const childBox = new Clutter.ActorBox();

      childBox.x1 = layout.sideMargin;
      childBox.x2 = childBox.x1 + sideWidth;
      childBox.y1 = 0;
      childBox.y2 = layout.barHeight;
      this.leftPill.allocate(childBox);

      childBox.x1 = layout.sideMargin + sideWidth + layout.pillGap;
      childBox.x2 = childBox.x1 + islandWidth;
      childBox.y1 = 0;
      childBox.y2 = islandHeight;
      this.island.allocate(childBox);

      childBox.x1 = allocWidth - layout.sideMargin - sideWidth;
      childBox.x2 = allocWidth - layout.sideMargin;
      childBox.y1 = 0;
      childBox.y2 = layout.barHeight;
      this.rightPill.allocate(childBox);

      // "`top` = altura atual da ilha + 8px (acompanha a ilha com a mesma
      // mola)" (specs/04-notificacoes.md): a altura lida aqui já é a animada.
      childBox.x1 =
        layout.sideMargin + sideWidth + layout.pillGap + (islandWidth - BANNER_WIDTH) / 2;
      childBox.x2 = childBox.x1 + BANNER_WIDTH;
      childBox.y1 = islandHeight + BANNER_GAP;
      childBox.y2 = childBox.y1 + BANNER_HEIGHT;
      this.banner.allocate(childBox);

      // O cartão só abre com a ilha em `compact`: centrado nela, sem mola.
      childBox.x1 =
        layout.sideMargin + sideWidth + layout.pillGap + (islandWidth - CENTER_CARD_WIDTH) / 2;
      childBox.x2 = childBox.x1 + CENTER_CARD_WIDTH;
      childBox.y1 = CENTER_CARD_TOP;
      childBox.y2 = childBox.y1 + this.cardHeight();
      this.card.allocate(childBox);
    }

    private cardHeight(): number {
      const [, height] = this.card.get_preferred_height(CENTER_CARD_WIDTH);
      return height;
    }
  },
);

// Reserva o espaço da barra (struts) sem participar do visual: as pílulas
// flutuam com margem de 12px e não encostam nas bordas do monitor, então não
// dá pra usá-las diretamente como ator de strut (Main.layoutManager só cria
// strut quando o ator toca as duas pontas do monitor).
const StrutActor = GObject.registerClass(
  class StrutActor extends St.Widget {
    constructor() {
      super({ opacity: 0, reactive: false });
    }
  },
);

export class Bar {
  readonly island: IslandActor;
  readonly card: CenterCardActor;
  readonly banner: BannerActor;
  private readonly state: IslandState;
  private readonly strut: InstanceType<typeof StrutActor>;
  private readonly chrome: InstanceType<typeof BarChrome>;

  constructor(
    monitor: { index: number; x: number; y: number; width: number },
    state: IslandState,
    system: IslandSystem,
    battery: BatterySource,
    onIslandClick: () => void,
    onEscape: () => void,
    onTrigger: (mode: Mode) => void,
    onBannerOpen: () => void,
  ) {
    this.strut = new StrutActor();
    this.strut.set_position(monitor.x, monitor.y);
    this.strut.set_size(monitor.width, layout.barHeight + layout.bottomGap);
    Main.layoutManager.addChrome(this.strut, {
      affectsStruts: true,
      trackFullscreen: true,
    });

    this.state = state;
    const leftPill = new Pill();
    this.banner = new Banner(onBannerOpen);
    const island = new Island(state, system, onIslandClick, onEscape, (target: Clutter.Actor) =>
      this.banner.handlePressUnderGrab(target),
    );
    this.island = island;
    this.card = new CenterCard(system.music, {
      onEscape,
      onPressOutside: () => state.closeAll(),
      claimPressUnderGrab: (target: Clutter.Actor) => this.banner.handlePressUnderGrab(target),
    });
    const rightPill = new RightPill(
      battery,
      system.notifications,
      () => onTrigger('quick'),
      () => onTrigger('stack'),
    );
    this.chrome = new BarChrome(leftPill, island, rightPill, this.card, this.banner);
    this.chrome.set_position(monitor.x, monitor.y);
    this.chrome.set_width(monitor.width);
    Main.layoutManager.addTopChrome(this.chrome, {
      trackFullscreen: true,
    });
  }

  render(isTargetMonitor: boolean): void {
    this.island.render(isTargetMonitor);
    this.card.setOpen(isTargetMonitor && this.state.cardOpen);
  }

  destroy(): void {
    this.chrome.destroy();
    this.strut.destroy();
  }
}
