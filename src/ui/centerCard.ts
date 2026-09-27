import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { artistLine, formatTrackTime, progressFraction, sourceGlyph } from '../core/music.js';
import type { MusicSource } from '../system/mpris.js';
import { phosphor } from './icons.js';
import { MusicControls, MusicCover, MusicProgressBar } from './musicView.js';
import { colors, derivedColors, effects } from './tokens.js';

export const CENTER_CARD_WIDTH = 420;
/** `top: 38px` no design: distância do topo da barra. */
export const CENTER_CARD_TOP = 38;
const CARD_RADIUS = 22;
// Entra de `translateY(-10px) scale(.96)`, origem no topo (specs/05-musica.md).
const HIDDEN_OFFSET_Y = -10;
const HIDDEN_SCALE = 0.96;
const CARD_SHADOW = {
  drop: '0 24px 60px rgba(0,0,0,0.6)',
  glow: `0 0 32px ${derivedColors.centralCardGlow}`,
};

function singleLine(label: St.Label): St.Label {
  label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  label.clutter_text.line_wrap = false;
  return label;
}

function shadowLayer(boxShadow: string): St.Widget {
  return new St.Widget({
    style: `border-radius: ${CARD_RADIUS}px; background-color: ${colors.bg}; box-shadow: ${boxShadow};`,
    x_expand: true,
    y_expand: true,
  });
}

type MusicCoverActor = InstanceType<typeof MusicCover>;
type MusicProgressBarActor = InstanceType<typeof MusicProgressBar>;
type MusicControlsActor = InstanceType<typeof MusicControls>;

// Seção de música do cartão (specs/05-musica.md): as peças do modo `music`
// em medidas maiores. Some quando nenhum player é atual.
const CardMusicSection = GObject.registerClass(
  class CardMusicSection extends St.BoxLayout {
    private readonly music: MusicSource;
    private readonly cover: MusicCoverActor;
    private readonly artistLabel: St.Label;
    private readonly titleLabel: St.Label;
    private readonly sourceIcon: St.Icon;
    private readonly bar: MusicProgressBarActor;
    private readonly timeLabel: St.Label;
    private readonly controls: MusicControlsActor;
    private readonly unsubscribe: Array<() => void>;

    constructor(music: MusicSource) {
      super({ orientation: Clutter.Orientation.VERTICAL });
      this.music = music;

      const head = new St.BoxLayout({ style: 'spacing: 14px;' });
      this.cover = new MusicCover(56, 12);
      head.add_child(this.cover);
      const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.artistLabel = singleLine(
        new St.Label({ style: `color: ${colors.text}; font-size: 14px; font-weight: 500;` }),
      );
      this.titleLabel = singleLine(
        new St.Label({ style: `color: ${colors.neutral400}; font-size: 12.5px;` }),
      );
      text.add_child(this.artistLabel);
      text.add_child(this.titleLabel);
      head.add_child(text);
      this.sourceIcon = new St.Icon({
        icon_size: 22,
        style: `color: ${colors.accent400};`,
        y_align: Clutter.ActorAlign.START,
      });
      head.add_child(this.sourceIcon);
      this.add_child(head);

      const progress = new St.BoxLayout({
        style: `spacing: 10px; margin-top: 12px; color: ${colors.neutral500}; font-size: 10.5px; font-feature-settings: "tnum";`,
      });
      this.bar = new MusicProgressBar();
      this.timeLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      progress.add_child(this.bar);
      progress.add_child(this.timeLabel);
      this.add_child(progress);

      // O cartão não tem timer para rearmar.
      this.controls = new MusicControls(
        music,
        { side: 36, sideIcon: 17, main: 40, mainIcon: 24, spacing: 18 },
        () => {},
      );
      this.controls.style = `${this.controls.style ?? ''} margin-top: 6px;`;
      this.controls.x_align = Clutter.ActorAlign.CENTER;
      this.add_child(this.controls);

      this.unsubscribe = [
        music.onChange(() => this.sync()),
        music.onPosition(() => this.syncPosition()),
      ];
      this.sync();
      this.connectObject('destroy', () => this.unsubscribe.forEach((off) => off()), this);
    }

    private sync(): void {
      const track = this.music.track;
      this.visible = track !== null;
      if (!track) return;
      this.cover.setArt(track.artUrl);
      this.artistLabel.text = artistLine(track.artists, track.identity);
      this.titleLabel.text = track.title;
      this.sourceIcon.gicon = phosphor(sourceGlyph(track.identity));
      this.controls.setTrack(track);
      this.syncPosition();
    }

    private syncPosition(): void {
      const track = this.music.track;
      if (!track) return;
      const position = this.music.positionUs;
      this.timeLabel.text = `${formatTrackTime(position)} / ${formatTrackTime(track.lengthUs)}`;
      this.bar.setFraction(progressFraction(position, track.lengthUs));
    }
  },
);

export interface CenterCardOptions {
  onEscape: () => void;
  /** Clique fora do cartão com ele segurando o grab: fecha tudo. */
  onPressOutside: () => void;
  /** Clique em outro ator da barra que trata o próprio clique sob o grab (banner). */
  claimPressUnderGrab: (target: Clutter.Actor) => boolean;
}

// Cartão central (specs/05-musica.md "Cartão central"): abre abaixo da ilha
// compacta, que não muda de tamanho. Como na ilha, o St só compõe um
// `box-shadow` por ator: sombra e brilho são irmãos atrás da superfície.
export const CenterCard = GObject.registerClass(
  class CenterCard extends St.Widget {
    private readonly options: CenterCardOptions;
    private isOpen = false;

    constructor(music: MusicSource, options: CenterCardOptions) {
      super({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        can_focus: true,
        width: CENTER_CARD_WIDTH,
        visible: false,
        opacity: 0,
      });
      this.options = options;
      this.set_pivot_point(0.5, 0);

      const surface = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
        style: `
          padding: 18px;
          border-radius: ${CARD_RADIUS}px;
          background-color: ${derivedColors.centralCardBg};
          border: 1px solid ${colors.neutral800};
        `,
      });
      surface.add_child(new CardMusicSection(music));

      this.add_child(shadowLayer(CARD_SHADOW.glow));
      this.add_child(shadowLayer(CARD_SHADOW.drop));
      this.add_child(surface);

      this.connectObject(
        'captured-event',
        (_actor: St.Widget, event: Clutter.Event) => this.onCapturedEvent(event),
        'key-press-event',
        (_actor: St.Widget, event: Clutter.Event) => {
          if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
          this.options.onEscape();
          return Clutter.EVENT_STOP;
        },
        this,
      );
    }

    // Com o grab modal, o clique fora do cartão é entregue a ele: fecha
    // tudo, inclusive o clique na ilha ("clicar de novo na ilha fecha").
    // STOP para não chegar à janela embaixo (specs/02-barra.md).
    private onCapturedEvent(event: Clutter.Event): boolean {
      const type = event.type();
      if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
        return Clutter.EVENT_PROPAGATE;
      const target = global.stage.get_event_actor(event);
      if (target && this.contains(target)) return Clutter.EVENT_PROPAGATE;
      if (target && this.options.claimPressUnderGrab(target)) return Clutter.EVENT_STOP;
      this.options.onPressOutside();
      return Clutter.EVENT_STOP;
    }

    setOpen(open: boolean): void {
      if (open === this.isOpen) return;
      this.isOpen = open;
      this.remove_all_transitions();
      if (open && !this.visible) {
        this.opacity = 0;
        Object.assign(this, hiddenTransform());
        this.visible = true;
      }
      this.ease({
        opacity: open ? 255 : 0,
        duration: effects.cardFade.durationMs,
        mode: Clutter.AnimationMode.EASE,
        onStopped: (isFinished: boolean) => {
          if (isFinished && !open) this.visible = false;
        },
      });
      this.ease({
        ...(open ? { translationY: 0, scaleX: 1, scaleY: 1 } : hiddenTransform()),
        duration: effects.cardSpring.durationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      });
    }
  },
);

function hiddenTransform(): { translationY: number; scaleX: number; scaleY: number } {
  return { translationY: HIDDEN_OFFSET_Y, scaleX: HIDDEN_SCALE, scaleY: HIDDEN_SCALE };
}

export type CenterCardActor = InstanceType<typeof CenterCard>;
