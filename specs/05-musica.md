# 05 · Música e cartão central

Origem: `design/markup.html` 73–91 (modo `music`) e 338–383 (cartão central); `design/logic.js` `track`/`posLabel`/`posPct`/`togglePlay`/`prevTrack`/`nextTrack`, `pv('center')`.

## Fonte: MPRIS

- Serviço em `src/system/mpris.ts`: acompanha nomes `org.mpris.MediaPlayer2.*` no barramento de sessão (entrada, saída, `PropertiesChanged`, `Seeked`).
- **Player atual**: o último que entrou em `Playing`. Pausado continua atual até outro tocar ou ele sair do barramento.
- Dados: `xesam:artist` (array, junto com ", "), `xesam:title`, `mpris:length`, `mpris:artUrl`, `Position`, `PlaybackStatus`, `CanGoPrevious`/`CanGoNext`.
- `Position` não gera sinal: ler ao abrir e avançar localmente a cada 1s enquanto tocando; ressincronizar em `Seeked` e em troca de faixa.
- Capa: `file://` direto; `http(s)://` baixada de forma assíncrona para cache em `$XDG_CACHE_HOME/island/`. Sem capa: bloco `accent-900` com `ph-fill ph-music-note` 24px `accent-300`.
- Artista vazio: mostra o nome do player (`Identity`).

### Ícone da fonte

| Player | Ícone |
|---|---|
| Spotify (app nativo) | `ph-fill ph-spotify-logo` |
| Google Chrome / Chromium | `ph-fill ph-google-chrome-logo` |
| Firefox | `ph-fill ph-firefox-logo` |
| qualquer outro (inclui Brave) | `ph-fill ph-music-note` |

Música tocando em aba de navegador mostra título/artista/capa que o MPRIS entrega. A Island não sabe qual site é: sem companion de navegador na v1.

## Modo `music` (500×82, transitório 4500ms)

- **Gatilho**: troca de faixa (`mpris:trackid` ou título muda) com o player atual tocando, respeitando a regra 3 da spec 03. Descobrir um player já tocando não dispara.
- Padding 0 14px, gap 14px: capa 56×56 raio 12 · bloco de texto · controles · ícone da fonte 22px `accent-400`.
- Texto: artista 13px/500, título 12px `neutral-400`. Progresso (margin-top 6px, 10px `neutral-500`): posição · barra 3px (`accent` sobre `neutral-800`) · duração. Tempo em `m:ss`.
- Controles: anterior 34×34 (`ph-fill ph-skip-back` 17px), tocar/pausar 38×38 (`ph-fill ph-play`/`ph-pause` 22px), próxima 34×34 (`ph-fill ph-skip-forward` 17px); hover `neutral-900`. Qualquer controle rearma o timer. Botão desabilitado quando `CanGo*` é falso.

## Cartão central

- Abre ao clicar na ilha em `compact` quando "Clique na ilha abre" = **Calendário e música** (padrão, spec 13). Clicar de novo na ilha, Esc ou clique fora fecha.
- 420px, centralizado, `top: 38px`. Entra com opacidade 220ms + `translateY(-10px) scale(.96)` → normal em 400ms `EASE_OUT_BACK`, origem no topo.
- Raio 22, fundo `rgba(22,24,38,0.92)` + blur, anel `neutral-800` + sombra `0 24px 60px rgba(0,0,0,.6)` + brilho `accent` 10% 32px. Padding 18px.
- **Seção de música**: capa 56×56 raio 12, artista 14px/500, título 12.5px `neutral-400`, ícone da fonte 22px `accent-400` alinhado ao topo. Progresso (margin-top 12px): barra 3px + `pos / duração` 10.5px `neutral-500`. Controles centralizados, gap 18px: 36/40/36 com ícones 17/24/17.
- Divisor: 1px, gradiente transparente → `neutral-800` (15%–85%) → transparente, sangrando até as bordas do cartão (margin 14px −18px).
- **Seção de calendário**: spec 06.
- **Nada tocando** (nenhum player atual): seção de música e divisor somem; o cartão vira só calendário.

## Critérios de aceite

- [ ] Com Brave tocando um vídeo, o cartão mostra título, artista e capa do MPRIS e o ícone `ph-music-note`.
- [ ] Pular faixa pelo teclado de mídia abre `music` com a faixa nova; com `ai` aberto, não abre.
- [ ] Barra de progresso avança a cada segundo e corrige após seek no player.
- [ ] Fechar o player remove a seção de música do cartão.
- [ ] Dois players: o último a tocar é o exibido.
