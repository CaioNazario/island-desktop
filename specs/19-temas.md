# 19 · Temas

Origem: design v4 (`Desktop Island v4.dc.html`): `THEMES`, `THEME_KEYS`, `applyAccent`, `AC_L`/`AC_C`/`acRamp` e as variáveis `--isl-surface`, `--isl-lane`, `--isl-panel`, `--isl-ring`. O protótipo v4 não está em `design/` (o bundle extraído é o v3); os valores abaixo vêm dele. Código: `src/core/theme.ts` (paleta, testada), `src/core/color.ts` (oklch → hex, alfa) e `src/ui/tokens.ts` (paleta ativa).

Dois temas, escolhidos na chave GSettings `theme` (spec 13, página Geral). O padrão é o Nocturne, que é o visual de todas as outras specs.

## Aplicação

- A paleta ativa (`colors`, `surfaces`, `derivedColors` em `ui/tokens.ts`) é mutada por `applyTheme` e lida na construção dos atores. Não há constante de módulo com cor: leia sempre dentro de função.
- Trocar o tema na janela de preferências recria as barras (`BarManager.rebuild`), com o editor fechado. Estado da ilha (modo aberto) não é preservado.
- Cores de exceção (spec 02: bateria, alerta vermelho, Desligar) valem em qualquer tema.
- Os temas só trocam cor e superfície. Tamanhos, tipografia, movimento e comportamento não mudam.

## Superfícies

`island` (ilha e peek), `lane` (pílulas laterais) e `panel` (painel do editor). O anel de todas é 1px `neutral-800` do tema.

| Tema | island | lane | panel | neutral-900 / neutral-800 |
|---|---|---|---|---|
| Nocturne | `bg` | `bg` | `bg` 94% | `#292b31` / `#3f424d` |
| Alto contraste | `#0b0c12` | `#0b0c12` | `#0b0c12` | `#262938` / `#6a7089` |

## Cores

| Token | Nocturne | Alto contraste |
|---|---|---|
| `bg` | `#161826` | `#0b0c12` |
| `surface` | `#232532` | `#14161f` |
| `text` | `#e9e9ed` | `#f7f8fc` |
| `neutral-100…700` | spec 01 | `#f7f8fc #eef0f7 #e3e6f0 #d3d7e5 #bcc1d4 #9aa0b8 #7c829c` |

O Alto contraste gera a escala de realce em oklch (`L` = .97 .93 .87 .78 .67 .57 .47 .37 .28; `C` = .02 .04 .07 .11 .125 .12 .10 .075 .045) com chroma ×1,25; passos 5 a 7 recuam dois degraus (mínimo o 3º passo); 8 e 9 voltam ao chroma normal; o `accent` é o passo 4.

Derivadas que seguem a paleta: divisor (`text` 16%), ponta transparente do degradê (`neutral-800` a 0%), brilho do alvo na edição e do thumb do volume (`accent` 22% e 60%) e hover/pressionado dos botões (`accent` 10–22%).

## Critérios de aceite

- [ ] Nocturne continua idêntico ao que era antes dos temas.
- [ ] O Alto contraste abre todos os modos da ilha sem texto ilegível nem ícone sumido (música, volume, quick, Wi‑Fi, Bluetooth, calendário, IA, nota, `env`, peek).
- [ ] Trocar o tema nas preferências refaz a barra na hora, sem erro no log do Shell.
- [ ] Alto contraste: bordas visíveis em toda superfície.
- [ ] Lock e unlock mantêm o tema escolhido.
