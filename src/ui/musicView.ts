import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {
  artistLine,
  formatTrackTime,
  MUSIC_NOTE_GLYPH,
  progressFraction,
  sourceGlyph,
} from '../core/music.js';
import type { MusicSource, MusicTrack } from '../system/mpris.js';
import { phosphor } from './icons.js';
import { colors } from './tokens.js';

// Peças da música compartilhadas pelo modo `music` e pela seção do cartão
// central (specs/05-musica.md): as medidas mudam, o comportamento não.

function singleLine(label: St.Label): St.Label {
  label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
  label.clutter_text.line_wrap = false;
  return label;
}

// Capa 56×56 raio 12. `file://` (todos os navegadores das amostras) vira
// fundo CSS, que o St recorta no raio; `http(s)://` (Spotify nativo) vai num
// `St.Icon` como no Shell (js/ui/messageList.js), que baixa pelo GVfs mas
// não arredonda. Sem capa: bloco `accent-900` com a nota `accent-300`.
export const MusicCover = GObject.registerClass(
  class MusicCover extends St.Bin {
    private readonly coverSize: number;
    private readonly radius: number;
    private artUrl: string | null = null;

    constructor(size: number, radius: number) {
      super({ y_align: Clutter.ActorAlign.CENTER });
      this.coverSize = size;
      this.radius = radius;
      this.setArt('');
    }

    setArt(artUrl: string): void {
      if (artUrl === this.artUrl) return;
      this.artUrl = artUrl;
      const box = `width: ${this.coverSize}px; height: ${this.coverSize}px; border-radius: ${this.radius}px;`;
      if (artUrl.startsWith('file://')) {
        this.style = `${box} background-image: url("${artUrl}"); background-size: cover;`;
        this.set_child(null);
      } else if (artUrl.startsWith('http://') || artUrl.startsWith('https://')) {
        this.style = box;
        this.child = new St.Icon({
          gicon: new Gio.FileIcon({ file: Gio.File.new_for_uri(artUrl) }),
          icon_size: this.coverSize,
        });
      } else {
        this.style = `${box} background-color: ${colors.accent900};`;
        this.child = new St.Icon({
          gicon: phosphor(MUSIC_NOTE_GLYPH),
          icon_size: 24,
          style: `color: ${colors.accent300};`,
          x_align: Clutter.ActorAlign.CENTER,
          y_align: Clutter.ActorAlign.CENTER,
        });
      }
    }
  },
);

// Barra 3px `accent` sobre `neutral-800`; o preenchimento acompanha a
// largura que o layout der à trilha.
export const MusicProgressBar = GObject.registerClass(
  class MusicProgressBar extends St.Widget {
    private readonly fill: St.Widget;
    private fraction = 0;

    constructor() {
      super({
        style: `height: 3px; border-radius: 2px; background-color: ${colors.neutral800};`,
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.fill = new St.Widget({
        style: `border-radius: 2px; background-color: ${colors.accent};`,
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.START,
      });
      this.add_child(this.fill);
      this.connectObject('notify::width', () => this.sync(), this);
    }

    setFraction(fraction: number): void {
      this.fraction = fraction;
      this.sync();
    }

    private sync(): void {
      this.fill.width = Math.round(this.width * this.fraction);
    }
  },
);

export interface MusicControlSizes {
  /** Anterior/próxima. */
  side: number;
  sideIcon: number;
  /** Tocar/pausar. */
  main: number;
  mainIcon: number;
  spacing: number;
}

function controlButton(size: number, iconSize: number, onClick: () => void): St.Button {
  const button = new St.Button({
    child: new St.Icon({ icon_size: iconSize }),
    track_hover: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const refresh = (): void => {
    const bg = button.hover && button.reactive ? colors.neutral900 : 'transparent';
    const fg = button.reactive ? colors.text : colors.neutral700;
    button.style = `width: ${size}px; height: ${size}px; border-radius: ${size / 2}px; background-color: ${bg}; color: ${fg};`;
  };
  button.connectObject(
    'notify::hover',
    refresh,
    'notify::reactive',
    refresh,
    'clicked',
    () => onClick(),
    button,
  );
  refresh();
  return button;
}

// Anterior · tocar/pausar · próxima. Desabilitado quando `CanGo*` é falso;
// qualquer controle chama `onUsed` (rearma o timer do `music`).
export const MusicControls = GObject.registerClass(
  class MusicControls extends St.BoxLayout {
    private readonly previous: St.Button;
    private readonly playPause: St.Button;
    private readonly next: St.Button;

    constructor(music: MusicSource, sizes: MusicControlSizes, onUsed: () => void) {
      super({ style: `spacing: ${sizes.spacing}px;`, y_align: Clutter.ActorAlign.CENTER });
      const use = (action: () => void) => () => {
        action();
        onUsed();
      };
      this.previous = controlButton(
        sizes.side,
        sizes.sideIcon,
        use(() => music.previous()),
      );
      this.playPause = controlButton(
        sizes.main,
        sizes.mainIcon,
        use(() => music.playPause()),
      );
      this.next = controlButton(
        sizes.side,
        sizes.sideIcon,
        use(() => music.next()),
      );
      (this.previous.child as St.Icon).gicon = phosphor('skip-back-fill');
      (this.next.child as St.Icon).gicon = phosphor('skip-forward-fill');
      this.add_child(this.previous);
      this.add_child(this.playPause);
      this.add_child(this.next);
    }

    setTrack(track: MusicTrack): void {
      this.previous.reactive = track.canGoPrevious;
      this.next.reactive = track.canGoNext;
      (this.playPause.child as St.Icon).gicon = phosphor(
        track.playing ? 'pause-fill' : 'play-fill',
      );
    }
  },
);

type MusicCoverActor = InstanceType<typeof MusicCover>;
type MusicProgressBarActor = InstanceType<typeof MusicProgressBar>;
type MusicControlsActor = InstanceType<typeof MusicControls>;

// Modo `music` (500×82): capa · artista/título/progresso · controles · ícone
// da fonte 22px `accent-400`.
export const MusicModeRow = GObject.registerClass(
  class MusicModeRow extends St.BoxLayout {
    private readonly music: MusicSource;
    private readonly cover: MusicCoverActor;
    private readonly artistLabel: St.Label;
    private readonly titleLabel: St.Label;
    private readonly positionLabel: St.Label;
    private readonly bar: MusicProgressBarActor;
    private readonly lengthLabel: St.Label;
    private readonly controls: MusicControlsActor;
    private readonly sourceIcon: St.Icon;
    private readonly unsubscribe: Array<() => void>;

    constructor(music: MusicSource, onControlUsed: () => void) {
      super({
        style: 'padding: 0 14px; spacing: 14px;',
        width: 500,
        height: 82,
      });
      this.music = music;

      this.cover = new MusicCover(56, 12);
      this.add_child(this.cover);

      const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.artistLabel = singleLine(
        new St.Label({ style: `color: ${colors.text}; font-size: 13px; font-weight: 500;` }),
      );
      this.titleLabel = singleLine(
        new St.Label({ style: `color: ${colors.neutral400}; font-size: 12px;` }),
      );
      text.add_child(this.artistLabel);
      text.add_child(this.titleLabel);

      const progress = new St.BoxLayout({
        style: `spacing: 8px; margin-top: 6px; color: ${colors.neutral500}; font-size: 10px; font-feature-settings: "tnum";`,
      });
      this.positionLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this.bar = new MusicProgressBar();
      this.lengthLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      progress.add_child(this.positionLabel);
      progress.add_child(this.bar);
      progress.add_child(this.lengthLabel);
      text.add_child(progress);
      this.add_child(text);

      this.controls = new MusicControls(
        music,
        { side: 34, sideIcon: 17, main: 38, mainIcon: 22, spacing: 4 },
        onControlUsed,
      );
      this.add_child(this.controls);

      this.sourceIcon = new St.Icon({
        icon_size: 22,
        style: `color: ${colors.accent400};`,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this.sourceIcon);

      this.unsubscribe = [
        music.onChange(() => this.sync()),
        music.onPosition(() => this.syncPosition()),
      ];
      this.sync();
      this.connectObject('destroy', () => this.unsubscribe.forEach((off) => off()), this);
    }

    private sync(): void {
      const track = this.music.track;
      if (!track) return;
      this.cover.setArt(track.artUrl);
      this.artistLabel.text = artistLine(track.artists, track.identity);
      this.titleLabel.text = track.title;
      this.controls.setTrack(track);
      this.sourceIcon.gicon = phosphor(sourceGlyph(track.identity));
      this.syncPosition();
    }

    private syncPosition(): void {
      const track = this.music.track;
      if (!track) return;
      const position = this.music.positionUs;
      this.positionLabel.text = formatTrackTime(position);
      this.lengthLabel.text = formatTrackTime(track.lengthUs);
      this.bar.setFraction(progressFraction(position, track.lengthUs));
    }
  },
);

export type MusicModeRowActor = InstanceType<typeof MusicModeRow>;
