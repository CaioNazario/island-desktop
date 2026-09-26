import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Island, type IslandActor } from './island.js';
import { Pill, type PillActor } from './pill.js';
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

    constructor(leftPill: PillActor, island: IslandActor, rightPill: PillActor) {
      super({ reactive: false });
      this.leftPill = leftPill;
      this.island = island;
      this.rightPill = rightPill;
      this.add_child(leftPill);
      this.add_child(island);
      this.add_child(rightPill);

      island.connectObject(
        'notify::width',
        () => this.queue_relayout(),
        'notify::height',
        () => this.reflowHeight(),
        this,
      );
      this.reflowHeight();
    }

    private reflowHeight(): void {
      this.set_height(Math.max(layout.barHeight, this.island.height));
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

class Bar {
  private readonly strut: InstanceType<typeof StrutActor>;
  private readonly chrome: InstanceType<typeof BarChrome>;

  constructor(monitor: { index: number; x: number; y: number; width: number }) {
    this.strut = new StrutActor();
    this.strut.set_position(monitor.x, monitor.y);
    this.strut.set_size(monitor.width, layout.barHeight);
    Main.layoutManager.addChrome(this.strut, {
      affectsStruts: true,
      trackFullscreen: true,
    });

    const leftPill = new Pill();
    const island = new Island();
    const rightPill = new Pill();
    this.chrome = new BarChrome(leftPill, island, rightPill);
    this.chrome.set_position(monitor.x, monitor.y);
    this.chrome.set_width(monitor.width);
    Main.layoutManager.addTopChrome(this.chrome, {
      trackFullscreen: true,
    });
  }

  destroy(): void {
    this.chrome.destroy();
    this.strut.destroy();
  }
}

export class BarManager {
  private bars: Bar[] = [];

  constructor() {
    this.rebuild();
    Main.layoutManager.connectObject('monitors-changed', () => this.rebuild(), this);
  }

  private rebuild(): void {
    this.bars.forEach((bar) => bar.destroy());
    this.bars = Main.layoutManager.monitors.map((monitor) => new Bar(monitor));
  }

  destroy(): void {
    Main.layoutManager.disconnectObject(this);
    this.bars.forEach((bar) => bar.destroy());
    this.bars = [];
  }
}
