// Máquina de estados da ilha. specs/03-ilha.md é a fonte de verdade; a
// semântica de transição replica design/logic.js (setMode/arm/closeAll/
// openFromBar/islandClick, linhas 94-104, 230-250, 384-392).

export type Mode =
  | 'compact'
  | 'notif'
  | 'stack'
  | 'music'
  | 'volume'
  | 'brightness'
  | 'calendar'
  | 'quick'
  | 'wifi'
  | 'bt'
  | 'ai';

const TRANSIENT_MS: Partial<Record<Mode, number>> = {
  notif: 2500,
  music: 2500,
  volume: 1500,
  brightness: 1500,
};

/** `notif` de notificação de navegador (specs/04-notificacoes.md). */
const BROWSER_NOTIF_MS = 2100;

/** Modos com a linha de controles, onde fica o botão Energia (specs/09-sessao-energia.md). */
const POWER_MODES: ReadonlySet<Mode> = new Set<Mode>(['quick', 'wifi', 'bt']);

function isTransient(mode: Mode): boolean {
  return mode in TRANSIENT_MS;
}

/** Modos fixos (`stack`, `calendar`, `quick`, `wifi`, `bt`, `ai`) tomam o foco de teclado (specs/03-ilha.md). */
export function isFixedMode(mode: Mode): boolean {
  return mode !== 'compact' && !isTransient(mode);
}

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export type IslandClickResult = 'toggled-card' | 'opened-calendar' | 'opened-stack' | 'noop';
export type EscapeResult = 'closed-password' | 'closed' | 'noop';

export interface Size {
  width: number;
  height: number;
  radius: number;
}

export interface SizeContext {
  stackItemCount?: number;
  calendarView?: 'week' | 'month';
  quickEnergyOpen?: boolean;
  wifiEnergyOpen?: boolean;
  wifiPasswordField?: 'none' | 'normal' | 'error';
  btOn?: boolean;
  btEnergyOpen?: boolean;
  providerCount?: number;
}

export function getSize(mode: Mode, ctx: SizeContext = {}): Size {
  switch (mode) {
    case 'compact':
      return { width: 240, height: 30, radius: 15 };
    case 'notif':
      return { width: 400, height: 62, radius: 22 };
    case 'stack': {
      const n = ctx.stackItemCount ?? 0;
      const height = n === 0 ? 56 + 72 : 56 + Math.min(6, n) * 52;
      return { width: 400, height, radius: 24 };
    }
    case 'music':
      return { width: 500, height: 82, radius: 26 };
    case 'volume':
      return { width: 320, height: 50, radius: 25 };
    case 'brightness':
      return { width: 320, height: 50, radius: 25 };
    case 'calendar':
      return { width: 480, height: ctx.calendarView === 'month' ? 214 : 150, radius: 24 };
    case 'quick':
      return { width: 520, height: ctx.quickEnergyOpen ? 106 : 58, radius: 29 };
    case 'wifi': {
      let height = 292;
      if (ctx.wifiEnergyOpen) height += 48;
      if (ctx.wifiPasswordField === 'normal') height += 58;
      else if (ctx.wifiPasswordField === 'error') height += 76;
      return { width: 520, height, radius: 26 };
    }
    case 'bt': {
      let height = ctx.btOn === false ? 300 : 348;
      if (ctx.btEnergyOpen) height += 48;
      return { width: 520, height, radius: 26 };
    }
    case 'ai': {
      const providerCount = ctx.providerCount ?? 0;
      return { width: 480, height: 24 + 32 + providerCount * 108 - 6, radius: 24 };
    }
  }
}

export type IslandClickOpens = 'card' | 'calendar';

export interface IslandStateOptions {
  /** Lida a cada clique: a preferência muda sem recriar o estado (specs/13-preferencias.md). */
  islandClickOpens?: () => IslandClickOpens;
  /** Chamado sempre que `mode` ou `cardOpen` muda, para a UI se re-sincronizar. */
  onChange?: () => void;
}

export class IslandState {
  private readonly scheduler: Scheduler;
  private readonly islandClickOpens: () => IslandClickOpens;
  private readonly onChange: () => void;
  private _mode: Mode = 'compact';
  private _cardOpen = false;
  private _powerOpen = false;
  private hovering = false;
  private notifSticky = false;
  private notifFromBrowser = false;
  private timerId: number | null = null;

  constructor(scheduler: Scheduler, options: IslandStateOptions = {}) {
    this.scheduler = scheduler;
    this.islandClickOpens = options.islandClickOpens ?? (() => 'card');
    this.onChange = options.onChange ?? (() => {});
  }

  get mode(): Mode {
    return this._mode;
  }

  get cardOpen(): boolean {
    return this._cardOpen;
  }

  /** Linha de energia aberta abaixo da linha de controles (specs/09-sessao-energia.md). */
  get powerOpen(): boolean {
    return this._powerOpen;
  }

  /** Botão Energia: só existe na linha de controles de `quick`/`wifi`/`bt`. */
  togglePower(): void {
    if (!POWER_MODES.has(this._mode)) return;
    this._powerOpen = !this._powerOpen;
    this.onChange();
  }

  /** Gatilho do usuário (clique na barra, `Super+S`): regras 1 e 2. */
  openFromTrigger(mode: Mode): void {
    if (this._mode === mode) {
      this.closeAll();
      return;
    }
    this.setMode(mode);
  }

  /** Evento automático (notificação, troca de faixa): regra 3. */
  openAutomatic(mode: Mode): boolean {
    if (this._cardOpen) return false;
    if (this._mode !== 'compact' && !isTransient(this._mode)) return false;
    this.setMode(mode);
    return true;
  }

  /**
   * Notificação roteada para `notif` (specs/04-notificacoes.md): abre ou
   * troca o conteúdo e rearma o timer. Crítica não fecha sozinha; a de
   * navegador fecha em 2100ms.
   */
  openNotification(critical: boolean, fromBrowser = false): void {
    this.notifSticky = critical;
    this.notifFromBrowser = fromBrowser;
    this.setMode('notif');
  }

  /** Tecla de volume/brilho: regra 4. */
  volumeKey(): void {
    this.openAutomatic('volume');
  }

  brightnessKey(): void {
    this.openAutomatic('brightness');
  }

  /** Clique na ilha: regra 5. */
  islandClick(): IslandClickResult {
    if (this._mode === 'compact') {
      if (this.islandClickOpens() === 'calendar') {
        this.setMode('calendar');
        return 'opened-calendar';
      }
      this._cardOpen = !this._cardOpen;
      this.onChange();
      return 'toggled-card';
    }
    if (this._mode === 'notif') {
      this.setMode('stack');
      return 'opened-stack';
    }
    return 'noop';
  }

  /** Regra 7: hover cancela o timer; sair do hover rearma. */
  hoverStart(): void {
    this.hovering = true;
    this.clearTimer();
  }

  hoverEnd(): void {
    this.hovering = false;
    this.arm(this._mode);
  }

  /** Regra 8: interação com slider cancela o timer durante o arraste. */
  dragStart(): void {
    this.clearTimer();
  }

  dragEnd(): void {
    this.arm(this._mode);
  }

  /** Qualquer interação de conteúdo que deva rearmar o timer do modo atual (ex.: trocar de faixa em `music`). */
  keepAlive(): void {
    this.arm(this._mode);
  }

  /** Regra 9. */
  escape(passwordFieldFocused: boolean): EscapeResult {
    if (passwordFieldFocused) return 'closed-password';
    if (this._mode === 'compact' && !this._cardOpen) return 'noop';
    this.closeAll();
    return 'closed';
  }

  closeAll(): void {
    this.clearTimer();
    this._mode = 'compact';
    this._cardOpen = false;
    this._powerOpen = false;
    this.onChange();
  }

  private setMode(mode: Mode): void {
    this.clearTimer();
    this._mode = mode;
    this._cardOpen = false;
    this._powerOpen = false;
    this.arm(mode);
    this.onChange();
  }

  private arm(mode: Mode): void {
    this.clearTimer();
    const ms = mode === 'notif' && this.notifFromBrowser ? BROWSER_NOTIF_MS : TRANSIENT_MS[mode];
    if (ms === undefined || this.hovering) return;
    if (mode === 'notif' && this.notifSticky) return;
    this.timerId = this.scheduler.setTimeout(() => {
      this.timerId = null;
      if (this._mode === mode) {
        this._mode = 'compact';
        this.onChange();
      }
    }, ms);
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      this.scheduler.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
