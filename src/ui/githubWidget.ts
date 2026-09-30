import { githubView } from '../core/github.js';
import type { GithubSource } from '../system/github.js';
import { TopbarWidget, type TopbarWidgetActor } from './topbarWidget.js';
import { colors } from './tokens.js';

// Widget GitHub (specs/16-widgets.md `github`): ícone · `N PRs` · revisões
// pedidas. Sem credencial, "GitHub" `neutral-400`. Sem clique.
export function githubWidget(github: GithubSource): TopbarWidgetActor {
  const widget = new TopbarWidget(null);
  const sync = (): void => {
    const view = githubView(github.counts);
    const muted = view.unavailable ? colors.neutral400 : undefined;
    widget.display({
      icon: 'github-logo-fill',
      iconColor: muted,
      label: view.label,
      labelColor: muted,
      sub: view.sub,
    });
  };
  sync();
  const unsubscribe = github.onChange(sync);
  widget.connectObject('destroy', () => unsubscribe(), widget);
  return widget;
}
