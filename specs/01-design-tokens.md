# 01 · Design tokens

Origem: `design/tokens.css` (`:root` a partir da linha ~256, classes `.btn*` a partir da ~389) e cores literais em `design/logic.js`.

## Cores

O CSS do St não tem variáveis. Uma tabela única em `src/ui/tokens.ts` é a fonte: gera o `stylesheet.css` no build e alimenta o que é pintado por código.

| Token | Hex |
|---|---|
| `bg` | `#161826` |
| `surface` | `#232532` |
| `text` | `#e9e9ed` |
| `accent` | `#9184d9` |
| `neutral-100…900` | `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31` |
| `accent-100…900` | `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741` |

### Cores pré-calculadas

St não entende `oklch()` nem `color-mix()`. Valores convertidos:

| Uso no design | Original | St |
|---|---|---|
| Vermelho de alerta (IA ≥90%, TEMP ≥70°, bateria ≤20%) | `oklch(0.68 0.19 25)` | `#f75d59` |
| Texto vermelho (IA ≥90%, erro de senha) | `oklch(0.72 0.17 25)` | `#fd736d` |
| Verde bateria ≥80% | `oklch(0.78 0.16 150)` | `#5fd37f` |
| Fundo do botão Energia aberto | `oklch(0.45 0.14 25)` | `#932b2a` |
| Texto "Desligar" | `oklch(0.78 0.13 25)` | `#ff958d` |
| Borda do campo de senha com erro | `oklch(0.55 0.16 25)` | `#bd413f` |
| Brilho da ilha expandida | `accent` 18% | `rgba(145,132,217,0.18)` |
| Brilho do cartão central | `accent` 10% | `rgba(145,132,217,0.10)` |
| Brilho do thumb do slider de volume | `accent` 60% | `rgba(145,132,217,0.60)` |
| `.btn-primary:hover` / `:active` | `accent` 12% / 22% | `rgba(145,132,217,0.12)` / `0.22` |
| `.btn-ghost:hover` / `:active` | `accent` 10% / 18% | `rgba(145,132,217,0.10)` / `0.18` |
| Divisor | `text` 16% | `rgba(233,233,237,0.16)` |

## Tipografia

- **Inter** peso 500 para rótulos e 400 para corpo, conforme o design. Se Inter não estiver instalada, `install.sh` avisa e o St cai no fallback do sistema.
- Tamanhos usados: 8.5 (rótulo hardware, `letter-spacing .08em`), 10, 10.5, 11, 11.5, 12, 12.5, 13, 14px.
- Números sempre com dígitos tabulares (`font-feature-settings: "tnum"`).

## Ícones

- **Phosphor** nas variantes regular (`ph`), fill (`ph-fill`) e bold (`ph-bold`), exatamente as usadas no design.
- Empacotados como SVG simbólicos em `icons/` dentro da extensão e carregados por `Gio.FileIcon`; só os ícones usados, não a fonte inteira.
- Ícones de marca sem equivalente no Phosphor caem em `ph-music-note` (música) ou `ph-globe` (notificação de site).

## Efeitos (equivalentes St)

| Design | St |
|---|---|
| `backdrop-filter: blur(16px)` nas pílulas, `blur(20px)` no cartão | Sem blur: o `Shell.BlurEffect` não segue o `border-radius` e deixa as quinas quadradas (spec 02) |
| Mola da ilha `cubic-bezier(.3,1.2,.4,1)` .46s | `ease()` de 460ms + `set_cubic_bezier_progress((.3,1.2), (.4,1))` nas transições criadas (`easeSpring` em `src/ui/spring.ts`). Não usar `EASE_OUT_BACK`: passa ~10% do alvo, a curva do design ~1,25% |
| Cartões `cubic-bezier(.3,1.15,.4,1)` .4s | `EASE_OUT_BACK`, 400ms |
| Crossfade de conteúdo `.22s ease` com atraso `.08s` | `ease()` de `opacity`, 220ms, `delay: 80` |
| `box-shadow: 0 0 0 1px` (anel) | `box-shadow` do St (suporta um valor) ou `border` de 1px |
| `:hover` / `:active` | pseudo-classes `:hover` / `:active` do St |
| `:focus-visible` anel 2px `accent` | pseudo-classe `:focus` do St com `outline` via `border`/`box-shadow` de 2px |

## Critérios de aceite

- [ ] Cada cor usada na UI vem da tabela de tokens (nenhum hex solto fora dela).
- [ ] Captura de tela da ilha em cada modo, lado a lado com o design, bate em medidas (±1px), cores e ícones.
- [ ] Todo elemento interativo tem estados hover, pressed e foco visíveis.
