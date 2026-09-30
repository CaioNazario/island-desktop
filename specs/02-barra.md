# 02 · Barra

Origem: `design/markup.html` container `barRef`, pílula esquerda (`dropLeft`) e direita (`dropRight`); `design/logic.js` objeto `gTop` (medidas da barra no topo) e `laneW`/`laneH`/`lanePad`.

## Layout

- Container no topo de cada monitor: `left: 12px`, `right: 12px`, `top: 2px` (era 0 até o design v3), três filhos em linha com `gap: 6px`, alinhados pelo topo (a ilha cresce para baixo sem mover as laterais).
- **Pílulas laterais**: dividem igualmente o espaço que sobra da ilha (`flex: 1 1 0`); altura 30px, raio 15px, fundo `bg`, anel 1px `neutral-800`, padding horizontal 6px. Sem o blur do design: o `Shell.BlurEffect` é retangular (não segue o raio) e deixa as quinas quadradas.
- **Ilha**: largura/altura/raio do modo atual (spec 03), centralizada entre as laterais.

### Pílula esquerda

Botão de ambiente (spec 15) e, com gap 4px, a área de widgets do ambiente ativo **alinhada à direita** (encostada na ilha). Spec 16.

### Pílula direita

Da esquerda para a direita:

1. Área de widgets do ambiente ativo, **alinhada à esquerda** (encostada na ilha), ocupando o espaço livre. Spec 16.
2. Sino (`ph-fill ph-bell` 16px) com ponto de não lido 7×7 `accent` + anel 2px `bg`, em `top: 5px; right: 8px`. Abre `stack`.
3. Wi‑Fi (`ph-bold ph-wifi-high` / `ph-bold ph-wifi-slash` quando desligado). Abre `wifi`. Sem placa Wi‑Fi, some (como o tile e o modo, spec 08).
4. Volume (ícone conforme nível, spec 08). Abre `volume`.
5. Bateria (desenho com o nível dentro, spec 11). Abre `quick`.
6. Seta `ph ph-caret-down` 12px `neutral-300`. Abre `quick`.

Botões: 30×24, raio 12px, fundo transparente, hover `neutral-900`, gap 2px entre eles.

Clicar num gatilho cujo modo já está aberto fecha a ilha (`openFromBar`).

## Largura mínima

- Suporte a partir de **1280px lógicos** por monitor.
- Botão de ambiente e botões fixos da pílula direita nunca somem. Quando os widgets não cabem, a regra de corte é a da spec 16 (primeiro NET → GPU → TEMP do hardware, depois widgets inteiros, do mais longe da ilha para o mais perto).

## Monitores

- Uma barra por monitor, recriada quando monitores entram/saem (`Main.layoutManager` `monitors-changed`).
- Existe **um** estado de ilha. Ao abrir um modo, a ilha do monitor-alvo expande e as outras ficam em `compact`:
  - clique numa barra → monitor daquela barra
  - modos transitórios (notificação, música, volume, brilho) e `Super+S` → monitor da janela focada (primário se não houver janela focada)

## Tela cheia, overview e lock

- Monitor com janela em tela cheia: a barra daquele monitor some.
- Overview: a barra continua visível e funcional.
- Tela de bloqueio: a extensão está desabilitada (o GNOME chama `disable()`), nada da Island aparece.

## Espaço reservado (struts)

A barra reserva 32px no topo de cada monitor (2px de margem + 30px); janela maximizada começa em y=32. Com auto-ocultar ligado, não reserva nada (spec 18).

## Clique fora

Com modo fixo (`stack`, `calendar`, `quick`, `wifi`, `bt`, `ai`, `note`, `music` fixado) ou cartão central aberto, um clique em qualquer ponto fora da ilha/cartão fecha tudo e é **consumido** (não chega à janela embaixo), como os menus do GNOME.

## Critérios de aceite

- [x] As duas laterais têm sempre a mesma largura e a ilha fica centralizada no monitor.
- [ ] Maximizar uma janela a deixa encostada em y=32 sem sobrepor a barra.
- [ ] Em 1280px lógicos com a ilha em `wifi` (520px) e o ambiente Trabalho, nenhum texto da barra é cortado (widgets somem inteiros, spec 16).
- [x] Conectar/desconectar um segundo monitor cria/remove a barra dele sem reiniciar a extensão.
- [x] Uma janela em tela cheia esconde a barra só no monitor dela.
- [x] Clique fora de um modo fixo fecha a ilha e não ativa a janela clicada.
