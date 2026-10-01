# 11 · Bateria

Origem: `design/markup.html` botão `openSystem` na pílula direita; `design/logic.js` `batColor`, `batText`, `batFillW`, `batFillBg`, `batNum`, `chgD`.

## Fonte

`UPower` (dispositivo de exibição `DisplayDevice`), via o proxy que o Shell já usa. Sem bateria (desktop) → o botão some.

## Exibição

Botão 24px de altura, padding 0 10px, gap 4px, clique abre `quick`. No design v3 o ícone Phosphor + `78%` virou um desenho de bateria:

- **Corpo**: 28×15, borda 1.5px na cor da bateria, raio 4, padding 1.5px, conteúdo cortado.
- **Preenchimento**: largura = nível %, raio 2, cor da bateria com alfa 0.38 (spec 01), transição de largura 300ms.
- **Número**: nível sem `%`, centralizado sobre o corpo, 9.5px/600, `letter-spacing −0.02em`, dígitos tabulares, na cor do texto.
- **Polo**: 2×6 colado à direita do corpo (gap 1px), raio 0 1 1 0, na cor da bateria.
- **Raio de carga**: `ph-fill ph-lightning` 11px na cor da bateria, depois do polo, só carregando.

Regra pura em `src/core/battery.ts`:

| Nível | Cor da bateria | Cor do texto |
|---|---|---|
| ≥80 | `#5fd37f` | `text` |
| ≤20 | `#f75d59` | `#f75d59` |
| entre | `neutral-300` | `text` |

A tabela de ícones `ph-battery-*` por nível saiu: a barra não usa mais ícone de bateria (o `ph-fill ph-battery-medium` dos dispositivos Bluetooth, spec 08, continua).

"Carregando" = estado UPower `Charging`, `FullyCharged` ou `PendingCharge` (na tomada, parado pelo limite de carga). As cores seguem o nível também carregando.

## Critérios de aceite

- [x] Testes de `battery.ts` atualizados para o desenho: largura do preenchimento, faixas de cor e raio de carga.
- [x] Ligar/desligar o carregador mostra/esconde o raio em até 2s; o preenchimento acompanha o nível.
