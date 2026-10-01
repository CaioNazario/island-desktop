import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
  getPointerWatcher,
  type PointerWatch,
} from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

import { AutoHide, type BarActivity } from '../core/autoHide.js';
import { EnvironmentScroll } from '../core/environments.js';
import { MAX_ISLAND_WIDTH, type IslandState, type Mode } from '../core/island.js';
import type { BatterySource } from '../system/battery.js';
import type { SwitchDirection } from '../system/environments.js';
import type { HardwareSource } from '../system/hardware.js';
import type { EditSession } from './editSession.js';
import { scrollInput, WidgetSlide } from './environmentSwitch.js';
import { environmentButton } from './environmentView.js';
import { Banner, BANNER_GAP, BANNER_HEIGHT, BANNER_WIDTH, type BannerActor } from './banner.js';
import { Island, type IslandActor, type IslandSystem } from './island.js';
import { Pill, type PillActor } from './pill.js';
import { RightPill, type RightPillActor } from './rightPill.js';
import { easeBezier } from './spring.js';
import { colors, effects, layout } from './tokens.js';
import { WidgetArea, type WidgetAreaActor } from './widgetArea.js';

// Brilho `accent` 22% de 18px da pílula-alvo na edição (specs/17-editor-ambientes.md
// "Barra durante a edição"). Ator próprio atrás da pílula: ela corta o que
// pinta fora da alocação (`clip_to_allocation` da troca de ambiente). Fundo
// opaco porque a sombra do St sai do fundo; a pílula cobre o miolo.
function pillGlow(): St.Widget {
  return new St.Widget({
    visible: false,
    style: `
      background-color: ${colors.bg};
      border-radius: ${layout.pillRadius}px;
      box-shadow: 0 0 18px rgba(145,132,217,0.22);
    `,
  });
}

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
    private readonly widgetAreas: readonly WidgetAreaActor[];
    readonly leftGlow = pillGlow();
    readonly rightGlow = pillGlow();

    constructor(
      leftPill: PillActor,
      island: IslandActor,
      rightPill: RightPillActor,
      banner: BannerActor,
      widgetAreas: readonly WidgetAreaActor[],
    ) {
      super({ reactive: false });
      this.widgetAreas = widgetAreas;
      this.leftPill = leftPill;
      this.island = island;
      this.rightPill = rightPill;
      this.banner = banner;
      this.add_child(this.leftGlow);
      this.add_child(this.rightGlow);
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
      // Antes de alocar as pílulas: as duas áreas de widgets medem com ela.
      const slack = sideWidth - sideWidthFor(allocWidth, MAX_ISLAND_WIDTH);
      this.widgetAreas.forEach((area) => (area.slack = slack));

      const childBox = new Clutter.ActorBox();

      childBox.x1 = layout.sideMargin;
      childBox.x2 = childBox.x1 + sideWidth;
      childBox.y1 = 0;
      childBox.y2 = layout.barHeight;
      this.leftPill.allocate(childBox);
      this.leftGlow.allocate(childBox);

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
      this.rightGlow.allocate(childBox);

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

// Revelação por pressão no topo (specs/18-auto-ocultar.md, spike S9): os
// valores do canto ativo do Shell.
const REVEAL_PRESSURE = { threshold: 100, timeoutMs: 1000 };
// Intervalo do `PointerWatcher` enquanto a barra está revelada.
const POINTER_WATCH_MS = 100;

type MonitorGeometry = { index: number; x: number; y: number; width: number };

/** Tudo que o `BarManager` sabe e a barra não: editor e overview. */
export type BarContext = Pick<BarActivity, 'editing' | 'overview'>;

export class Bar {
  readonly island: IslandActor;
  readonly banner: BannerActor;
  private readonly state: IslandState;
  private readonly leftWidgets: WidgetAreaActor;
  private readonly rightWidgets: WidgetAreaActor;
  private readonly unsubscribeEnvironments: () => void;
  private readonly monitor: MonitorGeometry;
  private strut: InstanceType<typeof StrutActor> | null = null;
  private readonly autoHide = new AutoHide();
  private activity: BarActivity = { islandOpen: false, editing: false, overview: false };
  private shown = true;
  private pressure: Layout.PressureBarrier | null = null;
  private barrier: Meta.Barrier | null = null;
  private pointerWatch: PointerWatch | null = null;
  private readonly chrome: InstanceType<typeof BarChrome>;
  private readonly leftPill: PillActor;
  private readonly rightPill: RightPillActor;
  private session: EditSession | null = null;
  private unsubscribeSession: (() => void) | null = null;

  constructor(
    monitor: MonitorGeometry,
    state: IslandState,
    system: IslandSystem,
    battery: BatterySource,
    hardware: HardwareSource,
    onIslandClick: () => void,
    onEscape: () => void,
    onTrigger: (mode: Mode) => void,
    onBannerOpen: () => void,
    onSelectEnvironment: (index: number) => void,
    onStepEnvironment: (direction: SwitchDirection) => void,
    onEditEnvironments: () => void,
  ) {
    this.monitor = monitor;
    this.setStrut(true);

    this.state = state;
    const widgetSources = {
      aiUsage: system.aiUsage,
      hardware,
      calendar: system.calendar,
      github: system.github,
      music: system.music,
      pomodoro: system.pomodoro,
      settings: system.settings,
      openPreferences: system.openPreferences,
    };
    this.leftWidgets = new WidgetArea(widgetSources, 'end', onTrigger);
    this.rightWidgets = new WidgetArea(widgetSources, 'start', onTrigger);
    const syncWidgets = (): void => {
      const env = system.environments.active;
      this.leftWidgets.setWidgets(env.left);
      this.rightWidgets.setWidgets(env.right);
    };
    syncWidgets();
    const slide = new WidgetSlide([this.leftWidgets, this.rightWidgets]);
    this.unsubscribeEnvironments = system.environments.onChange((direction) => {
      if (direction) slide.slide(direction, syncWidgets);
      else syncWidgets();
    });

    // Pílula esquerda (specs/16-widgets.md "Pílulas"): botão de ambiente,
    // gap 4px e os widgets junto da ilha.
    const leftPill = new Pill();
    leftPill.add_child(
      environmentButton(system.environments, onSelectEnvironment, onEditEnvironments),
    );
    leftPill.add_child(new St.Widget({ width: 4 }));
    leftPill.add_child(this.leftWidgets);
    this.banner = new Banner(onBannerOpen);
    const island = new Island(state, system, onIslandClick, onEscape, (target: Clutter.Actor) =>
      this.banner.handlePressUnderGrab(target),
    );
    this.island = island;
    const rightPill = new RightPill(
      this.rightWidgets,
      {
        battery,
        notifications: system.notifications,
        wifi: system.wifi,
        volume: system.volume,
      },
      onTrigger,
    );

    // Rolagem horizontal sobre a barra troca de ambiente (specs/15-ambientes.md
    // "Rolagem suave"). O chrome não recebe eventos: ele cobre a largura do
    // monitor e comeria os cliques nas janelas; cada pílula e a ilha ouvem.
    const scroll = new EnvironmentScroll();
    const onScroll = (_actor: Clutter.Actor, event: Clutter.Event): boolean => {
      const input = scrollInput(event);
      if (!input) return Clutter.EVENT_PROPAGATE;
      const result = scroll.handle(input);
      if (result.step) onStepEnvironment(result.step);
      else if (result.drag !== undefined) slide.drag(result.drag);
      return result.handled ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    };
    for (const actor of [leftPill, island, rightPill]) {
      actor.reactive = true;
      actor.connect('scroll-event', onScroll);
    }
    this.leftPill = leftPill;
    this.rightPill = rightPill;
    // Na edição, clique no espaço vazio da pílula a torna alvo e limpa a
    // seleção. A área de widgets não é reativa: o clique cai na pílula.
    for (const [pill, side] of [
      [leftPill, 'left'],
      [rightPill, 'right'],
    ] as const) {
      pill.connect('button-press-event', (_actor: Clutter.Actor, event: Clutter.Event) => {
        if (!this.session || global.stage.get_event_actor(event) !== pill)
          return Clutter.EVENT_PROPAGATE;
        this.session.setTarget(side, true);
        return Clutter.EVENT_STOP;
      });
    }

    this.chrome = new BarChrome(leftPill, island, rightPill, this.banner, [
      this.leftWidgets,
      this.rightWidgets,
    ]);
    this.chrome.set_position(monitor.x, monitor.y);
    this.chrome.set_width(monitor.width);
    Main.layoutManager.addTopChrome(this.chrome, {
      trackFullscreen: true,
    });
  }

  /** Liga (com a sessão do editor) ou desliga o modo de edição desta barra. */
  setEditing(session: EditSession | null): void {
    if (session === this.session) return;
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.session = session;
    this.leftWidgets.edit(session);
    this.rightWidgets.edit(session);
    if (session) this.unsubscribeSession = session.onChange(() => this.syncEditing());
    this.syncEditing();
  }

  private syncEditing(): void {
    const target = this.session?.target ?? null;
    this.leftPill.ring = target === null ? 'normal' : target === 'left' ? 'target' : 'other';
    this.rightPill.ring = target === null ? 'normal' : target === 'right' ? 'target' : 'other';
    this.chrome.leftGlow.visible = target === 'left';
    this.chrome.rightGlow.visible = target === 'right';
  }

  render(isTargetMonitor: boolean, context: BarContext): void {
    this.island.render(isTargetMonitor);
    const aiActive = isTargetMonitor && this.state.mode === 'ai';
    this.leftWidgets.active = aiActive;
    this.rightWidgets.active = aiActive;
    // Só a ilha do monitor-alvo sai de `compact` (specs/02-barra.md).
    const islandOpen = isTargetMonitor && (this.state.mode !== 'compact' || this.state.cardOpen);
    this.activity = { islandOpen, ...context };
    this.syncAutoHide();
  }

  /** Chave `auto-hide` (specs/18-auto-ocultar.md): sem strut e com barreira. */
  setAutoHide(enabled: boolean): void {
    if (enabled === this.autoHide.enabled) return;
    this.autoHide.setEnabled(enabled);
    this.setStrut(!enabled);
    this.setRevealBarrier(enabled);
    this.syncAutoHide();
  }

  // Reserva 32px no topo (specs/02-barra.md). O `affectsStruts` não muda
  // depois do `addChrome`: ligar/desligar cria ou destrói o ator.
  private setStrut(enabled: boolean): void {
    if (enabled === (this.strut !== null)) return;
    if (!enabled) {
      this.strut?.destroy();
      this.strut = null;
      return;
    }
    this.strut = new StrutActor();
    this.strut.set_position(this.monitor.x, this.monitor.y);
    this.strut.set_size(this.monitor.width, layout.barHeight + layout.bottomGap);
    Main.layoutManager.addChrome(this.strut, {
      affectsStruts: true,
      trackFullscreen: true,
    });
  }

  // Barreira de pressão na borda de cima deste monitor ("Revelar pela borda").
  // O `PressureBarrier.destroy()` só solta os sinais: a barreira é destruída à parte.
  private setRevealBarrier(enabled: boolean): void {
    if (enabled === (this.barrier !== null)) return;
    if (!enabled) {
      this.pressure?.destroy();
      this.barrier?.destroy();
      this.pressure = null;
      this.barrier = null;
      return;
    }
    const { x, y, width } = this.monitor;
    this.pressure = new Layout.PressureBarrier(
      REVEAL_PRESSURE.threshold,
      REVEAL_PRESSURE.timeoutMs,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
    );
    this.pressure.connect('trigger', () => {
      this.autoHide.reveal();
      this.syncAutoHide();
    });
    this.barrier = new Meta.Barrier({
      backend: global.backend,
      x1: x,
      x2: x + width,
      y1: y,
      y2: y,
      directions: Meta.BarrierDirection.POSITIVE_Y,
    });
    this.pressure.addBarrier(this.barrier);
  }

  private syncAutoHide(): void {
    this.syncPointerWatch();
    const shown = this.autoHide.shown(this.activity);
    if (shown === this.shown) return;
    this.shown = shown;
    // A barra inteira (pílulas, ilha e banner) sobe para fora da tela.
    const { durationMs, offsetY, bezier } = effects.barHide;
    easeBezier(this.chrome, { translationY: shown ? 0 : offsetY }, bezier, {
      duration: durationMs,
    });
  }

  // Revelada, a barra vigia o ponteiro até ele sair da faixa dela: largura do
  // monitor, do topo até o fim do chrome (ilha aberta e banner inclusos). O
  // chrome não é reativo, então os vãos entre pílulas não dão `leave`.
  private syncPointerWatch(): void {
    const watching = this.autoHide.revealed;
    if (watching === (this.pointerWatch !== null)) return;
    if (!watching) {
      this.pointerWatch?.remove();
      this.pointerWatch = null;
      return;
    }
    this.pointerWatch = getPointerWatcher().addWatch(POINTER_WATCH_MS, (px, py) => {
      const { x, y, width } = this.monitor;
      const inside = px >= x && px < x + width && py >= y && py < y + this.chrome.height;
      if (inside) return;
      this.autoHide.pointerLeft();
      this.syncAutoHide();
    });
  }

  destroy(): void {
    this.pointerWatch?.remove();
    this.pointerWatch = null;
    this.setRevealBarrier(false);
    this.unsubscribeSession?.();
    this.unsubscribeEnvironments();
    this.chrome.destroy();
    this.setStrut(false);
  }
}
