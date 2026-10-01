import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {
  type GithubCounts,
  outcomeForStatus,
  parseTotalCount,
  SEARCH_QUERIES,
  type SearchOutcome,
  searchUrl,
  tokenFromOutput,
} from '../core/github.js';

export interface GithubSource {
  /** `null`: sem `gh`, sem login ou 401 persistente. */
  readonly counts: GithubCounts | null;
  onChange(callback: () => void): () => void;
}

const POLL_SECONDS = 300;
const HTTP_TIMEOUT_SECONDS = 10;
const TOKEN_TIMEOUT_MS = 5000;

const decoder = new TextDecoder();

type SearchFailure = Exclude<SearchOutcome, 'ok'>;

// PRs do GitHub (specs/16-widgets.md `github`). Só busca enquanto `running`
// (widget no ambiente ativo). O token fica só em memória: nunca vai para
// log, GSettings ou mensagem de erro, e o stderr do `gh` é descartado.
export class SystemGithub implements GithubSource {
  private readonly session = new Soup.Session({ timeout: HTTP_TIMEOUT_SECONDS });
  private readonly cancellable = new Gio.Cancellable();
  private readonly listeners = new Set<() => void>();
  private current: GithubCounts | null = null;
  private token: string | null = null;
  private timerId: number | null = null;
  private isRunning = false;
  private polling = false;

  constructor() {
    Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
  }

  get counts(): GithubCounts | null {
    return this.current;
  }

  set running(running: boolean) {
    if (running === this.isRunning) return;
    this.isRunning = running;
    this.clearTimer();
    if (!running) return;
    void this.poll();
    this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
      void this.poll();
      return GLib.SOURCE_CONTINUE;
    });
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.clearTimer();
    this.cancellable.cancel();
    this.session.abort();
    this.listeners.clear();
    this.token = null;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const result = await this.fetchWithToken();
      if (this.cancellable.is_cancelled() || result === 'failed') return;
      this.current = result === 'unauthorized' ? null : result;
      this.listeners.forEach((callback) => callback());
    } finally {
      this.polling = false;
    }
  }

  // 401: roda `gh auth token` de novo uma vez; o segundo 401 é persistente.
  private async fetchWithToken(): Promise<GithubCounts | SearchFailure> {
    for (let attempt = 0; attempt < 2; attempt++) {
      this.token ??= await this.readToken();
      if (this.token === null) return 'unauthorized';
      const result = await this.fetchCounts(this.token);
      if (result !== 'unauthorized') return result;
      this.token = null;
    }
    return 'unauthorized';
  }

  private async readToken(): Promise<string | null> {
    let process: Gio.Subprocess;
    try {
      process = Gio.Subprocess.new(
        ['gh', 'auth', 'token'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      );
    } catch {
      // Sem `gh` no PATH.
      return null;
    }
    // Keyring bloqueado pode ficar esperando o prompt de desbloqueio.
    let timeoutId: number | null = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TOKEN_TIMEOUT_MS, () => {
      timeoutId = null;
      process.force_exit();
      return GLib.SOURCE_REMOVE;
    });
    try {
      const [stdout] = await process.communicate_utf8_async(null, this.cancellable);
      return tokenFromOutput(process.get_successful() ? 0 : 1, stdout ?? '');
    } catch {
      return null;
    } finally {
      if (timeoutId !== null) GLib.Source.remove(timeoutId);
    }
  }

  private async fetchCounts(token: string): Promise<GithubCounts | SearchFailure> {
    const [mine, review] = await Promise.all([
      this.search(SEARCH_QUERIES.mine, token),
      this.search(SEARCH_QUERIES.review, token),
    ]);
    if (mine === 'unauthorized' || review === 'unauthorized') return 'unauthorized';
    if (typeof mine !== 'number' || typeof review !== 'number') return 'failed';
    return { mine, review };
  }

  private async search(query: string, token: string): Promise<number | SearchFailure> {
    const message = Soup.Message.new('GET', searchUrl(query))!;
    const headers = message.get_request_headers();
    headers.append('Authorization', `Bearer ${token}`);
    headers.append('Accept', 'application/vnd.github+json');
    headers.append('X-GitHub-Api-Version', '2022-11-28');
    headers.append('User-Agent', 'island-gnome-extension');
    try {
      const bytes = await this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        this.cancellable,
      );
      const outcome = outcomeForStatus(message.get_status());
      if (outcome !== 'ok') return outcome;
      return parseTotalCount(decoder.decode(bytes.get_data() ?? undefined)) ?? 'failed';
    } catch {
      return 'failed';
    }
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    GLib.Source.remove(this.timerId);
    this.timerId = null;
  }
}
