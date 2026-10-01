import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { MAX_NOTE_LENGTH, noteCounter, sanitizeNote } from '../core/note.js';
import { phosphor } from './icons.js';
import { colors } from './tokens.js';

const NOTE_KEY = 'note-text';
const SAVE_DEBOUNCE_MS = 300;

function fieldStyle(focused: boolean): string {
  return `
    padding: 8px 10px;
    border-radius: 10px;
    background-color: ${colors.neutral900};
    border: 1px solid ${focused ? colors.accent : colors.neutral800};
    font-size: 13px;
    color: ${colors.text};
  `;
}

function header(counter: St.Label): St.BoxLayout {
  const row = new St.BoxLayout({ style: 'spacing: 8px;', height: 22 });
  row.add_child(
    new St.Icon({
      gicon: phosphor('note-fill'),
      icon_size: 15,
      style: `color: ${colors.accent300};`,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  row.add_child(
    new St.Label({
      text: 'Nota',
      style: `font-size: 13px; font-weight: 500; color: ${colors.text};`,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    }),
  );
  row.add_child(counter);
  return row;
}

// Modo `note` (specs/16-widgets.md "Modo `note`"): cabeçalho e um campo de
// várias linhas com quebra automática. Grava com debounce de 300ms e ao
// fechar; Enter e Esc fecham a ilha.
export const NoteView = GObject.registerClass(
  class NoteView extends St.BoxLayout {
    private readonly settings: Gio.Settings;
    private readonly entry: St.Entry;
    private readonly counter: St.Label;
    private saveTimerId: number | null = null;

    constructor(settings: Gio.Settings, onClose: () => void) {
      super({
        orientation: Clutter.Orientation.VERTICAL,
        style: 'padding: 12px 14px; spacing: 8px;',
        x_expand: true,
        y_expand: true,
      });
      this.settings = settings;

      this.counter = new St.Label({
        style: `font-size: 11px; color: ${colors.neutral500};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(header(this.counter));

      this.entry = new St.Entry({
        can_focus: true,
        hint_text: 'Escreva um recado para a barra',
        style: fieldStyle(false),
        x_expand: true,
        y_expand: true,
      });
      const text = this.entry.clutter_text;
      text.single_line_mode = false;
      text.line_wrap = true;
      text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      text.max_length = MAX_NOTE_LENGTH;
      text.y_align = Clutter.ActorAlign.START;
      text.connectObject(
        'text-changed',
        () => this.onTextChanged(),
        'key-focus-in',
        () => (this.entry.style = fieldStyle(true)),
        'key-focus-out',
        () => (this.entry.style = fieldStyle(false)),
        // Antes do handler da classe, que inseriria a quebra de linha.
        'key-press-event',
        (_actor: Clutter.Text, event: Clutter.Event) => {
          const key = event.get_key_symbol();
          if (key !== Clutter.KEY_Return && key !== Clutter.KEY_KP_Enter)
            return Clutter.EVENT_PROPAGATE;
          onClose();
          return Clutter.EVENT_STOP;
        },
        this,
      );
      this.add_child(this.entry);

      this.connectObject('destroy', () => this.save(), this);
    }

    /** Abrir o modo: texto salvo, foco no campo e cursor no fim. */
    onOpen(): void {
      this.entry.text = this.settings.get_string(NOTE_KEY);
      this.counter.text = noteCounter(this.entry.text);
      this.focus();
    }

    /** O grab modal leva o foco para a ilha; o campo o pega de volta. */
    focus(): void {
      this.entry.grab_key_focus();
      this.entry.clutter_text.set_cursor_position(-1);
      this.entry.clutter_text.set_selection_bound(-1);
    }

    onClose(): void {
      this.save();
    }

    private onTextChanged(): void {
      const text = this.entry.text;
      const clean = sanitizeNote(text);
      if (clean !== text) {
        // Quebra de linha colada: troca e volta o cursor para onde estava.
        const cursor = this.entry.clutter_text.get_cursor_position();
        this.entry.text = clean;
        this.entry.clutter_text.set_cursor_position(cursor);
        return;
      }
      this.counter.text = noteCounter(clean);
      this.scheduleSave();
    }

    private scheduleSave(): void {
      if (this.saveTimerId !== null) GLib.Source.remove(this.saveTimerId);
      this.saveTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DEBOUNCE_MS, () => {
        this.saveTimerId = null;
        this.save();
        return GLib.SOURCE_REMOVE;
      });
    }

    private save(): void {
      if (this.saveTimerId !== null) {
        GLib.Source.remove(this.saveTimerId);
        this.saveTimerId = null;
      }
      const text = sanitizeNote(this.entry.text);
      if (text !== this.settings.get_string(NOTE_KEY)) this.settings.set_string(NOTE_KEY, text);
    }
  },
);

export type NoteViewActor = InstanceType<typeof NoteView>;
