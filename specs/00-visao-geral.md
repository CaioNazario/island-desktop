# 00 · Visão geral

## O produto

A Island substitui o painel superior do GNOME por três pílulas flutuantes. A do meio, a **ilha**, muda de tamanho conforme o contexto (estilo Dynamic Island) e concentra estados transitórios e controles. Usuário-alvo: dev em Linux/GNOME que quer ver estado do sistema e uso de IA sem clicar, e alcançar volume, brilho, Wi‑Fi, Bluetooth e energia em um clique ou `Super+S`.

## Glossário

| Termo | Significado |
|---|---|
| **Barra** | Faixa de 30px no topo com as três pílulas, uma por monitor |
| **Pílula esquerda** | Uso de IA (spec 12) |
| **Pílula direita** | Hardware, notificações, Wi‑Fi, volume, bateria, seta (specs 04, 08, 10, 11) |
| **Ilha** | Pílula central; tem um **modo** por vez |
| **Modo** | Estado da ilha: `compact`, `notif`, `stack`, `music`, `volume`, `brightness`, `calendar`, `quick`, `wifi`, `bt`, `ai` |
| **Modo transitório** | Fecha sozinho após um timer: `notif`, `music`, `volume`, `brightness` |
| **Modo fixo** | Fica até clique fora, Esc ou novo gatilho: `stack`, `calendar`, `quick`, `wifi`, `bt`, `ai` |
| **Cartão central** | Ilha expandida com música + calendário (spec 05) |
| **Banner** | Notificação que desce abaixo da ilha quando ela está ocupada (spec 04) |
| **Linha de energia** | Fileira Suspender/Reiniciar/Desligar/Sair/Bloquear (spec 09) |

## Mapa de specs

| # | Spec | Cobre |
|---|---|---|
| 01 | [design-tokens](01-design-tokens.md) | Cores, tipografia, ícones, equivalentes St |
| 02 | [barra](02-barra.md) | Pílulas, monitores, tela cheia, overview, auto-ocultar, struts |
| 03 | [ilha](03-ilha.md) | Máquina de estados, tamanhos, animação, timers, hover, Esc/clique fora |
| 04 | [notificacoes](04-notificacoes.md) | Captura, identificação de serviço web, roteamento, DND, lista |
| 05 | [musica](05-musica.md) | MPRIS, modo música, cartão central |
| 06 | [calendario](06-calendario.md) | Semana/mês, eventos (EDS) |
| 07 | [clima](07-clima.md) | GWeather, cadeia de fallback |
| 08 | [controles-rapidos](08-controles-rapidos.md) | Controles rápidos, volume/brilho, Wi‑Fi (+ senha), Bluetooth |
| 09 | [sessao-energia](09-sessao-energia.md) | Configurações, linha de energia |
| 10 | [hardware](10-hardware.md) | CPU, RAM, GPU, TEMP, NET |
| 11 | [bateria](11-bateria.md) | Ícone, cores, carregando |
| 12 | [uso-ia](12-uso-ia.md) | Claude + Codex |
| 13 | [preferencias](13-preferencias.md) | GSettings + janela de preferências |
| 14 | [spikes](14-spikes.md) | Pontos em aberto a resolver antes da feature dependente |

## Ordem de implementação

1. Esqueleto: `extension.ts`, `install.sh`, `Makefile`, Vitest, ESLint, `tsc`, schema GSettings
2. 01 → 02 → 03 (barra vazia + ilha com relógio, estados e animação)
3. 08 (controles rápidos, volume, brilho, Wi‑Fi, Bluetooth) → 09 → 11
4. 04 (notificações) → 05/06 (música, calendário, cartão central)
5. 10 (hardware) → 07 (clima) → 12 (IA)
6. 13 (preferências) consolida as opções que cada spec já declarou

## Fora de escopo (v1)

- Botão Atividades, terminais/Ghostty, modo Download e modo `system` (existem ou existiram no design e foram cortados)
- Extensão de navegador companion (a música de navegador mostra ícone genérico)
- Ubuntu/outras distros testadas (o código não assume Arch, mas só o Arch é validado)
- Publicação no extensions.gnome.org (instalação via `install.sh`)
- Tema claro, botões de ação em notificações, bandeja AppIndicator, troca de layout de teclado
- GPU NVIDIA no bloco de hardware (sem máquina para validar o `nvidia-smi`)

## Critérios de aceite globais

- [ ] Lock/unlock de tela 20 vezes seguidas: nenhum ator, signal ou timeout vaza (Looking Glass/`journalctl` limpos) e o painel original do GNOME nunca aparece durante a sessão desbloqueada.
- [ ] Desabilitar a extensão devolve o painel padrão do GNOME funcionando.
- [ ] Nenhuma exceção não tratada chega ao Shell em uso normal.
- [ ] Animações da ilha sem queda perceptível de quadros a 60Hz.
