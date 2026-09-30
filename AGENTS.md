# Island

Extensão GNOME Shell que substitui o painel superior por três pílulas flutuantes (uso de IA · ilha · sistema). A ilha central se expande estilo Dynamic Island para notificações, música, volume/brilho, calendário, controles rápidos, Wi‑Fi, Bluetooth e uso de IA.

## Fonte da verdade

Cada fonte manda num eixo:

- **Visual** (medidas, cores, ícones, animação, estados): o design vence.
- **Comportamento e dados reais**: as specs vencem. Dado simulado ou item de protótipo no design (imagem de fundo, battery/charging como props, textos fixos) não é requisito.
- **Contexto de produto**: `prd.md`. Não decide nada sozinho.

Design: `Desktop Island.html` (bundle do Claude Design). Leia a versão extraída em `design/`:

- `design/markup.html`: estrutura, medidas, cores e ícones de cada estado
- `design/logic.js`: máquina de estados, tamanhos (`SIZES`), timers (`TRANSIENT`), limiares e regras de roteamento
- `design/tokens.css`: tokens Nocturne (bloco `:root`) e classes `.btn*`
- `design/props.json`: opções expostas no protótipo
- `design/components/`: subcomponentes importados pelo markup (`<dc-import name="…">`), um arquivo por componente

Specs: `specs/`. Comece por `specs/00-visao-geral.md` (mapa, glossário, ordem de implementação). Cada spec lista critérios de aceite e cita a origem no design por **âncora greppável** (nome do estado, seletor, chave de `SIZES`/`TRANSIENT`), nunca por número de linha.

Quando o design mudar, rode `python3 scripts/extract-design.py` e atualize as specs afetadas no mesmo commit.

## Stack

- GNOME Shell 50+, Wayland. Arch é o alvo; nenhum código assume caminho, pacote ou driver do Arch.
- TypeScript + tipos `@girs/*`, compilado com `tsc` (um `.js` legível por módulo, sem bundler e sem minificação). Os tipos `@girs` podem atrasar em relação à 50.x: confira a API no código-fonte do Shell (gitlab.gnome.org/GNOME/gnome-shell, `js/ui/`, na tag da versão) antes de usar.
- GJS não é navegador nem Node: sem DOM, `fetch`, `require` ou npm em runtime. HTTP via `gi://Soup` 3, arquivos e processos via Gio.
- UI em St/Clutter. Layout por layout managers do Clutter. O CSS do St não tem flex/grid, `backdrop-filter`, `color-mix()`, `oklch()`, `:focus-visible` nem curva `cubic-bezier`. Equivalentes adotados em `specs/01-design-tokens.md`.
- UI em pt-BR via gettext; código, identificadores e commits em inglês.

## Arquitetura

```
src/
  core/         lógica pura: estados da ilha, roteamento de notificação, limiares, formatação, tamanhos
  system/       fontes de dados (D-Bus, MPRIS, NM, BlueZ, UPower, /proc, /sys, GWeather, HTTP de IA), cada uma atrás de uma interface
  ui/           atores St: barra, pílulas, ilha, modos, cartão central
  extension.ts  enable()/disable()
  prefs.ts      preferências (GTK4/Adw, outro processo, fala só via GSettings)
```

- `core/` nunca importa `gi://` nem `resource://`. É onde mora toda regra testável.
- Todo serviço é opcional: sem a dependência (sem bateria, sem GPU conhecida, sem credencial de IA, sem cidade), o bloco da UI some sem erro nem log ruidoso.
- A Island é dona do painel: esconde `Main.panel` no `enable()` e o devolve intacto no `disable()`.

## Ciclo de vida: disable() roda a cada bloqueio de tela

Tudo que `enable()` cria, conecta, injeta ou agenda, `disable()` desfaz: atores destruídos, signals desconectados, timeouts removidos, injeções limpas, painel original restaurado. Um lock/unlock não pode vazar nem perder estado visível (notificações vêm do MessageTray, que sobrevive ao lock).

- Signals: `obj.connectObject('sig', cb, this)` + `obj.disconnectObject(this)`.
- Monkey patch: `InjectionManager` com `overrideMethod(...)` e `clear()` no disable; use `function`, não arrow, por causa do `this`.
- Timeouts: guarde o id de `GLib.timeout_add*` e dê `GLib.Source.remove` no disable.
- Sem efeito colateral no escopo do módulo nem em `constructor` fora do `enable()`.
- Main loop é single-thread e o Shell é o compositor: I/O, subprocess e HTTP sempre assíncronos (`*_async`, `Gio._promisify`, `communicate_utf8_async`). Uma exceção não tratada derruba a sessão inteira.

## Comandos

| Comando | Faz |
|---|---|
| `make test` | Vitest em `src/core` |
| `make lint` | ESLint + Prettier + `tsc --noEmit` |
| `make build` | `tsc` + `glib-compile-schemas` |
| `make dev` | build + Shell aninhado: `dbus-run-session gnome-shell --devkit --wayland` |
| `make smoke` | **Ainda não existe; criar antes de usar.** Sobe o Shell headless, faz ciclos de enable/disable e falha se o journal tiver `JS ERROR` ou `Gjs-CRITICAL` |
| `./install.sh` / `./install.sh --uninstall` | instala em `~/.local/share/gnome-shell/extensions/island@caionazario.dev/` |

- Shell headless: `dbus-run-session -- gnome-shell --headless --virtual-monitor 1600x900`.
- Logs (`console.log` do Shell): `journalctl -f -o cat /usr/bin/gnome-shell`.

## Código

- Funções de 4–20 linhas. Máximo 2 níveis de indentação; prefira early return.
- Arquivos de no máximo 400 linhas (exceto os extraídos em `design/`). Antes de passar disso, divida o módulo.
- Nomes únicos e greppáveis. Evite `data`, `handler`, `Manager`, `Service` sozinhos.
- Sem `any`. API sem tipo no `@girs`: declare o tipo localmente, com comentário apontando o arquivo e a tag do gnome-shell de onde ele veio.
- Mensagem de erro inclui o valor recebido e o formato esperado.
- Sem duplicação: extraia a lógica compartilhada para `core/`.

## Comentários

- Escreva POR QUE, não O QUE.
- Workaround de Shell/Mutter/GJS cita o arquivo, a tag ou a issue de origem.
- Não remova comentários existentes em refactor. Eles carregam proveniência.

## Segredos

- Credencial de IA só via libsecret. Nunca em GSettings, log, fixture, teste ou commit.
- Antes de commitar, confira `git diff --cached` procurando token, key ou `.env`.

## Nunca sem perguntar

- Instalar ou habilitar a extensão na sessão atual. Para testar, use `make dev` ou o Shell headless.
- Rodar comando com `sudo` ou que escreva fora do repositório.
- Apagar arquivo que você não criou nesta tarefa.

## Testes

- TDD em `src/core`: teste vermelho primeiro, depois o código.
- Serviços são testados contra fakes nomeados que implementam a interface (`FakeMprisService`), não stubs inline.
- Bug fix entra com teste de regressão.

## Regras de trabalho

- CI obrigatória: todo push e PR roda `make lint`, `make test` (todos os testes) e `make build`. CI vermelha não entra na main.
- Mudou comportamento, atualize a spec correspondente no mesmo commit. Spec e código nunca divergem.
- API de GJS/St/Mutter que você não confirmou no código-fonte do Shell ou em gjs.guide: diga "não sei" e verifique, em vez de chutar.
- Ponto em aberto marcado como spike (`specs/14-spikes.md`) se resolve antes de implementar a feature que depende dele, e o resultado vai para a spec.
- Commits em Conventional Commits: `tipo(escopo): descrição` no imperativo, minúscula, sem ponto, ≤72 caracteres. Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`. Um commit = uma mudança lógica; `refactor` nunca junto com `feat`/`fix`. Breaking change: `!` + rodapé `BREAKING CHANGE:`.

## Hurdles

Problema já encontrado e sua solução. Adicione aqui toda vez que algo custar mais de uma tentativa.

- GNOME 50 não tem `gnome-shell --nested`: use `--devkit`.
- Wayland não recarrega o Shell: mudança na extensão instalada exige logout/login.
- `disable()` roda a cada lock de tela, não só ao desativar a extensão.
- Tipos `@girs` atrasam em relação à 50.x: confira a API na tag do Shell.

## Antes de dizer que terminou

- [ ] `make lint`, `make test` e `make build` verdes
- [ ] Spec afetada atualizada no mesmo commit
- [ ] Tudo que `enable()` cria, `disable()` desfaz
- [ ] Nenhum I/O síncrono no main loop
- [ ] Nenhuma credencial fora do libsecret