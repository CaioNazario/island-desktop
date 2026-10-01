import {
  findWidget,
  placeWidget,
  removeWidget,
  type Environment,
  type Side,
  type WidgetId,
  type WidgetPlace,
} from '../core/environments.js';
import type { EnvironmentSource } from '../system/environments.js';

export interface EditableEnvironments extends EnvironmentSource {
  setEnvironments(envs: readonly Environment[]): void;
}

// Estado do editor dividido entre o painel e a barra do monitor dele
// (specs/17-editor-ambientes.md "Barra durante a edição"): widget selecionado
// e pílula-alvo. A pílula-alvo começa na esquerda a cada abertura.
export class EditSession {
  readonly monitorIndex: number;
  readonly environments: EditableEnvironments;
  private selection: WidgetId | null = null;
  private targetSide: Side = 'left';
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  constructor(monitorIndex: number, environments: EditableEnvironments) {
    this.monitorIndex = monitorIndex;
    this.environments = environments;
    this.unsubscribe = environments.onChange(() => this.notify());
  }

  /** Selecionado, só enquanto estiver no ambiente ativo. */
  get selected(): (WidgetPlace & { id: WidgetId }) | null {
    if (!this.selection) return null;
    const place = findWidget(this.environments.active, this.selection);
    return place ? { id: this.selection, ...place } : null;
  }

  get target(): Side {
    return this.targetSide;
  }

  select(id: WidgetId, side: Side): void {
    this.selection = id;
    this.targetSide = side;
    this.notify();
  }

  /** Clique no espaço vazio de uma pílula ou no seletor "Adicionar em". */
  setTarget(side: Side, clearSelection: boolean): void {
    this.targetSide = side;
    if (clearSelection) this.selection = null;
    this.notify();
  }

  /** Move ou adiciona; seleciona o widget e torna alvo a pílula de destino. */
  place(id: WidgetId, side: Side, at: number | null): void {
    this.selection = id;
    this.targetSide = side;
    this.update((env) => placeWidget(env, id, side, at));
  }

  remove(id: WidgetId): void {
    this.selection = null;
    this.update((env) => removeWidget(env, id));
  }

  /** Muda o ambiente ativo (nome, ícone, widgets). */
  update(change: (env: Environment) => Environment): void {
    const index = this.environments.index;
    this.environments.setEnvironments(
      this.environments.environments.map((env, i) => (i === index ? change(env) : env)),
    );
    this.notify();
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
