# 19 · Cor de realce

Origem: `design/logic.js` `AC_L`, `AC_C`, `AC_PRESETS`, `acRamp`, `applyAccent`, `acToggle`, `acReset`, `acOnHue`/`acOnChroma`, `acBtnBg`/`acBtnFg`; `design/markup.html` botão `acToggle` e bloco `acOpen` em `quick`.

O usuário escolhe a matiz e a saturação da cor de realce. Toda a escala `accent-100…900` e o `accent` são recalculados; os neutros não mudam.

## Escala

Regra pura em `src/core/accent.ts`:

- Matiz `h` (0–360) e saturação `k` (0–200%, `k/100` multiplica o croma).
- `accent-N00` = `oklch(L[N], C[N]·k/100, h)`:
  - `L` = `.97 .93 .87 .78 .67 .57 .47 .37 .28`
  - `C` = `.02 .04 .07 .11 .125 .12 .1 .075 .045`
- `accent` = `accent-500`.
- Conversão oklch → sRGB no próprio módulo. Fora do gamut, cada canal é cortado em 0–1.
- Padrão: matiz 289, saturação 100% → `#f4f3ff #e6e4ff #d2cdff #b5acfa #9387dd #766ab9 #5a508f #3f3865 #28253e`. Difere em até ~5 por canal da tabela fixa anterior (spec 01): o design também passa a usar a escala calculada.
- Cores derivadas do `accent` também seguem a escala: brilhos de 10/18/22/60%, hover/pressed de `.btn-primary`/`.btn-ghost` (spec 01) e brilho da pílula-alvo (spec 17).

## Aplicação no Shell

- O CSS do St não tem variáveis. A cada mudança, o stylesheet é gerado a partir de `src/ui/tokens.ts` com a escala nova e recarregado no tema do St: carrega o novo e descarrega o anterior (spike S6).
- Cores pintadas por código (anel do pomodoro, ícones tingidos de notificação etc.) leem os tokens de novo quando a escala muda.
- Durante o arraste dos sliders, a prévia é ao vivo com no máximo uma recarga a cada 100ms. Ao soltar, grava em GSettings `accent-hue`/`accent-chroma` (spec 13).
- O stylesheet gerado vai para o diretório de runtime do usuário, nunca para dentro da extensão, e é apagado no `disable()`.

## Botão na linha de controles

Na linha de controles (spec 08), depois do divisor e antes de Configurações (spec 09):

- 38×38 raio 19, `ph-fill ph-palette` 17px.
- Fechado: `neutral-800`/`neutral-300`. Aberto: `accent-600`/`neutral-100`. Hover `neutral-700`/`text`, pressionado `accent-800`.
- Em `quick`, alterna o painel de realce. Em `wifi`/`bt`, vai para `quick` com o painel aberto (no design o painel só existe em `quick`).
- Painel de realce e linha de energia (spec 09) se excluem: abrir um fecha o outro.

## Painel de realce (em `quick`)

- A ilha vai de 58 para **174px** (58 + 116), com a mola da spec 03.
- Painel abaixo da linha de controles: margens laterais 10px, padding 12px, raio 16, `neutral-900`, linhas com gap 12px.
- **Linha 1**: "Cor de realce" 12.5px/500 · à direita 8 amostras 20×20 raio 10, gap 5px · "Resetar" (22px, raio 11, `neutral-800`, 11px, hover `neutral-700`).
  - Amostras: Blurple 289, Azul 255, Ciano 215, Verde 155, Lima 125, Âmbar 75, Coral 35, Rosa 350. Cor `oklch(0.67, 0.125·k/100, h)`. Clique muda só a matiz.
  - A amostra da matiz atual ganha anel duplo: 2px `bg` + 1px `neutral-300`.
  - Resetar volta para 289 / 100%.
- **Linha 2**: duas colunas, gap 16px, com o slider da spec 08.
  - "Matiz" 11px `neutral-400` + valor `289°` `text` à direita (0–360).
  - "Saturação" + `100%` (0–200).
- **Linha 3**: a escala atual em 9 faixas de 8px de altura, raio 3, gap 3px.
- Trocar de modo, Esc ou clique fora fecham o painel.

## Critérios de aceite

- [ ] Testes de `accent.ts`: escala padrão igual à lista acima, matiz 0 e 360 iguais, saturação 0 dá cinzas, saturação 200 fica dentro de 0–255 em todos os canais.
- [ ] Arrastar a matiz muda a cor da ilha, dos sliders e dos tiles ao vivo, sem travar a animação.
- [ ] A cor escolhida sobrevive a lock/unlock e reinício de sessão; Resetar volta ao padrão.
- [ ] Abrir o painel com a linha de energia aberta fecha a linha, e vice-versa.
- [ ] Nenhum stylesheet fica carregado ou em disco depois do `disable()`.
