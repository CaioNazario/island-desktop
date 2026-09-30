import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { WidgetId } from '../core/environments.js';
import type { Mode } from '../core/island.js';
import type { AiUsageSource } from '../system/aiUsage.js';
import type { HardwareSource } from '../system/hardware.js';
import { AiButton, type AiButtonActor } from './aiButton.js';
import { countdownWidget } from './countdownWidget.js';
import { HardwareGroup, type HardwareGroupActor } from './hardwareGroup.js';
import { progressWidget } from './progressWidget.js';

export interface WidgetSources {
  aiUsage: AiUsageSource;
  hardware: HardwareSource;
  settings: Gio.Settings;
  openPreferences: (page: string) => void;
}

// Área de widgets de uma pílula lateral (specs/16-widgets.md "Pílulas"): os
// widgets do ambiente ativo, gap 2px, encostados na ilha (`side` diz de que
// lado ela fica). Id ainda sem widget não mostra nada.
export const WidgetArea = GObject.registerClass(
  class WidgetArea extends St.BoxLayout {
    private readonly sources: WidgetSources;
    private readonly towardIsland: 'start' | 'end';
    private readonly onTrigger: (mode: Mode) => void;
    private ids: readonly WidgetId[] = [];
    private aiButton: AiButtonActor | null = null;
    private hardware: HardwareGroupActor | null = null;
    private slackPx = 0;
    private aiActive = false;

    constructor(
      sources: WidgetSources,
      towardIsland: 'start' | 'end',
      onTrigger: (mode: Mode) => void,
    ) {
      super({
        style: 'spacing: 2px;',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.sources = sources;
      this.towardIsland = towardIsland;
      this.onTrigger = onTrigger;
    }

    /** Quanto a pílula está mais larga do que ficaria com a ilha no maior modo. */
    set slack(slack: number) {
      this.slackPx = slack;
      if (this.hardware) this.hardware.slack = slack;
    }

    /** Fundo do botão de IA com o modo `ai` aberto (specs/12-uso-ia.md). */
    set active(aiActive: boolean) {
      this.aiActive = aiActive;
      if (this.aiButton) this.aiButton.active = aiActive;
    }

    /** Monta os widgets de `ids`; com a mesma lista, mantém os atores. */
    setWidgets(ids: readonly WidgetId[]): void {
      if (ids.length === this.ids.length && ids.every((id, i) => id === this.ids[i])) return;
      this.ids = [...ids];
      this.destroy_all_children();
      this.aiButton = null;
      this.hardware = null;

      const widgets = ids.flatMap((id) => {
        const widget = this.build(id);
        return widget ? [widget] : [];
      });
      // O `hw` estica e ocupa a sobra; sem ele, um espaçador empurra os
      // widgets para junto da ilha.
      const expands = widgets.some((widget) => widget.x_expand);
      const spacer = expands ? null : new St.Widget({ x_expand: true });
      if (spacer && this.towardIsland === 'end') this.add_child(spacer);
      widgets.forEach((widget) => this.add_child(widget));
      if (spacer && this.towardIsland === 'start') this.add_child(spacer);
    }

    private build(id: WidgetId): Clutter.Actor | null {
      switch (id) {
        case 'ai':
          this.aiButton = new AiButton(this.sources.aiUsage, () => this.onTrigger('ai'));
          this.aiButton.active = this.aiActive;
          return this.aiButton;
        case 'hw':
          this.hardware = new HardwareGroup(this.sources.hardware);
          this.hardware.slack = this.slackPx;
          return this.hardware;
        case 'progress':
          return progressWidget();
        case 'countdown':
          return countdownWidget(this.sources.settings, () =>
            this.sources.openPreferences('widgets'),
          );
        default:
          return null;
      }
    }
  },
);

export type WidgetAreaActor = InstanceType<typeof WidgetArea>;
