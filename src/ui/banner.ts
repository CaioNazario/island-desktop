import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import type { NotificationEntry } from '../system/notifications.js';
import { NotificationRow, type NotificationRowActor } from './notificationRow.js';
import { colors, effects } from './tokens.js';

const BANNER_MS = 2600;
export const BANNER_WIDTH = 380;
export const BANNER_HEIGHT = 58;
/** Distância entre a base da ilha e o banner. */
export const BANNER_GAP = 8;
const BANNER_RADIUS = 22;

// Banner abaixo da ilha ocupada (specs/04-notificacoes.md "Banner"): mesmo
// conteúdo do `notif` em medidas menores.
export const Banner = GObject.registerClass(
  class Banner extends St.Widget {
    private readonly row: NotificationRowActor;
    private readonly onOpen: () => void;
    private timerId: number | null = null;

    /** `onOpen`: clique no banner abre `stack`. */
    constructor(onOpen: () => void) {
      super({
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        width: BANNER_WIDTH,
        height: BANNER_HEIGHT,
        visible: false,
        opacity: 0,
      });

      this.onOpen = onOpen;
      this.row = new NotificationRow(
        {
          blockSize: 34,
          blockRadius: 10,
          iconSize: 19,
          closeSize: 24,
          closeIconSize: 11,
          closeFilled: true,
          gap: 12,
        },
        () => this.dismiss(),
      );
      // St.Button como o `NotificationMessage` do Shell (js/ui/messageList.js):
      // o × dentro dele é outro St.Button e não dispara o clique de fora.
      const surface = new St.Button({
        child: this.row,
        x_expand: true,
        y_expand: true,
        style: `
          padding: 0 12px;
          border-radius: ${BANNER_RADIUS}px;
          background-color: ${colors.bg};
          border: 1px solid ${colors.neutral800};
        `,
      });
      surface.connectObject('clicked', () => onOpen(), this);

      this.add_child(surface);
      this.connectObject('destroy', () => this.clearTimer(), this);
    }

    /** Mostra (ou troca) a notificação e rearma os 2600ms. */
    present(entry: NotificationEntry): void {
      this.row.setEntry(entry);
      this.clearTimer();
      this.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, BANNER_MS, () => {
        this.timerId = null;
        this.dismiss();
        return GLib.SOURCE_REMOVE;
      });
      if (this.visible && this.opacity === 255) return;
      this.remove_all_transitions();
      if (!this.visible) {
        this.translationY = effects.bannerSlide.offsetY;
        this.visible = true;
      }
      this.ease({
        opacity: 255,
        duration: effects.bannerFade.durationMs,
        mode: Clutter.AnimationMode.EASE,
      });
      this.ease({
        translationY: 0,
        duration: effects.bannerSlide.durationMs,
        mode: Clutter.AnimationMode.EASE_OUT_BACK,
      });
    }

    /**
     * Clique no banner com a ilha segurando o grab modal (modo fixo aberto):
     * o evento chega ao `captured-event` da ilha, não aqui. Devolve true se
     * o clique era do banner.
     */
    handlePressUnderGrab(target: Clutter.Actor): boolean {
      if (!this.visible || !this.contains(target)) return false;
      if (this.row.isCloseTarget(target)) this.dismiss();
      else this.onOpen();
      return true;
    }

    dismiss(): void {
      this.clearTimer();
      if (!this.visible) return;
      this.remove_all_transitions();
      this.ease({
        opacity: 0,
        translationY: effects.bannerSlide.offsetY,
        duration: effects.bannerFade.durationMs,
        mode: Clutter.AnimationMode.EASE,
        onStopped: (isFinished: boolean) => {
          if (isFinished) this.visible = false;
        },
      });
    }

    private clearTimer(): void {
      if (this.timerId === null) return;
      GLib.Source.remove(this.timerId);
      this.timerId = null;
    }
  },
);

export type BannerActor = InstanceType<typeof Banner>;
