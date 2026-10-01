import type Gio from 'gi://Gio';

import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';
import { colors } from './tokens.js';

const NOTE_KEY = 'note-text';
const LABEL_MAX = 150;

// Widget Nota (specs/16-widgets.md `note`): ícone · texto. Vazia, ícone
// `neutral-500` e "Nota vazia". O clique abre/fecha o modo `note`.
export function noteWidget(settings: Gio.Settings, toggleNote: () => void): TopbarWidgetActor {
  const widget = new TopbarWidget(toggleNote, LABEL_MAX);
  const sync = (): void => {
    const text = settings.get_string(NOTE_KEY);
    widget.display({
      icon: 'note-fill',
      iconColor: text ? colors.accent300 : colors.neutral500,
      label: text || 'Nota vazia',
    });
  };
  sync();
  settings.connectObject(`changed::${NOTE_KEY}`, sync, widget);
  return widget;
}
