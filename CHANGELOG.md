# Changelog

Versões da Island, extensão do GNOME Shell. Formato de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), numeração [SemVer](https://semver.org/lang/pt-BR/): na série 0.x, uma versão minor pode quebrar compatibilidade.

## [Não lançada]

## [0.3.0] - 2026-10-27

Design v4.

### Adicionado

- Temas: paleta de alto contraste e escolha do tema nas preferências (spec 19).
- Teste de fumaça que liga e desliga a extensão num Shell headless (`make smoke`).

### Mudado

- Expansões de uma linha da ilha mais finas (design v4).
- CI roda em todo push.

## [0.2.1] - 2026-10-02

### Corrigido

- Bateria mais fina, com preenchimento sólido.
- Bateria verde só a partir de 90%.

## [0.2.0] - 2026-09-30

Design v3.

### Adicionado

- Ambientes: conjuntos de widgets da barra, trocados rolando sobre a barra ou com `Super+Ctrl+←/→`.
- Editor de ambientes, com arrastar e soltar.
- Widgets: progresso do dia, contagem regressiva, próximo evento, nota, música, pomodoro e GitHub.
- Auto-ocultar a barra.
- Bateria desenhada na barra.

### Mudado

- Cartão central abre com 440px e raio 26.

## [0.1.0] - 2026-09-28

Primeira versão.

### Adicionado

- Barra de três pílulas no lugar do painel do GNOME, com a ilha no centro.
- Controles rápidos (`Super+S`): volume, brilho, Wi-Fi, Bluetooth, configurações e energia.
- OSD de volume e brilho na ilha.
- Notificações: banner, lista e site no lugar do navegador em alertas web.
- Música via MPRIS.
- Cartão central com música e calendário, e o modo calendário.
- Hardware: CPU, RAM, GPU, disco e rede.
- Clima com GWeather.
- Uso de IA do Claude e do Codex.
- Preferências: geral, clima e uso de IA.

[Não lançada]: https://github.com/CaioNazario/island-desktop/compare/v0.3.0...dev
[0.3.0]: https://github.com/CaioNazario/island-desktop/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/CaioNazario/island-desktop/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/CaioNazario/island-desktop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CaioNazario/island-desktop/releases/tag/v0.1.0
