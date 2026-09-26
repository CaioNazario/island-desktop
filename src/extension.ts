import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { BarManager } from './ui/bar.js';

export default class IslandExtension extends Extension {
  private barManager: BarManager | null = null;

  override enable(): void {
    // A Island é dona do painel: o strut do panelBox padrão sai de cena e as
    // três pílulas passam a reservar o próprio espaço (specs/02-barra.md).
    Main.layoutManager.untrackChrome(Main.layoutManager.panelBox);
    Main.panel.hide();
    this.barManager = new BarManager();
  }

  override disable(): void {
    this.barManager?.destroy();
    this.barManager = null;
    Main.panel.show();
    Main.layoutManager.trackChrome(Main.layoutManager.panelBox, {
      affectsStruts: true,
      trackFullscreen: true,
    });
  }
}
