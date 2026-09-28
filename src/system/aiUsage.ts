import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
  CREDENTIAL_FILES,
  type Credential,
  type FetchOutcome,
  INITIAL_SCHEDULE,
  isExpired,
  isOffline,
  nextSchedule,
  OPEN_REFRESH_MS,
  parseClaudeUsage,
  parseCodexUsage,
  type PollSchedule,
  type ProviderId,
  type Usage,
} from '../core/aiUsage.js';

/**
 * `missing`: sem arquivo de credencial (ou sem token nele); `expired`: pela
 * data ou por 401; `offline`: 3 falhas de rede seguidas; `error`: resposta
 * com formato inesperado; `loading`: credencial ok, nenhum dado ainda.
 */
export type ProviderStatus = 'loading' | 'ok' | 'missing' | 'expired' | 'offline' | 'error';

export interface ProviderSnapshot {
  id: ProviderId;
  status: ProviderStatus;
  /** Último valor bom; continua valendo em `expired`, `offline` e `error`. */
  usage: Usage | null;
  plan: string | null;
}

export interface AiUsageSource {
  /** Provedores ligados nas preferências, na ordem Claude, Codex. */
  readonly providers: readonly ProviderSnapshot[];
  onChange(callback: () => void): () => void;
  /** Abrir o modo `ai`: atualiza quem tem cache com mais de 60s. */
  refreshIfStale(): void;
}

const HTTP_TIMEOUT_SECONDS = 10;

// Versão publicada do Claude Code, fixa como no ai-usagebar
// (src/anthropic/fetch.rs): o endpoint lê o formato `claude-cli/<versão>
// (external, cli)` e responde 429 sem ele.
const CLAUDE_USER_AGENT = 'claude-cli/2.1.281 (external, cli)';

interface ProviderConfig {
  id: ProviderId;
  settingsKey: string;
  request(credential: Credential): Soup.Message;
  parseUsage(body: string, now: number): Usage | null;
}

function get(url: string, headers: Record<string, string>): Soup.Message {
  const message = Soup.Message.new('GET', url)!;
  const requestHeaders = message.get_request_headers();
  for (const [name, value] of Object.entries(headers)) requestHeaders.append(name, value);
  return message;
}

const PROVIDERS: readonly ProviderConfig[] = [
  {
    id: 'claude',
    settingsKey: 'ai-claude-enabled',
    request: (credential) =>
      get('https://api.anthropic.com/api/oauth/usage', {
        Authorization: `Bearer ${credential.token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': CLAUDE_USER_AGENT,
      }),
    parseUsage: (body) => parseClaudeUsage(body),
  },
  {
    id: 'codex',
    settingsKey: 'ai-codex-enabled',
    request: (credential) =>
      get('https://chatgpt.com/backend-api/wham/usage', {
        Authorization: `Bearer ${credential.token}`,
        ...(credential.accountId ? { 'ChatGPT-Account-Id': credential.accountId } : {}),
        'User-Agent': 'codex-cli',
      }),
    parseUsage: parseCodexUsage,
  },
];

interface ProviderCache {
  usage: Usage | null;
  /** ms epoch do último fetch terminado (qualquer resultado); 0 = nunca. */
  fetchedAt: number;
  schedule: PollSchedule;
  lastOutcome: FetchOutcome | null;
  /** Token que levou 401: continua expirado até o CLI trocar o arquivo. */
  rejectedToken: string | null;
}

// Fora da instância: a extensão é desligada a cada lock de tela, e sem isso
// cada unlock dispararia um fetch por provedor (e 429 com lock/unlock seguidos).
const caches = new Map<ProviderId, ProviderCache>();

function cacheFor(id: ProviderId): ProviderCache {
  let cache = caches.get(id);
  if (!cache) {
    cache = {
      usage: null,
      fetchedAt: 0,
      schedule: INITIAL_SCHEDULE,
      lastOutcome: null,
      rejectedToken: null,
    };
    caches.set(id, cache);
  }
  return cache;
}

const decoder = new TextDecoder();

function outcomeForStatus(status: number): FetchOutcome | null {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'failure';
  if (status < 200 || status >= 300) return 'malformed';
  return null;
}

// Um provedor ligado: lê a credencial (só leitura, nunca renova), vigia o
// arquivo e faz o polling.
class ProviderPoller {
  private readonly config: ProviderConfig;
  private readonly session: Soup.Session;
  private readonly onUpdate: () => void;
  private readonly cache: ProviderCache;
  private readonly file: Gio.File;
  private readonly monitor: Gio.FileMonitor;
  private readonly cancellable = new Gio.Cancellable();
  private credential: Credential | null = null;
  private credentialLoaded = false;
  private loadGeneration = 0;
  private timerId: number | null = null;
  private fetching = false;

  constructor(config: ProviderConfig, session: Soup.Session, onUpdate: () => void) {
    this.config = config;
    this.session = session;
    this.onUpdate = onUpdate;
    this.cache = cacheFor(config.id);
    this.file = Gio.File.new_for_path(
      GLib.build_filenamev([GLib.get_home_dir(), ...CREDENTIAL_FILES[config.id].path]),
    );
    // O CLI troca o arquivo quando renova o token; a pasta pode nem existir
    // ainda (o GIO vigia o caminho ausente).
    this.monitor = this.file.monitor_file(Gio.FileMonitorFlags.NONE, null);
    this.monitor.connectObject(
      'changed',
      (_m: Gio.FileMonitor, _f: Gio.File, _o: Gio.File | null, event: Gio.FileMonitorEvent) => {
        if (
          event === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
          event === Gio.FileMonitorEvent.CREATED ||
          event === Gio.FileMonitorEvent.DELETED
        )
          void this.loadCredential();
      },
      this,
    );
    void this.loadCredential();
  }

  get snapshot(): ProviderSnapshot {
    return {
      id: this.config.id,
      status: this.status(),
      usage: this.cache.usage,
      plan: this.cache.usage?.plan ?? this.credential?.plan ?? null,
    };
  }

  refreshIfStale(): void {
    if (!this.canFetch()) return;
    if (Date.now() - this.cache.fetchedAt > OPEN_REFRESH_MS) void this.fetch();
  }

  destroy(): void {
    this.cancellable.cancel();
    this.clearTimer();
    this.monitor.disconnectObject(this);
    this.monitor.cancel();
  }

  private status(): ProviderStatus {
    if (!this.credentialLoaded) return 'loading';
    if (!this.credential) return 'missing';
    if (this.isCredentialExpired()) return 'expired';
    if (isOffline(this.cache.schedule)) return 'offline';
    if (this.cache.lastOutcome === 'malformed') return 'error';
    return this.cache.usage ? 'ok' : 'loading';
  }

  private isCredentialExpired(): boolean {
    const credential = this.credential;
    if (!credential) return false;
    return credential.token === this.cache.rejectedToken || isExpired(credential, Date.now());
  }

  private canFetch(): boolean {
    return this.credential !== null && !this.isCredentialExpired() && !this.fetching;
  }

  private async loadCredential(): Promise<void> {
    // Uma troca de arquivo gera vários eventos: só a última leitura vale.
    const generation = ++this.loadGeneration;
    let text: string | null = null;
    try {
      const [bytes] = await this.file.load_contents_async(this.cancellable);
      text = decoder.decode(bytes);
    } catch (e) {
      if (this.cancellable.is_cancelled()) return;
      if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)))
        console.error(`Island: cannot read ${this.config.id} credentials: ${(e as Error).message}`);
    }
    if (generation !== this.loadGeneration) return;
    const wasExpired = this.cache.rejectedToken !== null || this.isCredentialExpired();
    this.credential = text === null ? null : CREDENTIAL_FILES[this.config.id].parse(text);
    this.credentialLoaded = true;
    if (this.credential && this.credential.token !== this.cache.rejectedToken)
      this.cache.rejectedToken = null;
    this.clearTimer();
    this.onUpdate();
    if (!this.canFetch()) return;
    // Token renovado: o cache é de antes de expirar, busca já.
    const dueIn = this.cache.fetchedAt + this.cache.schedule.intervalS * 1000 - Date.now();
    if (wasExpired || dueIn <= 0) void this.fetch();
    else this.schedule(Math.ceil(dueIn / 1000));
  }

  private async fetch(): Promise<void> {
    const credential = this.credential;
    if (!credential || !this.canFetch()) {
      // Venceu pela data desde o último agendamento: mostra o estado expirado.
      this.onUpdate();
      return;
    }
    this.clearTimer();
    this.fetching = true;
    const message = this.config.request(credential);
    let outcome: FetchOutcome;
    try {
      const bytes = await this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        this.cancellable,
      );
      outcome = outcomeForStatus(message.get_status()) ?? 'ok';
      if (outcome === 'ok') {
        const usage = this.config.parseUsage(
          decoder.decode(bytes.get_data() ?? undefined),
          Date.now(),
        );
        if (usage) this.cache.usage = usage;
        else outcome = 'malformed';
      }
    } catch {
      if (this.cancellable.is_cancelled()) return;
      outcome = 'failure';
    } finally {
      this.fetching = false;
    }
    if (outcome === 'malformed')
      console.warn(`Island: unexpected ${this.config.id} usage response (${message.get_status()})`);
    if (outcome === 'unauthorized') this.cache.rejectedToken = credential.token;
    this.cache.fetchedAt = Date.now();
    this.cache.schedule = nextSchedule(this.cache.schedule, outcome);
    this.cache.lastOutcome = outcome;
    this.onUpdate();
    // Expirado: espera o CLI renovar o arquivo, sem bater com token morto.
    if (this.canFetch()) this.schedule(this.cache.schedule.intervalS);
  }

  /** Acorda no próximo poll ou quando o token vence, o que vier antes. */
  private schedule(seconds: number): void {
    this.clearTimer();
    const expiresAt = this.credential?.expiresAt;
    if (expiresAt != null)
      seconds = Math.max(1, Math.min(seconds, Math.ceil((expiresAt - Date.now()) / 1000)));
    this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
      this.timerId = null;
      void this.fetch();
      return GLib.SOURCE_REMOVE;
    });
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      GLib.Source.remove(this.timerId);
      this.timerId = null;
    }
  }
}

// Uso de IA (specs/12-uso-ia.md). A Island nunca escreve em `~/.claude` nem
// em `~/.codex` e nunca renova token: só lê e reage quando o CLI troca o arquivo.
export class SystemAiUsage implements AiUsageSource {
  private readonly settings: Gio.Settings;
  private readonly session = new Soup.Session({ timeout: HTTP_TIMEOUT_SECONDS });
  private readonly pollers = new Map<ProviderId, ProviderPoller>();
  private readonly listeners = new Set<() => void>();

  constructor(settings: Gio.Settings) {
    Gio._promisify(Gio.File.prototype, 'load_contents_async');
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
    this.settings = settings;
    for (const config of PROVIDERS)
      settings.connectObject(`changed::${config.settingsKey}`, () => this.sync(), this);
    this.sync();
  }

  get providers(): readonly ProviderSnapshot[] {
    return PROVIDERS.flatMap((config) => this.pollers.get(config.id)?.snapshot ?? []);
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  refreshIfStale(): void {
    this.pollers.forEach((poller) => poller.refreshIfStale());
  }

  destroy(): void {
    this.settings.disconnectObject(this);
    this.pollers.forEach((poller) => poller.destroy());
    this.pollers.clear();
    this.session.abort();
    this.listeners.clear();
  }

  private sync(): void {
    for (const config of PROVIDERS) {
      const enabled = this.settings.get_boolean(config.settingsKey);
      const poller = this.pollers.get(config.id);
      if (enabled && !poller)
        this.pollers.set(config.id, new ProviderPoller(config, this.session, () => this.notify()));
      else if (!enabled && poller) {
        poller.destroy();
        this.pollers.delete(config.id);
      }
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((callback) => callback());
  }
}
