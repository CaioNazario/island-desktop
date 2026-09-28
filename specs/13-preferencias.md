# 13 · Preferências

Origem: `design/props.json` (`clickAction`). `battery` e `charging` são controles de demonstração do protótipo e **não** viram preferência; `autoHide` está fora de escopo (spec 00).

## Schema GSettings

`org.gnome.shell.extensions.island`, em `schemas/`:

| Chave | Tipo | Padrão | Usada em |
|---|---|---|---|
| `click-action` | enum `center-card` \| `calendar` | `center-card` | spec 03 (clique na ilha compacta) |
| `weather-location` | `v` (localização GWeather serializada) | vazio | spec 07 |
| `weather-hint-shown` | `b` | `false` | spec 07 (interna, sem UI) |
| `prefs-page` | `s` | vazio | página a abrir nas preferências (interna, sem UI) |
| `ai-claude-enabled` | `b` | `true` | spec 12 |
| `ai-codex-enabled` | `b` | `true` | spec 12 |

A extensão reage a `changed::<chave>` sem reiniciar.

O atalho de controles rápidos não é preferência: a Island usa o `toggle-quick-settings` do próprio Shell (`Super+S`, spec 03).

## Janela de preferências (`prefs.ts`, GTK4 + libadwaita)

Roda em outro processo e só conversa com a extensão via GSettings. Textos em pt-BR via gettext.

- **Geral**
  - "Clique na ilha abre": Calendário e música (cartão) · Calendário compacto (ilha)
- **Clima**
  - Cidade atual e de onde ela veio, pela mesma cadeia da spec 07: "Escolhida aqui", "Do GNOME", "Automática" (sem nome: a janela roda em outro processo e não sabe o que o Geoclue achou) ou "Nenhuma"
  - Botão "Limpar", só com cidade escolhida aqui: volta à cadeia de fallback
  - Busca de cidade própria (o GWeather 4 não tem mais o `GWeatherLocationEntry`): sem acento nem caixa, cada palavra casa com o começo de uma palavra do nome, estado ou país; até 20 resultados
- **Uso de IA**
  - Um switch por provedor (Claude, Codex) + estado da credencial: "Encontrada", "Não encontrada: faça login no Claude", "Expirada" (só pela data do arquivo; o 401 da spec 12 não chega aqui)

A notificação de dica do clima (spec 07) abre esta janela direto na página Clima. O `openPreferences()` do Shell não escolhe página, então a extensão grava `weather` em `prefs-page` antes de abrir; a janela mostra a página e zera a chave (também com a janela já aberta).

## Critérios de aceite

- [ ] Cada chave do schema muda o comportamento na hora, com a extensão rodando.
- [ ] `glib-compile-schemas` roda sem aviso no build e no `install.sh`.
- [ ] A janela abre pelo app Extensões e por `gnome-extensions prefs island@caionazario.dev`.
