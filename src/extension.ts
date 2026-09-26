import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class IslandExtension extends Extension {
  override enable(): void {
    // TODO(spec 02/03): substituir Main.panel pelas três pílulas.
  }

  override disable(): void {
    // TODO: desfazer tudo que enable() criar/conectar/agendar.
  }
}
