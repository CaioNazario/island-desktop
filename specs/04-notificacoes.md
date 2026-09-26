# 04 · Notificações

Origem: `design/logic.js` `pushNotif` (~136), `stack`/`latest`/`unreadDot`/`openPeek`; `design/markup.html` 40–72 (modos `notif` e `stack`) e 385–398 (banner).

## Fonte

- A fonte da verdade é o `Main.messageTray` do Shell (fontes + notificações). A Island é uma **view**: escuta a chegada e a remoção de notificações e nunca guarda cópia própria. Por isso o histórico sobrevive ao lock/unlock.
- Os banners nativos do GNOME ficam bloqueados enquanto a extensão está habilitada e voltam no `disable()`. O mecanismo exato (propriedade/injeção no `MessageTray` da 50.x) deve ser confirmado no código-fonte do Shell antes de implementar.

## Identificação da origem

Regra pura em `src/core/notification-source.ts`, com a tabela em `data/web-services.json` (editável, sem recompilar):

1. **Notificação de navegador** (app Brave, Google Chrome, Chromium, Firefox): extrair o domínio de origem do corpo. O formato exato por navegador é o spike S1 (spec 14).
2. Domínio na tabela → nome + ícone da tabela:

   | Domínio | Nome | Ícone |
   |---|---|---|
   | `music.youtube.com` | YouTube Music | `ph-fill ph-youtube-logo` |
   | `youtube.com` | YouTube | `ph-fill ph-youtube-logo` |
   | `open.spotify.com` | Spotify | `ph-fill ph-spotify-logo` |
   | `web.whatsapp.com` | WhatsApp | `ph-fill ph-whatsapp-logo` |

   A comparação ignora `www.` e casa o subdomínio mais específico primeiro.
3. Domínio fora da tabela → nome = rótulo principal do domínio registrável, capitalizado (`twitch.tv` → "Twitch", `www.github.com` → "Github"); ícone `ph ph-globe`.
4. A linha do domínio é removida do texto exibido. Nunca mostrar "Brave" nem `www.youtube.com`.
5. **App nativo**: nome do app; ícone simbólico do app (`<ícone>-symbolic`) tingido de `accent-300`, ou `ph-fill ph-bell` se não houver simbólico.

## Roteamento de uma notificação nova

| Estado da ilha | Resultado |
|---|---|
| `compact` sem cartão aberto | abre `notif` (4200ms) |
| `notif` | troca o conteúdo pela nova e rearma o timer |
| `stack` | entra no topo da lista com fundo `accent-900` por 2500ms (transição 600ms) |
| qualquer outro modo, ou cartão central aberto | **banner** abaixo da ilha; nada aberto é substituído |

Toda notificação nova acende o ponto de não lido do sino.

### Não perturbe

Com "Não perturbe" ligado (`org.gnome.desktop.notifications show-banners = false`), a notificação vai direto para a lista, sem abrir `notif` nem banner. Urgência **crítica** fura o DND e segue a tabela acima; `notif` de notificação crítica não fecha sozinho.

## Modo `notif` (400×62)

Padding 0 12px, gap 12px:
- Bloco do ícone 36×36, raio 10, fundo `accent-900`, ícone 20px `accent-300`.
- Linha 1: nome 13px/500 + tempo 11px `neutral-500` à direita. Linha 2: texto 12px `neutral-400`, uma linha com reticências.
- × 26×26, raio 13, fundo `neutral-900`: fecha a ilha (a notificação continua na lista).
- Clicar no resto da ilha abre `stack`.

## Modo `stack` (lista)

- Padding 12px. Cabeçalho 28px: `ph-fill ph-bell` 14px `neutral-300`, "Notificações" 13px/500, chip com a contagem (11px, padding 1 7, raio 9, `neutral-900`), e "Limpar tudo" à direita (24px de altura, raio 12, `neutral-900`, 11px; some com a lista vazia).
- Itens de 50px, raio 12, padding 0 6px, gap 2px entre itens, hover `neutral-900`. Bloco do ícone 32×32 raio 9, ícone 18px. × 22×22 transparente `neutral-500` (título "Dispensar").
- Mostra as **8 mais recentes**, 6 visíveis, com rolagem fina.
- Vazia: 72px, `ph ph-bell-slash` 16px + "Nenhuma notificação" 12.5px `neutral-500`.
- Abrir a lista (pelo sino, pelo `notif` ou pelo banner) marca tudo como lido.
- **Clique num item**: executa a ação padrão da notificação (abre/foca o app ou site), remove o item e fecha a ilha. **×**: só remove. **Limpar tudo**: remove todas.

## Banner

- 380px de largura, centralizado, `top` = altura atual da ilha + 8px (acompanha a ilha com a mesma mola). 58px de altura, raio 22, fundo `bg`, anel `neutral-800` + sombra `0 18px 40px rgba(0,0,0,.6)` + brilho `accent` 18% 24px.
- Mesmo conteúdo do `notif` (bloco 34×34, ícone 19px, × 24×24).
- Entra de `translateY(-16px)`, fica 4000ms. Clique abre `stack`; × dispensa só o banner.

## Tempo relativo

"agora" (<1 min), "há N min" (<60 min), "há N h". Atualiza a cada minuto enquanto visível.

## Critérios de aceite

- [ ] Testes de `notification-source.ts` cobrem cada linha da tabela, domínio desconhecido, `www.`, subdomínio mais específico e app nativo.
- [ ] Testes do roteamento cobrem os quatro estados da tabela e o DND com e sem urgência crítica.
- [ ] Notificação do YouTube no Brave aparece como "YouTube" com o ícone do YouTube, sem a linha do domínio.
- [ ] Com `wifi` aberto, uma notificação vira banner e o modo `wifi` continua intacto.
- [ ] Nenhum banner nativo do GNOME aparece com a extensão ativa; ao desabilitar, voltam.
- [ ] Lock/unlock mantém a lista de notificações.
