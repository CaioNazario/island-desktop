# 02 · Barra

Origem: `design/markup.html` linhas 5–28 (container e pílula esquerda) e 320–335 (pílula direita); `design/logic.js` `hidden`/`barY` (~248).

## Layout

- Container no topo de cada monitor: `left: 12px`, `right: 12px`, `top: 0`, três filhos em linha com `gap: 6px`, alinhados pelo topo (a ilha cresce para baixo sem mover as laterais).
- **Pílulas laterais**: dividem igualmente o espaço que sobra da ilha (`flex: 1 1 0`); altura 30px, raio 15px, fundo `bg`, anel 1px `neutral-800`, padding horizontal 6px. Sem o blur do design: o `Shell.BlurEffect` é retangular (não segue o raio) e deixa as quinas quadradas.
- **Ilha**: largura/altura/raio do modo atual (spec 03), centralizada entre as laterais.

### Pílula esquerda

Só o botão de uso de IA, **alinhado à direita** (encostado na ilha). Spec 12. O botão Atividades do design não existe.

### Pílula direita

Da esquerda para a direita:

1. Grupo de hardware, alinhado à esquerda (`margin-right: auto`), padding 0 10px, gap 10px. Spec 10.
2. Sino (`ph-fill ph-bell` 16px) com ponto de não lido 7×7 `accent` + anel 2px `bg`, em `top: 5px; right: 8px`. Abre `stack`.
3. Wi‑Fi (`ph-bold ph-wifi-high` / `ph-wifi-slash` quando desligado). Abre `wifi`.
4. Volume (ícone conforme nível, spec 08). Abre `volume`.
5. Bateria (ícone + %, 13px/500, gap 6px, padding 0 10px). Abre `quick`. Spec 11.
6. Seta `ph ph-caret-down` 12px `neutral-300`. Abre `quick`.

Botões: 30×24, raio 12px, fundo transparente, hover `neutral-900`, gap 2px entre eles. O ícone de usuário do design não existe.

Clicar num gatilho cujo modo já está aberto fecha a ilha (`openFromBar`).

## Largura mínima

- Suporte a partir de **1280px lógicos** por monitor.
- Quando o conteúdo da pílula direita não cabe com a ilha no maior modo (520px), blocos de hardware somem nesta ordem: **NET → GPU → TEMP**. CPU e RAM nunca somem. A decisão é por medida do espaço disponível, não por breakpoint fixo.

## Monitores

- Uma barra por monitor, recriada quando monitores entram/saem (`Main.layoutManager` `monitors-changed`).
- Existe **um** estado de ilha. Ao abrir um modo, a ilha do monitor-alvo expande e as outras ficam em `compact`:
  - clique numa barra → monitor daquela barra
  - modos transitórios (notificação, música, volume, brilho) e `Super+S` → monitor da janela focada (primário se não houver janela focada)

## Tela cheia, overview e lock

- Monitor com janela em tela cheia: a barra daquele monitor some.
- Overview: a barra continua visível e funcional.
- Tela de bloqueio: a extensão está desabilitada (o GNOME chama `disable()`), nada da Island aparece.

## Espaço reservado (struts) e auto-ocultar

- Auto-ocultar **desligado** (padrão): a barra reserva 30px no topo de cada monitor; janela maximizada começa em y=30.
- Auto-ocultar **ligado**: a barra não reserva espaço e flutua sobre as janelas.
  - Some com `translateY(-60px)` quando: nenhum modo expandido e nenhum cartão aberto.
  - Uma faixa invisível de 6px no topo revela a barra ao encostar o ponteiro; ela some de novo quando o ponteiro sai da linha da barra.
  - Animação 320ms `EASE_OUT_CUBIC`.

## Clique fora

Com modo fixo (`stack`, `calendar`, `quick`, `wifi`, `bt`, `ai`) ou cartão central aberto, um clique em qualquer ponto fora da ilha/cartão fecha tudo e é **consumido** (não chega à janela embaixo), como os menus do GNOME.

## Critérios de aceite

- [ ] As duas laterais têm sempre a mesma largura e a ilha fica centralizada no monitor.
- [ ] Com auto-ocultar desligado, maximizar uma janela a deixa encostada em y=30 sem sobrepor a barra.
- [ ] Com auto-ocultar ligado, a barra aparece ao encostar no topo, some ao sair e não some enquanto um modo está aberto.
- [ ] Em 1280px lógicos com a ilha em `wifi` (520px), nenhum texto da barra é cortado.
- [ ] Conectar/desconectar um segundo monitor cria/remove a barra dele sem reiniciar a extensão.
- [ ] Uma janela em tela cheia esconde a barra só no monitor dela.
- [ ] Clique fora de um modo fixo fecha a ilha e não ativa a janela clicada.
