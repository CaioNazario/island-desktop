# 11 · Bateria

Origem: `design/markup.html` 333 (botão na pílula direita); `design/logic.js` `batColor`/`batIcon` (~197–198), `batShown`, `batText`.

## Fonte

`UPower` (dispositivo de exibição `DisplayDevice`), via o proxy que o Shell já usa. Sem bateria (desktop) → o botão some.

## Exibição

Botão 24px de altura, padding 0 10px, gap 6px: ícone 17px + `78%` 13px/500. Clique abre `quick`.

Regra pura em `src/core/battery.ts`:

| Nível | Ícone (`ph-fill`) |
|---|---|
| ≥95 | `ph-battery-full` |
| ≥60 | `ph-battery-high` |
| >20 | `ph-battery-medium` |
| >8 | `ph-battery-low` |
| ≤8 | `ph-battery-warning` |
| **carregando** (qualquer nível) | `ph-battery-charging` |

| Nível | Cor do ícone | Cor do texto |
|---|---|---|
| ≥80 | `#5fd37f` | `text` |
| ≤20 | `#f75d59` | `#f75d59` |
| entre | `neutral-300` | `text` |

"Carregando" = estado UPower `Charging` ou `FullyCharged` na tomada. As cores seguem o nível também carregando.

## Critérios de aceite

- [ ] Testes de `battery.ts` cobrem todas as faixas de ícone e cor e o estado carregando.
- [ ] Ligar/desligar o carregador troca o ícone em até 2s.
- [ ] Em máquina sem bateria o botão não aparece e a seta continua abrindo `quick`.
