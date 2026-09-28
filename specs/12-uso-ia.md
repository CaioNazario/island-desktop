# 12 · Uso de IA

Origem: `design/markup.html` 15–26 (botão na pílula esquerda) e 281–309 (modo `ai`); `design/logic.js` `aiMap`/`lvl`/`lvlText`/`aiHpx` (~186–193), `aiSummary`.

Referência de como os dados são obtidos: [ai-usagebar](https://github.com/akitaonrails/ai-usagebar) (`src/anthropic/`, `src/openai/`). A Island reimplementa em TS, **sem** depender do binário.

## Provedores

| | Claude | Codex |
|---|---|---|
| Nome exibido | Claude | Codex |
| Ícone | `ph-fill ph-asterisk` | `ph-fill ph-open-ai-logo` |
| Credencial | `~/.claude/.credentials.json` | `~/.codex/auth.json` |
| Token | `claudeAiOauth.accessToken` | `tokens.access_token` (+ `tokens.account_id`) |
| Expiração | `claudeAiOauth.expiresAt` (ms epoch) | `tokens.expires_at`, senão `exp` do `tokens.id_token` |
| Plano | `claudeAiOauth.subscriptionType` capitalizado ("Max", "Pro") | `plan_type` da resposta, senão `chatgpt_plan_type` do `id_token` ("Plus", "Pro") |
| Endpoint | `GET https://api.anthropic.com/api/oauth/usage` | `GET https://chatgpt.com/backend-api/wham/usage` |
| Cabeçalhos | `Authorization: Bearer`, `anthropic-beta: oauth-2025-04-20`, `User-Agent: claude-cli/<versão publicada> (external, cli)` | `Authorization: Bearer`, `ChatGPT-Account-Id`, `User-Agent: codex-cli` |
| Sessão (5h) | `five_hour.utilization` (0–100), `five_hour.resets_at` (ISO) | janela com `limit_window_seconds = 18000` em `rate_limit.primary_window`/`secondary_window`: `used_percent`, `reset_at` (unix) |
| Semanal | `seven_day.utilization`, `seven_day.resets_at` | janela com `limit_window_seconds = 604800` |

- O parse de cada resposta é função pura em `src/core/aiUsage.ts`, testada com payloads de exemplo (os do ai-usagebar servem de fixture). Classificar as janelas do Codex por `limit_window_seconds`, nunca pela posição.
- **Risco aceito**: os dois endpoints são não documentados e o do Claude exige User-Agent do `claude-cli`. Podem quebrar a qualquer momento. Resposta com formato inesperado vira estado de erro no cartão, nunca exceção.

## Credenciais: somente leitura

- A Island **nunca** escreve nos arquivos de credencial e **nunca** renova token.
- `Gio.FileMonitor` nos dois arquivos: quando o CLI renova o token, a Island relê e atualiza.
- Arquivo ausente → cartão mostra, no lugar das barras, "Rode `claude` para entrar" / "Rode `codex login` para entrar".
- Token expirado (pela data ou HTTP 401) → mantém os últimos valores do cache e mostra "Abra o Claude Code para renovar" / "Abra o Codex para renovar".

## Atualização

- Polling a cada **300s** por provedor.
- Abrir o modo `ai` força atualização se o cache tiver mais de **60s**.
- HTTP 429 → mantém cache e dobra o intervalo até 1200s; volta a 300s no próximo sucesso.
- Erro de rede → mantém cache sem mensagem; após 3 falhas seguidas, "Sem conexão" no cartão.
- Todo HTTP via `Soup.Session` assíncrono, timeout 10s.

## Cores por nível (sessão e semanal)

| Uso | Barra | Texto do % |
|---|---|---|
| <70% | `accent` | `text` |
| ≥70% | `accent-300` | `text` |
| ≥90% | `#f75d59` | `#fd736d` |

## Botão na pílula esquerda

- Padding 0 10px, gap 12px entre provedores; fundo `neutral-900` com `ai` aberto; hover `neutral-900`.
- Por provedor visível (gap 6px): ícone 13px `neutral-300` · mini barra 26×4 raio 2 (`neutral-800` + preenchimento da **sessão**, transição 600ms) · `62%` 11.5px/500 alinhado à direita, largura fixa.
- Tooltip por provedor: `Claude · sessão 62% · semanal 41%`.
- Nenhum provedor visível (ambos desligados nas preferências): `ph ph-sparkle` 14px + "IA" 12px `neutral-400`.
- Clique abre `ai`.

## Modo `ai` (480 × (24 + 32 + p·108 − 6))

- Padding 12px 14px, gap 6px. Cabeçalho 26px: `ph ph-sparkle` 14px `neutral-300`, "Uso de IA" 13px/500, resumo 11px `neutral-500` à direita ("2 conectados" / "1 conectado").
- Cartão por provedor: padding 10px 10px 12px, raio 14, `neutral-900`.
  - Topo (margin-bottom 10px, gap 10px): bloco 28×28 raio 8 `accent-900` com ícone 16px `accent-300` · nome 13px/500 · chip do plano (10.5px, padding 1 7, raio 8, anel `neutral-700`, texto `neutral-300`).
  - Duas colunas (gap 14px): "Sessão · 5h" e "Semanal" (11px `neutral-400`) com o % à direita (500, cor da tabela) · barra 4px · "Reinicia {quando}" 10.5px `neutral-500` (margin-top 5px).
  - "Reinicia" da sessão é relativo: `em 2h 14min`, `em 45min`. Da semanal é absoluto: `seg, 09:00` (dia abreviado minúsculo + hora local).
- Sem botões Conectar/Desconectar: quais provedores aparecem é decidido nas preferências (spec 13).

## Critérios de aceite

- [ ] Testes de `aiUsage.ts`: parse dos dois payloads, janelas do Codex fora de ordem, campos ausentes, formatação de "Reinicia", faixas de cor.
- [ ] Nenhuma escrita em `~/.claude` ou `~/.codex` durante a execução (verificável por `inotifywait`).
- [ ] Sem `~/.codex/auth.json`, o cartão do Codex mostra "Rode `codex login` para entrar" e o do Claude funciona normalmente.
- [ ] Rodar o Claude Code (que renova o token) faz o cartão sair do estado expirado sem reiniciar a extensão.
- [ ] Resposta HTTP malformada não gera exceção no log do Shell.
