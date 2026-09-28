# 03 · Ilha

Origem: `design/logic.js` `SIZES`/`TRANSIENT` (linhas 1–5), `setMode`/`arm`/`closeAll` (~94–104), `onKey` (~70), `renderVals` (~177–250), `islandClick`/`islandEnter`/`islandLeave` (~384–392); `design/markup.html` 29–318.

A máquina de estados vive em `src/core/island.ts` (pura, testada). A UI só renderiza o estado.

## Modos e tamanhos

| Modo | L × A (px) | Raio | Tipo | Spec |
|---|---|---|---|---|
| `compact` | 240 × 30 | 15 | — | abaixo |
| `notif` | 400 × 62 | 22 | transitório 2500ms (navegador 2100ms) | 04 |
| `stack` | 400 × (56 + min(6, n)·52), vazia 56 + 72 | 24 | fixo | 04 |
| `music` | 500 × 82 | 26 | transitório 2500ms | 05 |
| `volume` | 320 × 50 | 25 | transitório 1500ms | 08 |
| `brightness` | 320 × 50 | 25 | transitório 1500ms | 08 |
| `calendar` | 480 × 150 (semana) / 214 (mês) | 24 | fixo | 06 |
| `quick` | 520 × 58, com linha de energia 106 | 29 | fixo | 08, 09 |
| `wifi` | 520 × 292 (+48 energia, +58 senha, +76 senha com erro) | 26 | fixo | 08 |
| `bt` | 520 × 348 (BT ligado) / 300 (desligado), +48 energia | 26 | fixo | 08 |
| `ai` | 480 × (24 + 32 + p·108 − 6), p = provedores | 24 | fixo | 12 |

Os tempos dos transitórios são mais curtos que o `TRANSIENT` do design (4200/4500/2600ms) por decisão do usuário.

`brightness` não existe no design: é um clone de `volume` com ícone `ph ph-sun` e o valor do brilho.

## Modo compacto

240×30, conteúdo centralizado, gap 10px, 13px/500:

`[clima] · [hora] · [dia]`

- Clima: `ph-fill` da condição 15px `accent-300` + temperatura `neutral-300` (gap 4px). Spec 07; sem clima, o item e seu separador somem.
- Separador: ponto 3×3 `neutral-600`.
- Hora: `HH:MM` 24h, locale pt-BR.
- Dia: dia da semana abreviado sem ponto, capitalizado, + dia do mês (`Sex, 25`).

## Animação

- Largura e altura: 460ms `EASE_OUT_BACK`; raio: 460ms ease.
- Voltar a `compact`: 460ms `EASE_OUT_CUBIC`, sem repique. Com a mola, a ilha encolhe abaixo do compacto e, vindo de um modo alto (cartão central), a altura passa de 0 e a ilha pisca no tamanho do modo que saiu.
- Entrar em `wifi` ou `bt`: 550ms `EASE_OUT_CUBIC`, sem repique, e o raio na mesma duração. Eles crescem ~240px; com a mola padrão a abertura parece rápida demais e o repique recolhe a borda de baixo.
- Cada modo é uma camada própria, centrada no topo da ilha, com o tamanho do seu modo. Troca de modo = crossfade: a camada que entra vai a opacidade 1 em 220ms com atraso de 80ms e escala 0.94→1 (300ms); a que sai faz o inverso. A camada `notif` entra de `translateY(-18px) scale(.96)`.
- Linha de acento: 36×2 no topo central, `accent`, raio inferior 2px; opacidade 1 quando a ilha não está em `compact` ou o cartão central está aberto (300ms).
- Contorno: só o anel 1px `neutral-800` (`border` da superfície), expandida ou compacta. A sombra escura e o brilho `accent` do design saíram de propósito: no Shell eles aparecem como um halo quadrado em volta da ilha.
- Cursor de mão só em `compact` e `notif`.

## Regras de transição

1. **Abrir por gatilho do usuário** (clique na barra, `Super+S`): substitui qualquer modo e fecha cartão central, linha de energia e painel de senha.
2. Clicar no gatilho do modo já aberto fecha a ilha.
3. **Eventos automáticos nunca substituem modo fixo nem cartão aberto**:
   - notificação: regras da spec 04
   - troca de faixa: abre `music` só se a ilha estiver em `compact` ou num modo transitório
4. **Tecla de volume/brilho**: abre `volume`/`brightness` se a ilha estiver em `compact` ou num modo transitório. Com modo fixo aberto, só altera o valor (os sliders de `quick`/`wifi`/`bt` refletem na hora).
5. **Clique na ilha**: em `compact` executa a opção "Clique na ilha abre" (spec 13: cartão central, padrão, ou modo `calendar`); em `notif` abre `stack` e marca tudo como lido; nos outros modos, cliques são do conteúdo.
6. **Timer transitório**: armado ao entrar no modo; ao vencer, volta a `compact` só se o modo ainda for o mesmo.
7. **Hover** na ilha cancela o timer; sair do hover rearma o timer do modo atual.
8. Interagir com um slider cancela o timer durante o arraste e rearma ao soltar.
9. **Esc** fecha tudo (modo, cartão, linha de energia), exceto quando o campo de senha de Wi‑Fi tem foco: aí Esc só fecha o painel de senha.

## Foco de teclado

Modos fixos e o cartão central tomam o foco de teclado (grab modal, como os menus do Shell) enquanto abertos. É isso que permite Esc, setas nos sliders e digitar a senha de Wi‑Fi. O grab é liberado ao fechar e no `disable()`. Modos transitórios não tomam foco.

## Atalho `Super+S`

- Alterna `quick`: de qualquer modo vai para `quick`; de `quick` volta a `compact`.
- Ignora repetição ao segurar a tecla.
- A Island assume o atalho `toggle-quick-settings` do Shell no `enable()` (o painel nativo está escondido) e devolve o comportamento original no `disable()`.

## Critérios de aceite

- [ ] `src/core/island.ts` tem teste para cada regra de transição acima, incluindo timers com relógio falso.
- [ ] Cada modo abre com as medidas da tabela (±1px).
- [ ] Uma notificação chegando com `wifi` aberto não altera a ilha (vira banner, spec 04).
- [ ] Trocar de faixa com `calendar` aberto não abre `music`.
- [ ] Segurar `Super+S` não faz a ilha piscar.
- [ ] Com o mouse sobre a ilha em `notif`, ela não fecha; ao sair, fecha 2500ms depois.
- [ ] Esc com o campo de senha focado fecha só o painel de senha; um segundo Esc fecha a ilha.
