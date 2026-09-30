import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isFixedMode, IslandState, type Mode, type Scheduler } from '../core/island.js';
import { routeNotification, type IncomingNotification } from '../core/notifications.js';
import { SystemAiUsage } from '../system/aiUsage.js';
import { SystemBattery } from '../system/battery.js';
import { SystemBluetooth } from '../system/bluetooth.js';
import { SystemBrightness } from '../system/brightness.js';
import { SystemCalendarEvents } from '../system/calendarEvents.js';
import { SystemHardware } from '../system/hardware.js';
import { SystemMpris } from '../system/mpris.js';
import { SystemNotifications, type NotificationEntry } from '../system/notifications.js';
import { callerStack, debugLog, syncDebugLog } from '../system/debugLog.js';
import { SystemEnvironments, type SwitchDirection } from '../system/environments.js';
import { OsdRedirect } from '../system/osd.js';
import { SystemSession } from '../system/session.js';
import { GSettingsToggle } from '../system/toggleSetting.js';
import { SystemVolume } from '../system/volume.js';
import { SystemWifi } from '../system/wifi.js';
import { SystemWeather } from '../system/weather.js';
import { WeatherHint } from '../system/weatherHint.js';
import { Bar } from './barChrome.js';
import type { IslandSystem } from './island.js';

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

// Existe um único IslandState compartilhado entre monitores (specs/02-barra.md):
// só a ilha do monitor-alvo mostra o modo atual, as outras ficam em `compact`.
export class BarManager {
  private readonly state: IslandState;
  private readonly system: IslandSystem;
  private readonly battery = new SystemBattery();
  private readonly hardware = new SystemHardware();
  private readonly notifications = new SystemNotifications();
  private readonly music = new SystemMpris();
  private readonly calendar = new SystemCalendarEvents();
  private readonly weather: SystemWeather;
  private readonly aiUsage: SystemAiUsage;
  private readonly environments: SystemEnvironments;
  private readonly weatherHint: WeatherHint;
  private bars: Bar[] = [];
  private targetMonitorIndex = 0;
  private grab: Clutter.Grab | null = null;
  private grabbedActor: Clutter.Actor | null = null;
  private readonly osdRedirect: OsdRedirect;
  private readonly unsubscribeWifi: () => void;
  private readonly unsubscribeBt: () => void;
  private readonly unsubscribeArrival: () => void;
  private readonly unsubscribeTrack: () => void;
  private readonly unsubscribeEnvironments: () => void;
  // Monitor de onde veio a última troca de ambiente pedida na barra.
  private environmentMonitorIndex: number | null = null;

  constructor(settings: Gio.Settings, openPreferences: () => void) {
    syncDebugLog();
    this.state = new IslandState(new GLibScheduler(), {
      islandClickOpens: () =>
        settings.get_string('click-action') === 'calendar' ? 'calendar' : 'card',
      onChange: () => this.render(),
      log: (message, caller) => debugLog(caller ? `${message} at ${callerStack(3)}` : message),
    });
    this.weather = new SystemWeather(settings);
    this.aiUsage = new SystemAiUsage(settings);
    this.environments = new SystemEnvironments(settings);
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
      notifications: this.notifications,
      music: this.music,
      calendar: this.calendar,
      weather: this.weather,
      aiUsage: this.aiUsage,
      environments: this.environments,
      settings,
      openPreferences: (page) => {
        // O `openPreferences()` não escolhe página; a janela lê esta chave.
        settings.set_string('prefs-page', page);
        openPreferences();
      },
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
    this.unsubscribeArrival = this.notifications.onArrival((entry, incoming) =>
      this.handleNotificationArrival(entry, incoming),
    );
    this.unsubscribeTrack = this.music.onTrackChange(() => this.handleTrackChange());
    this.unsubscribeEnvironments = this.environments.onChange((direction) => {
      if (direction) this.handleEnvironmentSwitch();
    });
    this.rebuild();
    Main.layoutManager.connectObject('monitors-changed', () => this.rebuild(), this);
    // Depois do `rebuild()`: a dica chega como notificação e a ilha já precisa existir.
    this.weatherHint = new WeatherHint(settings, this.weather, openPreferences);
  }

  /**
   * Tecla de volume: monitor da janela focada (specs/02-barra.md). Com modo
   * fixo ou cartão aberto, o valor já mudou no sistema; a ilha não se move
   * (regra 4 da spec 03), então nem tenta trocar de monitor-alvo.
   */
  private triggerVolumeKey(): void {
    debugLog(this.keyLog('triggerVolumeKey'));
    if (this.state.cardOpen || isFixedMode(this.state.mode)) return;
    this.targetMonitorIndex = this.focusedMonitorIndex();
    this.state.volumeKey();
    this.render();
  }

  /** Tecla de brilho: mesma regra da tecla de volume acima. */
  private triggerBrightnessKey(): void {
    debugLog(this.keyLog('triggerBrightnessKey'));
    if (this.state.cardOpen || isFixedMode(this.state.mode)) return;
    this.targetMonitorIndex = this.focusedMonitorIndex();
    this.state.brightnessKey();
    this.render();
  }

  private keyLog(name: string): string {
    const { mode, cardOpen } = this.state;
    return `${name} mode=${mode} card=${cardOpen} focusedMon=${this.focusedMonitorIndex()} target=${this.targetMonitorIndex} bars=${this.bars.length}`;
  }

  /** Roteamento de notificação nova (specs/04-notificacoes.md). */
  private handleNotificationArrival(
    entry: NotificationEntry,
    incoming: IncomingNotification,
  ): void {
    const route = routeNotification(incoming, {
      mode: this.state.mode,
      cardOpen: this.state.cardOpen,
    });
    if (route === 'stack') this.bars.forEach((bar) => bar.island.flashStack(entry));
    if (route === 'banner') this.bars[this.targetMonitorIndex]?.banner.present(entry);
    if (route !== 'notif') return;
    // Transitório: monitor da janela focada (specs/02-barra.md). Com `notif`
    // já aberto, a troca de conteúdo fica onde está.
    if (this.state.mode === 'compact') this.targetMonitorIndex = this.focusedMonitorIndex();
    this.bars.forEach((bar) => bar.island.setNotification(entry));
    this.state.openNotification(incoming.critical, incoming.fromBrowser);
  }

  /** Troca de faixa: abre `music` pela regra 3 da spec 03 (specs/05-musica.md). */
  private handleTrackChange(): void {
    // Transitório: monitor da janela focada (specs/02-barra.md), como o `notif`.
    const index =
      this.state.mode === 'compact' ? this.focusedMonitorIndex() : this.targetMonitorIndex;
    if (!this.state.openAutomatic('music')) return;
    this.targetMonitorIndex = index;
    this.render();
  }

  /**
   * Troca de ambiente (specs/15-ambientes.md "Modo `env`"): na barra onde a
   * troca foi pedida, ou no monitor da janela focada (atalho, editor).
   */
  private handleEnvironmentSwitch(): void {
    const index = this.environmentMonitorIndex ?? this.focusedMonitorIndex();
    this.environmentMonitorIndex = null;
    if (this.state.mode === 'compact') this.targetMonitorIndex = index;
    if (this.state.environmentSwitched()) this.render();
  }

  private handleEnvironmentSelect(monitorIndex: number, index: number): void {
    this.environmentMonitorIndex = monitorIndex;
    this.environments.select(index);
  }

  /** Atalho de troca: o `env` aparece no monitor da janela focada. */
  stepEnvironmentFromShortcut(direction: SwitchDirection): void {
    this.environmentMonitorIndex = null;
    this.environments.step(direction);
  }

  private handleEnvironmentStep(monitorIndex: number, direction: SwitchDirection): void {
    this.environmentMonitorIndex = monitorIndex;
    this.environments.step(direction);
  }

  /** Clique no banner: abre `stack` naquela barra e marca tudo como lido. */
  private handleBannerOpen(monitorIndex: number): void {
    this.bars.forEach((bar) => bar.banner.dismiss());
    this.targetMonitorIndex = monitorIndex;
    this.state.openFromTrigger('stack');
    this.notifications.markAllRead();
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
    // Abrir a lista pelo sino marca tudo como lido (specs/04-notificacoes.md).
    if (this.state.mode === 'stack') this.notifications.markAllRead();
    this.render();
  }

  private handleIslandClick(monitorIndex: number): void {
    this.targetMonitorIndex = monitorIndex;
    // Abrir a lista pelo `notif` marca tudo como lido (specs/04-notificacoes.md).
    if (this.state.islandClick() === 'opened-stack') this.notifications.markAllRead();
    this.render();
  }

  private rebuild(): void {
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedActor = null;
    }
    this.bars.forEach((bar) => bar.destroy());
    this.bars = Main.layoutManager.monitors.map(
      (monitor, index) =>
        new Bar(
          monitor,
          this.state,
          this.system,
          this.battery,
          this.hardware,
          () => this.handleIslandClick(index),
          () => this.handleEscape(),
          (mode) => this.handleBarTrigger(index, mode),
          () => this.handleBannerOpen(index),
          (environment) => this.handleEnvironmentSelect(index, environment),
          (direction) => this.handleEnvironmentStep(index, direction),
        ),
    );
    this.render();
  }

  private render(): void {
    this.bars.forEach((bar, index) => bar.render(index === this.targetMonitorIndex));
    this.syncGrab();
  }

  /** Modos fixos e o cartão central tomam o foco de teclado (specs/03-ilha.md). */
  private syncGrab(): void {
    const shouldGrab = this.state.cardOpen || isFixedMode(this.state.mode);
    const targetActor = this.bars[this.targetMonitorIndex]?.island ?? null;
    const wantedActor = shouldGrab ? targetActor : null;

    if (wantedActor === this.grabbedActor) return;

    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedActor = null;
    }
    if (wantedActor) {
      // POPUP, como os menus do Shell: o padrão (NONE) filtra todos os
      // atalhos globais, e aí `Super+S` não fecharia a ilha.
      this.grab = Main.pushModal(wantedActor, { actionMode: Shell.ActionMode.POPUP });
      this.grabbedActor = wantedActor;
    }
  }

  destroy(): void {
    Main.layoutManager.disconnectObject(this);
    this.unsubscribeWifi();
    this.unsubscribeBt();
    this.unsubscribeArrival();
    this.unsubscribeTrack();
    this.unsubscribeEnvironments();
    if (this.grab) {
      Main.popModal(this.grab);
      this.grab = null;
      this.grabbedActor = null;
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
    this.battery.destroy();
    this.hardware.destroy();
    this.notifications.destroy();
    this.music.destroy();
    this.calendar.destroy();
    this.weatherHint.destroy();
    this.weather.destroy();
    this.aiUsage.destroy();
    this.environments.destroy();
    this.osdRedirect.destroy();
  }
}
