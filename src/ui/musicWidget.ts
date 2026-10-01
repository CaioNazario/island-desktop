import { artistLine, sourceGlyph } from '../core/music.js';
import type { MusicSource } from '../system/mpris.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';
import { colors } from './tokens.js';

const LABEL_MAX = 120;

// Widget Música (specs/16-widgets.md `music`): ícone da fonte · título ·
// artista · play/pause do estado, como o botão do modo (design/logic.js
// `playIcon`). Sem player atual, "Nada tocando" `neutral-400` e sem clique.
// O clique abre/fecha `music` fixado.
export function musicWidget(music: MusicSource, togglePinned: () => void): TopbarWidgetActor {
  const widget = new TopbarWidget(togglePinned, LABEL_MAX);
  const sync = (): void => {
    const track = music.track;
    widget.clickable = track !== null;
    if (!track) {
      widget.display({
        icon: 'music-note',
        iconColor: colors.neutral400,
        label: 'Nada tocando',
        labelColor: colors.neutral400,
      });
      return;
    }
    widget.display({
      icon: sourceGlyph(track.identity),
      iconColor: colors.accent400,
      label: track.title,
      sub: artistLine(track.artists, track.identity),
      trail: track.playing ? 'pause-fill' : 'play-fill',
    });
  };
  sync();
  const unsubscribe = music.onChange(sync);
  widget.connectObject('destroy', () => unsubscribe(), widget);
  return widget;
}
