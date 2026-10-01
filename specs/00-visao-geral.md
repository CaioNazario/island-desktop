# 00 · Visão geral

## O produto

A Island substitui o painel superior do GNOME por três pílulas flutuantes. A do meio, a **ilha**, muda de tamanho conforme o contexto (estilo Dynamic Island) e concentra estados transitórios e controles. Usuário-alvo: dev em Linux/GNOME que quer ver estado do sistema e uso de IA sem clicar, e alcançar volume, brilho, Wi‑Fi, Bluetooth e energia em um clique ou `Super+S`.

## Glossário

| Termo | Significado |
|---|---|
| **Barra** | Faixa no topo (2px de margem + 30px) com as três pílulas, uma por monitor |
| **Pílula esquerda** | Botão de ambiente + widgets do ambiente ativo (specs 15, 16) |
| **Pílula direita** | Widgets do ambiente ativo + notificações, Wi‑Fi, volume, bateria, seta (specs 04, 08, 11, 16) |
| **Ambiente** | Conjunto nomeado de widgets para as duas pílulas; um ativo por vez (spec 15) |
| **Widget** | Bloco de informação numa pílula lateral: IA, hardware, evento, pomodoro etc. (spec 16) |
| **Ilha** | Pílula central; tem um **modo** por vez |
| **Modo** | Estado da ilha: `compact`, `notif`, `stack`, `music`, `volume`, `brightness`, `env`, `calendar`, `quick`, `wifi`, `bt`, `ai`, `note` |
| **Modo transitório** | Fecha sozinho após um timer: `notif`, `music`, `volume`, `brightness`, `env` |
| **Modo fixo** | Fica até clique fora, Esc ou novo gatilho: `stack`, `calendar`, `quick`, `wifi`, `bt`, `ai`, `note` e `music` fixado |
| **Cartão central** | Ilha expandida com música + calendário (spec 05; `hub` no design) |
| **Banner** | Notificação que desce abaixo da ilha quando ela está ocupada (spec 04) |
| **Linha de energia** | Fileira Suspender/Reiniciar/Desligar/Sair/Bloquear (spec 09) |

## Mapa de specs

| # | Spec | Cobre |
|---|---|---|
| 01 | [design-tokens](01-design-tokens.md) | Cores, tipografia, ícones, equivalentes St |
| 02 | [barra](02-barra.md) | Pílulas, monitores, tela cheia, overview, struts |
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
| 15 | [ambientes](15-ambientes.md) | Modelo, persistência, troca, botão de ambiente, modo `env` |
| 16 | [widgets](16-widgets.md) | Catálogo, visual, dados e clique de cada widget, modo `note` |
| 17 | [editor-ambientes](17-editor-ambientes.md) | Editor de ambientes e widgets, arrastar e soltar |
| 18 | [auto-ocultar](18-auto-ocultar.md) | Barra que some e volta pela borda |
| 19 | [cor-de-realce](19-cor-de-realce.md) | Matiz/saturação do `accent` em runtime |

## Ordem de implementação

1. Esqueleto: `extension.ts`, `install.sh`, `Makefile`, Vitest, ESLint, `tsc`, schema GSettings
2. 01 → 02 → 03 (barra vazia + ilha com relógio, estados e animação)
3. 08 (controles rápidos, volume, brilho, Wi‑Fi, Bluetooth) → 09 → 11
4. 04 (notificações) → 05/06 (música, calendário, cartão central)
5. 10 (hardware) → 07 (clima) → 12 (IA)
6. 13 (preferências) consolida as opções que cada spec já declarou
7. v1.1 (design v3): 15 → 16 → 17 → 11 → 18 → 19, com os spikes da spec 14 antes da spec dependente; a 11 entra pelo desenho da bateria que o v3 trouxe
8. Specs anteriores que o v3 reabriu (02, 03, 05, 13): conferir o que as specs 15–19 já cobriram e implementar o resto antes da tag v1.1.0

## Fora de escopo (v1.x)

- Botão Atividades, terminais/Ghostty, modo Download e modo `system` (existem ou existiram no design e foram cortados)
- Barra na base ou nas laterais (`barPosition` do design), ilha vertical (`SIZES.compactV`) e widgets verticais: a barra fica só no topo
- Atalhos numerados de ambiente (`Alt+1–N` do design)
- Extensão de navegador companion (a música de navegador mostra ícone genérico)
- Ubuntu/outras distros testadas (o código não assume Arch, mas só o Arch é validado)
- Publicação no extensions.gnome.org (instalação via `install.sh`)
- Tema claro, botões de ação em notificações, bandeja AppIndicator, troca de layout de teclado
- GPU NVIDIA no bloco de hardware (sem máquina para validar o `nvidia-smi`)

## Critérios de aceite globais

- [x] Lock/unlock de tela 20 vezes seguidas: nenhum ator, signal ou timeout vaza (Looking Glass/`journalctl` limpos) e o painel original do GNOME nunca aparece durante a sessão desbloqueada.
- [x] Desabilitar a extensão devolve o painel padrão do GNOME funcionando.
- [x] Nenhuma exceção não tratada chega ao Shell em uso normal.
- [x] Animações da ilha sem queda perceptível de quadros a 60Hz.
