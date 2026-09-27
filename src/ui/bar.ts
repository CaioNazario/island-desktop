import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isFixedMode, IslandState, type Mode, type Scheduler } from '../core/island.js';
import { SystemBluetooth } from '../system/bluetooth.js';
import { SystemBrightness } from '../system/brightness.js';
import { OsdRedirect } from '../system/osd.js';
import { SystemSession } from '../system/session.js';
import { GSettingsToggle } from '../system/toggleSetting.js';
import { SystemVolume } from '../system/volume.js';
import { SystemWifi } from '../system/wifi.js';
import { Island, type IslandActor, type IslandSystem } from './island.js';
import { Pill, type PillActor } from './pill.js';
import { RightPill } from './rightPill.js';
import { layout } from './tokens.js';

class GLibScheduler implements Scheduler {
  setTimeout(callback: () => void, ms: number): number {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      callback();
      return GLib.SOURCE_REMOVE;
    });
  }

  clearTimeout(id: number): void {
    GLib.Source.remove(id);
  }
}

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
      const height = Math.max(layout.barHeight, islandHeight);
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
  readonly island: IslandActor;
  private readonly strut: InstanceType<typeof StrutActor>;
  private readonly chrome: InstanceType<typeof BarChrome>;

  constructor(
    monitor: { index: number; x: number; y: number; width: number },
    state: IslandState,
    system: IslandSystem,
    onIslandClick: () => void,
    onEscape: () => void,
    onTrigger: (mode: Mode) => void,
  ) {
    this.strut = new StrutActor();
    this.strut.set_position(monitor.x, monitor.y);
    this.strut.set_size(monitor.width, layout.barHeight + layout.bottomGap);
    Main.layoutManager.addChrome(this.strut, {
      affectsStruts: true,
      trackFullscreen: true,
    });

    const leftPill = new Pill();
    const island = new Island(state, system, onIslandClick, onEscape);
    this.island = island;
    const rightPill = new RightPill(() => onTrigger('quick'));
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

// Existe um único IslandState compartilhado entre monitores (specs/02-barra.md):
// só a ilha do monitor-alvo mostra o modo atual, as outras ficam em `compact`.
export class BarManager {
  private readonly state: IslandState;
  private readonly system: IslandSystem;
  private bars: Bar[] = [];
  private targetMonitorIndex = 0;
  private grab: Clutter.Grab | null = null;
  private grabbedIsland: IslandActor | null = null;
  private readonly osdRedirect: OsdRedirect;
  private readonly unsubscribeWifi: () => void;
  private readonly unsubscribeBt: () => void;

  constructor() {
    this.state = new IslandState(new GLibScheduler(), {
      onChange: () => this.render(),
    });
    this.system = {
      volume: new SystemVolume(),
      brightness: new SystemBrightness(),
      nightLight: new GSettingsToggle(
        'org.gnome.settings-daemon.plugins.color',
        'night-light-enabled',
      ),
      dnd: new GSettingsToggle('org.gnome.desktop.notifications', 'show-banners', true),
      wifi: new SystemWifi(),
      bluetooth: new SystemBluetooth(),
      session: new SystemSession(),
    };
    this.osdRedirect = new OsdRedirect(
      () => this.triggerVolumeKey(),
      () => this.triggerBrightnessKey(),
    );
    // "Sem adaptador, o tile e o modo somem": o adaptador pode sumir com o
    // `wifi`/`bt` aberto (ex.: driver reiniciando após suspender).
    this.unsubscribeWifi = this.system.wifi.onChange(() => {
      if (this.state.mode === 'wifi' && !this.system.wifi.available) this.state.closeAll();
    });
    this.unsubscribeBt = this.system.bluetooth.onChange(() => {
      if (this.state.mode === 'bt' && !this.system.bluetooth.available) this.state.closeAll();
    });
    this.rebuild();
    Main.layoutManager.connectObject('monitors-changed', () => this.rebuild(), this);
  }

  /**
   * Tecla de volume: monitor da janela focada (specs/02-barra.md). Com modo
   * fixo ou cartão aberto, o valor já mudou no sistema; a ilha não se move
   * (regra 4 da spec 03), então nem tenta trocar de monitor-alvo.
   */
  private triggerVolumeKey(): void {
    if (this.state.cardOpen || isFixedMode(this.state.mode)) return;
    this.targetMonitorIndex = this.focusedMonitorIndex();
    this.state.volumeKey();
    this.render();
  }

  /** Tecla de brilho: mesma regra da tecla de volume acima. */
  private triggerBrightnessKey(): void {
    if (this.state.cardOpen || isFixedMode(this.state.mode)) return;
    this.targetMonitorIndex = this.focusedMonitorIndex();
    this.state.brightnessKey();
    this.render();
  }

  private handleEscape(): void {
    // O painel de senha do `wifi` já foi tratado pela ilha (regra 9): aqui
    // o Esc fecha tudo.
    this.state.escape(false);
  }

  /** `Super+S`: alterna `quick` na ilha do monitor da janela focada (specs/03-ilha.md). */
  toggleQuickFromShortcut(): void {
    this.targetMonitorIndex = this.focusedMonitorIndex();
    this.state.openFromTrigger('quick');
    this.render();
  }

  private focusedMonitorIndex(): number {
    const focusWindow = global.display.focus_window;
    return focusWindow ? focusWindow.get_monitor() : Main.layoutManager.primaryIndex;
  }

  /** Gatilho na barra: a ilha daquela barra abre o modo (specs/02-barra.md). */
  private handleBarTrigger(monitorIndex: number, mode: Mode): void {
    this.targetMonitorIndex = monitorIndex;
    this.state.openFromTrigger(mode);
    this.render();
  }

  private handleIslandClick(monitorIndex: number): void {
    if (this.state.mode === 'compact') return;
    this.targetMonitorIndex = monitorIndex;
    this.state.islandClick();
    this.render();
  }

  private rebuild(): void {
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedIsland = null;
    }
    this.bars.forEach((bar) => bar.destroy());
    this.bars = Main.layoutManager.monitors.map(
      (monitor, index) =>
        new Bar(
          monitor,
          this.state,
          this.system,
          () => this.handleIslandClick(index),
          () => this.handleEscape(),
          (mode) => this.handleBarTrigger(index, mode),
        ),
    );
    this.render();
  }

  private render(): void {
    this.bars.forEach((bar, index) => bar.island.render(index === this.targetMonitorIndex));
    this.syncGrab();
  }

  /** Modos fixos e o cartão central tomam o foco de teclado (specs/03-ilha.md). */
  private syncGrab(): void {
    const shouldGrab = this.state.cardOpen || isFixedMode(this.state.mode);
    const targetIsland = this.bars[this.targetMonitorIndex]?.island ?? null;
    const wantedIsland = shouldGrab ? targetIsland : null;

    if (wantedIsland === this.grabbedIsland) return;

    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedIsland = null;
    }
    if (wantedIsland) {
      // POPUP, como os menus do Shell: o padrão (NONE) filtra todos os
      // atalhos globais, e aí `Super+S` não fecharia a ilha.
      this.grab = Main.pushModal(wantedIsland, { actionMode: Shell.ActionMode.POPUP });
      this.grabbedIsland = wantedIsland;
    }
  }

  destroy(): void {
    Main.layoutManager.disconnectObject(this);
    this.unsubscribeWifi();
    this.unsubscribeBt();
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedIsland = null;
    }
    this.bars.forEach((bar) => bar.destroy());
    this.bars = [];
    this.system.volume.destroy();
    this.system.brightness.destroy();
    this.system.nightLight.destroy();
    this.system.dnd.destroy();
    this.system.wifi.destroy();
    this.system.bluetooth.destroy();
    this.system.session.destroy();
    this.osdRedirect.destroy();
  }
}
