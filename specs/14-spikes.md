# 14 · Spikes

Pontos que ninguém verificou ainda. Cada spike se resolve **antes** de implementar a feature que depende dele: um experimento pequeno e descartável, e o resultado (o que funciona, com a API exata) entra na spec dependente. Depois disso, o spike sai desta lista.

## S1 · Formato da notificação web

- **Bloqueia**: spec 04 (identificação da origem).
- **Pergunta**: em que campo e formato Brave, Chrome e Firefox entregam o domínio de origem de uma notificação web no GNOME 50 (`app_name`, `summary`, `body`, hints `desktop-entry`/`image-path`)? Com e sem `body-markup`/`body-hyperlinks`?
- **Como**: `dbus-monitor "interface='org.freedesktop.Notifications'"` enquanto YouTube, YouTube Music, Spotify Web e WhatsApp Web mandam notificação em cada navegador. Guardar os payloads como fixtures dos testes de `notification-source.ts`.
- **Pronto quando**: há uma fixture por navegador × serviço e a regra de extração está escrita na spec 04.

## S2 · Senha errada de Wi‑Fi sem diálogo nativo

- **Bloqueia**: spec 08 (painel de senha, erro "Senha incorreta").
- **Pergunta**: dá pra interceptar o pedido de novo segredo que o NetworkManager faz ao agente do Shell (`js/ui/components/networkAgent.js` na 50.x) só para conexões criadas pela ilha, sem quebrar o agente para o resto do sistema?
- **Como**: injeção com `InjectionManager` no handler de pedido de segredo, filtrando pelo UUID da conexão recém-criada. Testar senha certa, senha errada, cancelamento e rede Enterprise.
- **Pronto quando**: senha errada volta ao painel inline com "Senha incorreta" e nenhum diálogo aparece; ou fica provado que não dá, e a spec 08 passa a aceitar o diálogo nativo nesse caso.

## S3 · Parear Bluetooth sem agente de UI

- **Bloqueia**: spec 08 (Disponíveis → Parear).
- **Pergunta**: com o `GnomeBluetooth.Client` (ou BlueZ direto), dá pra parear dispositivos "Just Works" (mouse, fone, caixa) a partir do Shell sem o app Configurações aberto? Como detectar que o dispositivo pediu PIN/código, para redirecionar às Configurações?
- **Como**: parear mouse, fone e um celular (que pede código) com o adaptador da máquina de referência.
- **Pronto quando**: o caminho de pareamento e o sinal de "pediu PIN" estão escritos na spec 08.

## S4 · Publicação no extensions.gnome.org (futuro, fora da v1)

- **Pergunta**: o review do EGO aceita uma extensão que lê credenciais de CLIs de terceiros e chama endpoints não documentados com User-Agent de outro cliente?
- **Pronto quando**: há uma resposta das diretrizes do EGO ou de um reviewer; enquanto isso, a instalação é só via `install.sh`.
