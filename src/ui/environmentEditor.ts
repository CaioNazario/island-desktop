import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
  addEnvironment,
  ENV_ICONS,
  MAX_ENVIRONMENTS,
  MAX_NAME_LENGTH,
  removeEnvironment,
  WIDGET_CATALOG,
  WIDGET_IDS,
  type Side,
  type WidgetId,
} from '../core/environments.js';
import type { EditSession } from './editSession.js';
import { phosphor } from './icons.js';
import { colors, derivedColors } from './tokens.js';
import { makeWidgetDraggable } from './widgetArea.js';

const PANEL = { width: 880, top: 48 };
const AUTO_HIDE_KEY = 'auto-hide';
const SWITCH_MS = 200;
const USED_OPACITY = Math.round(0.45 * 255);
const LIMIT_OPACITY = Math.round(0.35 * 255);
const DANGER = derivedColors.powerOffText;

function icon(glyph: string, size: number, color: string): St.Icon {
  return new St.Icon({
    gicon: phosphor(glyph),
    icon_size: size,
    style: `color: ${color};`,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

function label(text: string, style: string): St.Label {
  const view = new St.Label({ text, style, y_align: Clutter.ActorAlign.CENTER });
  view.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  return view;
}

function row(spacing: number): St.BoxLayout {
  return new St.BoxLayout({ style: `spacing: ${spacing}px;`, x_expand: true });
}

/** Botão com fundo trocado no hover (St não tem `:hover` em estilo inline). */
function button(
  child: Clutter.Actor,
  style: (hover: boolean) => string,
  onClick: (() => void) | null,
): St.Button {
  const view = new St.Button({ child, track_hover: true, y_align: Clutter.ActorAlign.CENTER });
  const sync = (): void => {
    view.style = style(view.hover);
  };
  sync();
  view.connectObject('notify::hover', sync, view);
  if (onClick) {
    view.connectObject('clicked', onClick, view);
    view.set_cursor_type(Clutter.CursorType.POINTER);
  }
  return view;
}

function iconText(glyph: string, iconSize: number, text: string, color: string, size: number) {
  const box = new St.BoxLayout({ style: 'spacing: 6px;' });
  box.add_child(icon(glyph, iconSize, color));
  box.add_child(label(text, `font-size: ${size}px; color: ${color};`));
  return box;
}

// Editor de ambientes (specs/17-editor-ambientes.md): fundo escurecido na
// tela inteira e painel de 880px no monitor da barra que o abriu. As linhas
// se refazem a cada mudança; o campo de nome fica, para não perder o foco.
export class EnvironmentEditor {
  private readonly session: EditSession;
  private readonly settings: Gio.Settings;
  private readonly onSelectEnvironment: (index: number) => void;
  private readonly onClose: () => void;
  private readonly backdrop: St.Widget;
  private readonly tabs: St.BoxLayout;
  private readonly nameEntry: St.Entry;
  private readonly icons: St.BoxLayout;
  private readonly deleteButton: St.Button;
  private readonly selection: St.BoxLayout;
  private readonly catalogHeader: St.BoxLayout;
  private readonly catalog: St.Widget;
  private readonly autoHideTrack: St.Widget;
  private readonly autoHideKnob: St.Widget;
  private readonly grab: Clutter.Grab;
  private readonly unsubscribe: () => void;

  constructor(
    session: EditSession,
    monitor: { x: number; y: number; width: number },
    settings: Gio.Settings,
    onSelectEnvironment: (index: number) => void,
    onClose: () => void,
  ) {
    this.session = session;
    this.settings = settings;
    this.onSelectEnvironment = onSelectEnvironment;
    this.onClose = onClose;

    // Fundo: `bg` 50%, sem o blur do design.
    this.backdrop = new St.Widget({
      reactive: true,
      style: 'background-color: rgba(22,24,38,0.5);',
    });
    this.backdrop.add_constraint(
      new Clutter.BindConstraint({ source: global.stage, coordinate: Clutter.BindCoordinate.ALL }),
    );

    // Painel: `bg` 94%, anel `neutral-800`, sem blur e sem sombra.
    const panel = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      reactive: true,
      width: PANEL.width,
      style: `
        padding: 16px;
        spacing: 14px;
        border-radius: 20px;
        background-color: rgba(22,24,38,0.94);
        border: 1px solid ${colors.neutral800};
        color: ${colors.text};
      `,
    });
    panel.set_position(
      monitor.x + Math.round((monitor.width - PANEL.width) / 2),
      monitor.y + PANEL.top,
    );

    this.tabs = row(6);
    panel.add_child(this.tabs);

    const environmentRow = row(10);
    this.nameEntry = this.buildNameEntry();
    const nameField = new St.BoxLayout({
      style: `
        width: 240px;
        height: 34px;
        spacing: 8px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px solid ${colors.neutral800};
        background-color: ${colors.neutral900};
      `,
    });
    nameField.add_child(icon('pencil-simple', 14, colors.neutral400));
    nameField.add_child(this.nameEntry);
    environmentRow.add_child(nameField);
    this.icons = new St.BoxLayout({ style: 'spacing: 4px;' });
    environmentRow.add_child(this.icons);
    environmentRow.add_child(new St.Widget({ x_expand: true }));
    this.deleteButton = button(
      iconText('trash', 14, 'Excluir ambiente', DANGER, 12),
      (hover) =>
        `height: 30px; padding: 0 12px; border-radius: 15px; background-color: ${hover ? colors.neutral900 : 'transparent'};`,
      () => this.deleteEnvironment(),
    );
    environmentRow.add_child(this.deleteButton);
    panel.add_child(environmentRow);

    this.selection = new St.BoxLayout({
      style: `height: 40px; spacing: 8px; padding: 0 8px 0 12px; border-radius: 12px; background-color: ${colors.neutral900};`,
      x_expand: true,
    });
    panel.add_child(this.selection);

    this.catalogHeader = row(8);
    panel.add_child(this.catalogHeader);
    const grid = new Clutter.GridLayout({
      column_homogeneous: true,
      column_spacing: 6,
      row_spacing: 6,
    });
    this.catalog = new St.Widget({ layout_manager: grid, x_expand: true });
    panel.add_child(this.catalog);

    this.autoHideTrack = new St.Widget({
      width: 32,
      height: 18,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.autoHideKnob = new St.Widget({ width: 14, height: 14, y: 2 });
    this.autoHideTrack.add_child(this.autoHideKnob);
    panel.add_child(this.buildAutoHideRow());

    const footer = row(8);
    footer.add_child(icon('hand-swipe-left', 15, colors.neutral500));
    footer.add_child(
      label(
        'Deslize com dois dedos sobre a barra para trocar de ambiente. No teclado: Super+Ctrl+← / Super+Ctrl+→.',
        `font-size: 11.5px; color: ${colors.neutral500};`,
      ),
    );
    panel.add_child(footer);

    this.backdrop.add_child(panel);
    Main.layoutManager.modalDialogGroup.add_child(this.backdrop);

    this.backdrop.connectObject(
      'button-press-event',
      (_actor: St.Widget, event: Clutter.Event) => {
        if (global.stage.get_event_actor(event) !== this.backdrop) return Clutter.EVENT_PROPAGATE;
        this.onClose();
        return Clutter.EVENT_STOP;
      },
      'key-press-event',
      (_actor: St.Widget, event: Clutter.Event) => {
        if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
        this.onClose();
        return Clutter.EVENT_STOP;
      },
      this,
    );

    // Grab no `uiGroup`, não no fundo: a barra (outra camada) continua
    // clicável e arrastável (spike S5).
    this.grab = Main.pushModal(Main.uiGroup, { actionMode: Shell.ActionMode.POPUP });
    global.stage.set_key_focus(this.backdrop);

    this.settings.connectObject(`changed::${AUTO_HIDE_KEY}`, () => this.syncAutoHide(true), this);
    this.syncAutoHide(false);
    this.unsubscribe = session.onChange(() => this.sync());
    this.sync();
  }

  destroy(): void {
    this.unsubscribe();
    this.settings.disconnectObject(this);
    Main.popModal(this.grab);
    this.backdrop.destroy();
  }

  private sync(): void {
    const envs = this.session.environments;
    const env = envs.active;
    if (this.nameEntry.get_text() !== env.name) this.nameEntry.set_text(env.name);
    this.deleteButton.visible = envs.index > 0;
    this.syncTabs();
    this.syncIcons();
    this.syncSelection();
    this.syncCatalog();
  }

  // Linha 1: "Ambientes", uma aba por ambiente, "Novo" e "Concluir".
  private syncTabs(): void {
    this.tabs.destroy_all_children();
    this.tabs.add_child(
      label('Ambientes', 'font-size: 14px; font-weight: 500; margin-right: 8px;'),
    );
    const envs = this.session.environments;
    envs.environments.forEach((env, index) => {
      const active = index === envs.index;
      const fg = active ? colors.accent100 : colors.neutral300;
      const content = new St.BoxLayout({ style: 'spacing: 7px;' });
      content.add_child(icon(env.icon, 14, fg));
      content.add_child(label(env.name || 'Sem nome', `font-size: 12.5px; color: ${fg};`));
      this.tabs.add_child(
        button(
          content,
          (hover) => {
            const bg = hover ? colors.neutral800 : active ? colors.accent900 : colors.neutral900;
            const ring = active ? colors.accent700 : bg;
            return `height: 30px; padding: 0 12px; border-radius: 15px; background-color: ${bg}; border: 1px solid ${ring};`;
          },
          () => this.onSelectEnvironment(index),
        ),
      );
    });
    if (envs.environments.length < MAX_ENVIRONMENTS) {
      this.tabs.add_child(
        button(
          iconText('plus', 13, 'Novo', colors.neutral300, 12.5),
          (hover) =>
            `height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid ${colors.neutral800}; background-color: ${hover ? colors.neutral900 : 'transparent'};`,
          () => this.addEnvironment(),
        ),
      );
    }
    this.tabs.add_child(new St.Widget({ x_expand: true }));
    // `.btn-primary`: texto e anel `accent`, hover 12%.
    this.tabs.add_child(
      button(
        label('Concluir', `font-size: 12.5px; font-weight: 500; color: ${colors.accent};`),
        (hover) =>
          `height: 30px; padding: 0 14px; border-radius: 8px; border: 1px solid ${colors.accent}; background-color: ${hover ? derivedColors.btnPrimaryHover : 'transparent'};`,
        () => this.onClose(),
      ),
    );
  }

  // Linha 2: nome (grava enquanto digita) e os 9 ícones.
  private buildNameEntry(): St.Entry {
    const entry = new St.Entry({
      can_focus: true,
      hint_text: 'Nome do ambiente',
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
      style: `padding: 0; border: 0; background-color: transparent; color: ${colors.text}; font-size: 12.5px;`,
    });
    entry.clutter_text.max_length = MAX_NAME_LENGTH;
    entry.clutter_text.connectObject(
      'text-changed',
      () => {
        const name = entry.get_text();
        if (name !== this.session.environments.active.name)
          this.session.update((env) => ({ ...env, name }));
      },
      entry,
    );
    return entry;
  }

  private syncIcons(): void {
    this.icons.destroy_all_children();
    const current = this.session.environments.active.icon;
    for (const glyph of ENV_ICONS) {
      const chosen = glyph === current;
      const content = new St.Bin({
        child: icon(glyph, 16, chosen ? colors.accent200 : colors.neutral400),
        width: 32,
        height: 32,
      });
      this.icons.add_child(
        button(
          content,
          (hover) => {
            const bg = chosen ? colors.accent900 : hover ? colors.neutral900 : 'transparent';
            const ring = chosen ? colors.accent700 : 'transparent';
            return `border-radius: 10px; background-color: ${bg}; border: 1px solid ${ring};`;
          },
          () => this.session.update((env) => ({ ...env, icon: glyph })),
        ),
      );
    }
  }

  private addEnvironment(): void {
    const envs = this.session.environments;
    const count = envs.environments.length;
    const next = addEnvironment(envs.environments);
    if (next.length === count) return;
    envs.setEnvironments(next);
    this.onSelectEnvironment(count);
  }

  /** Na hora, sem confirmação, indo para o ambiente anterior. */
  private deleteEnvironment(): void {
    const envs = this.session.environments;
    const index = envs.index;
    if (index === 0) return;
    // Troca antes de excluir: o índice ativo nunca aponta para fora da lista.
    this.onSelectEnvironment(index - 1);
    envs.setEnvironments(removeEnvironment(envs.environments, index));
  }

  // Linha 3: seleção.
  private syncSelection(): void {
    this.selection.destroy_all_children();
    const selected = this.session.selected;
    if (!selected) {
      this.selection.add_child(icon('cursor-click', 15, colors.neutral400));
      const hint = label(
        'Clique num widget da barra para mover ou remover. Arraste da lista para uma pílula, ou reordene arrastando na própria barra.',
        `font-size: 12px; color: ${colors.neutral400};`,
      );
      hint.x_expand = true;
      hint.clutter_text.line_wrap = true;
      hint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      this.selection.add_child(hint);
      return;
    }
    const { id, side, index, count } = selected;
    const info = WIDGET_CATALOG[id];
    this.selection.add_child(icon(info.icon, 16, colors.accent300));
    this.selection.add_child(label(info.name, 'font-size: 12.5px; font-weight: 500;'));
    const pill = side === 'left' ? 'Pílula esquerda' : 'Pílula direita';
    this.selection.add_child(
      label(
        `${pill} · ${index + 1} de ${count}`,
        `font-size: 11.5px; color: ${colors.neutral500};`,
      ),
    );
    this.selection.add_child(new St.Widget({ x_expand: true }));

    const actions = new St.BoxLayout({
      style: 'spacing: 4px;',
      y_align: Clutter.ActorAlign.CENTER,
    });
    const step = (glyph: string, enabled: boolean, at: number): St.Button => {
      const view = button(
        new St.Bin({ child: icon(glyph, 13, colors.text), width: 28, height: 28 }),
        (hover) =>
          `border-radius: 14px; background-color: ${hover ? colors.neutral800 : 'transparent'};`,
        () => {
          if (enabled) this.session.place(id, side, at);
        },
      );
      if (!enabled) view.opacity = LIMIT_OPACITY;
      return view;
    };
    actions.add_child(step('caret-left', index > 0, index - 1));
    // `at` conta na lista de antes: +2 para passar o vizinho da direita.
    actions.add_child(step('caret-right', index < count - 1, index + 2));
    const other: Side = side === 'left' ? 'right' : 'left';
    actions.add_child(
      button(
        iconText(
          'arrows-left-right',
          13,
          side === 'left' ? 'Mover para a direita' : 'Mover para a esquerda',
          colors.text,
          11.5,
        ),
        (hover) =>
          `height: 28px; padding: 0 10px; border-radius: 14px; background-color: ${hover ? colors.neutral700 : colors.neutral800};`,
        () => this.session.place(id, other, null),
      ),
    );
    actions.add_child(
      button(
        iconText('minus-circle', 13, 'Remover', DANGER, 11.5),
        (hover) =>
          `height: 28px; padding: 0 10px; border-radius: 14px; background-color: ${hover ? colors.neutral800 : 'transparent'};`,
        () => this.session.remove(id),
      ),
    );
    this.selection.add_child(actions);
  }

  // Linha 4: cabeçalho com a pílula-alvo e a grade do catálogo.
  private syncCatalog(): void {
    const env = this.session.environments.active;
    const used = new Set<WidgetId>([...env.left, ...env.right]);

    this.catalogHeader.destroy_all_children();
    this.catalogHeader.add_child(label('Widgets', 'font-size: 13px; font-weight: 500;'));
    this.catalogHeader.add_child(
      label(
        `${used.size} em uso`,
        `font-size: 11px; padding: 1px 7px; border-radius: 9px; background-color: ${colors.neutral900}; color: ${colors.neutral300};`,
      ),
    );
    this.catalogHeader.add_child(new St.Widget({ x_expand: true }));
    this.catalogHeader.add_child(
      label('Adicionar em', `font-size: 11.5px; color: ${colors.neutral400};`),
    );
    const segmented = new St.BoxLayout({
      style: `padding: 2px; border-radius: 13px; background-color: ${colors.neutral900};`,
      y_align: Clutter.ActorAlign.CENTER,
    });
    for (const [side, text] of [
      ['left', 'Esquerda'],
      ['right', 'Direita'],
    ] as const) {
      const chosen = this.session.target === side;
      segmented.add_child(
        button(
          label(
            text,
            `font-size: 11.5px; color: ${chosen ? colors.accent100 : colors.neutral400};`,
          ),
          () =>
            `height: 22px; padding: 0 10px; border-radius: 11px; background-color: ${chosen ? colors.accent800 : 'transparent'};`,
          () => this.session.setTarget(side, false),
        ),
      );
    }
    this.catalogHeader.add_child(segmented);

    this.catalog.destroy_all_children();
    const grid = this.catalog.layout_manager as Clutter.GridLayout;
    WIDGET_IDS.forEach((id, i) => {
      grid.attach(this.catalogCard(id, used.has(id)), i % 4, Math.floor(i / 4), 1, 1);
    });
  }

  private catalogCard(id: WidgetId, used: boolean): St.Button {
    const info = WIDGET_CATALOG[id];
    const content = new St.BoxLayout({ style: 'spacing: 10px;', x_expand: true });
    content.add_child(
      new St.Bin({
        child: icon(info.icon, 16, colors.accent300),
        width: 30,
        height: 30,
        style: `border-radius: 9px; background-color: ${colors.accent900};`,
        y_align: Clutter.ActorAlign.CENTER,
      }),
    );
    const text = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    text.add_child(label(info.name, 'font-size: 12.5px; font-weight: 500;'));
    text.add_child(label(info.description, `font-size: 11px; color: ${colors.neutral500};`));
    content.add_child(text);
    content.add_child(
      used ? icon('check-circle-fill', 13, colors.accent400) : icon('plus', 13, colors.neutral400),
    );

    const card = button(
      content,
      (hover) =>
        `padding: 9px 10px; border-radius: 12px; background-color: ${hover && !used ? colors.neutral800 : colors.neutral900};`,
      used ? null : () => this.session.place(id, this.session.target, null),
    );
    card.x_expand = true;
    if (used) {
      card.opacity = USED_OPACITY;
      card.reactive = false;
    } else {
      card.set_cursor_type(Clutter.CursorType.GRAB);
      makeWidgetDraggable(card, card, { id, from: 'catalog' });
    }
    return card;
  }

  // Linha 5: auto-ocultar (comportamento na spec 18).
  private buildAutoHideRow(): St.Button {
    const content = new St.BoxLayout({ style: 'spacing: 12px;', x_expand: true });
    content.add_child(icon('eye-slash', 16, colors.neutral300));
    const text = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    text.add_child(label('Ocultar barra automaticamente', 'font-size: 12.5px; font-weight: 500;'));
    text.add_child(
      label(
        'A barra some e reaparece quando o ponteiro encosta na borda de cima da tela',
        `font-size: 11px; color: ${colors.neutral500};`,
      ),
    );
    content.add_child(text);
    content.add_child(this.autoHideTrack);
    const view = button(
      content,
      (hover) =>
        `padding: 10px 12px; border-radius: 12px; background-color: ${hover ? colors.neutral800 : colors.neutral900};`,
      () => this.settings.set_boolean(AUTO_HIDE_KEY, !this.settings.get_boolean(AUTO_HIDE_KEY)),
    );
    view.x_expand = true;
    return view;
  }

  private syncAutoHide(animate: boolean): void {
    const on = this.settings.get_boolean(AUTO_HIDE_KEY);
    this.autoHideTrack.style = `
      border-radius: 9px;
      background-color: ${on ? colors.accent800 : colors.neutral800};
      ${on ? `border: 1px solid ${colors.accent};` : ''}
      transition-duration: ${SWITCH_MS}ms;
    `;
    this.autoHideKnob.style = `border-radius: 7px; background-color: ${on ? colors.accent200 : colors.neutral400}; transition-duration: ${SWITCH_MS}ms;`;
    const x = on ? 16 : 2;
    if (animate)
      this.autoHideKnob.ease({ x, duration: SWITCH_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    else this.autoHideKnob.x = x;
  }
}
