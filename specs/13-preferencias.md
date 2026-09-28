# 13 · Preferências

Origem: `design/props.json` (`clickAction`). `battery` e `charging` são controles de demonstração do protótipo e **não** viram preferência; `autoHide` está fora de escopo (spec 00).

## Schema GSettings

`org.gnome.shell.extensions.island`, em `schemas/`:

| Chave | Tipo | Padrão | Usada em |
|---|---|---|---|
| `click-action` | enum `center-card` \| `calendar` | `center-card` | spec 03 (clique na ilha compacta) |
| `weather-location` | `v` (localização GWeather serializada) | vazio | spec 07 |
| `weather-hint-shown` | `b` | `false` | spec 07 (interna, sem UI) |
| `ai-claude-enabled` | `b` | `true` | spec 12 |
| `ai-codex-enabled` | `b` | `true` | spec 12 |
| `toggle-quick` | `as` | `['<Super>s']` | spec 03 |

A extensão reage a `changed::<chave>` sem reiniciar.

## Janela de preferências (`prefs.ts`, GTK4 + libadwaita)

Roda em outro processo e só conversa com a extensão via GSettings. Textos em pt-BR via gettext.

- **Geral**
  - "Clique na ilha abre": Calendário e música (cartão) · Calendário compacto (ilha)
- **Clima**
  - Busca de cidade (`GWeather.Location`), mostrando a cidade atual e de onde ela veio (preferência, GNOME ou localização automática)
  - Botão "Limpar" volta à cadeia de fallback
- **Uso de IA**
  - Um switch por provedor (Claude, Codex) + estado da credencial: "Encontrada", "Não encontrada: rode `claude`", "Expirada"
- **Atalhos**
  - Atalho de controles rápidos (padrão `Super+S`), editável

A notificação de dica do clima (spec 07) abre esta janela direto na página Clima.

## Critérios de aceite

- [ ] Cada chave do schema muda o comportamento na hora, com a extensão rodando.
- [ ] `glib-compile-schemas` roda sem aviso no build e no `install.sh`.
- [ ] A janela abre pelo app Extensões e por `gnome-extensions prefs island@caionazario.dev`.
