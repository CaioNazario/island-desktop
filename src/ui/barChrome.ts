import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { MAX_ISLAND_WIDTH, type IslandState, type Mode } from '../core/island.js';
import type { BatterySource } from '../system/battery.js';
import type { HardwareSource } from '../system/hardware.js';
import { Banner, BANNER_GAP, BANNER_HEIGHT, BANNER_WIDTH, type BannerActor } from './banner.js';
import { Island, type IslandActor, type IslandSystem } from './island.js';
import { Pill, type PillActor } from './pill.js';
import { RightPill, type RightPillActor } from './rightPill.js';
import { layout } from './tokens.js';

function sideWidthFor(allocWidth: number, islandWidth: number): number {
  return Math.max(0, (allocWidth - 2 * layout.sideMargin - 2 * layout.pillGap - islandWidth) / 2);
}

// Container das três pílulas (specs/02-barra.md): pílulas laterais dividem
// igualmente o espaço que sobra da ilha; a ilha cresce para baixo sem mover
// as laterais. Alocação manual porque St não tem flexbox (padrão espelhado
// em js/ui/panel.js Panel.vfunc_allocate, que faz o mesmo para suas 3 caixas).
const BarChrome = GObject.registerClass(
  class BarChrome extends St.Widget {
    private readonly leftPill: PillActor;
    private readonly island: IslandActor;
    private readonly rightPill: RightPillActor;
    private readonly banner: BannerActor;

    constructor(
      leftPill: PillActor,
      island: IslandActor,
      rightPill: RightPillActor,
      banner: BannerActor,
    ) {
      super({ reactive: false });
      this.leftPill = leftPill;
      this.island = island;
      this.rightPill = rightPill;
      this.banner = banner;
      this.add_child(leftPill);
      this.add_child(island);
      this.add_child(rightPill);
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
      const height = Math.max(layout.barHeight, islandHeight, bannerBottom);
      return [height, height];
    }

    override vfunc_allocate(box: Clutter.ActorBox): void {
      this.set_allocation(box);

      const allocWidth = box.x2 - box.x1;
      const islandWidth = this.island.width;
      const islandHeight = this.island.height;
      const sideWidth = sideWidthFor(allocWidth, islandWidth);

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
      this.rightPill.hardwareSlack = sideWidth - sideWidthFor(allocWidth, MAX_ISLAND_WIDTH);
      this.rightPill.allocate(childBox);

      // "`top` = altura atual da ilha + 8px (acompanha a ilha com a mesma
      // mola)" (specs/04-notificacoes.md): a altura lida aqui já é a animada.
      childBox.x1 =
        layout.sideMargin + sideWidth + layout.pillGap + (islandWidth - BANNER_WIDTH) / 2;
      childBox.x2 = childBox.x1 + BANNER_WIDTH;
      childBox.y1 = islandHeight + BANNER_GAP;
      childBox.y2 = childBox.y1 + BANNER_HEIGHT;
      this.banner.allocate(childBox);
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
  readonly banner: BannerActor;
  private readonly strut: InstanceType<typeof StrutActor>;
  private readonly chrome: InstanceType<typeof BarChrome>;

  constructor(
    monitor: { index: number; x: number; y: number; width: number },
    state: IslandState,
    system: IslandSystem,
    battery: BatterySource,
    hardware: HardwareSource,
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

    const leftPill = new Pill();
    this.banner = new Banner(onBannerOpen);
    const island = new Island(state, system, onIslandClick, onEscape, (target: Clutter.Actor) =>
      this.banner.handlePressUnderGrab(target),
    );
    this.island = island;
    const rightPill = new RightPill(
      {
        battery,
        hardware,
        notifications: system.notifications,
        wifi: system.wifi,
        volume: system.volume,
      },
      onTrigger,
    );
    this.chrome = new BarChrome(leftPill, island, rightPill, this.banner);
    this.chrome.set_position(monitor.x, monitor.y);
    this.chrome.set_width(monitor.width);
    Main.layoutManager.addTopChrome(this.chrome, {
      trackFullscreen: true,
    });
  }

  render(isTargetMonitor: boolean): void {
    this.island.render(isTargetMonitor);
  }

  destroy(): void {
    this.chrome.destroy();
    this.strut.destroy();
  }
}
