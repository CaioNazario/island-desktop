# 14 · Spikes

Pontos que ninguém verificou ainda. Cada spike se resolve **antes** de implementar a feature que depende dele: um experimento pequeno e descartável, e o resultado (o que funciona, com a API exata) entra na spec dependente. Depois disso, o spike sai desta lista.

## S1 · Formato da notificação web

- **Bloqueia**: spec 04 (identificação da origem).
- **Pergunta**: em que campo e formato Brave, Chrome e Firefox entregam o domínio de origem de uma notificação web no GNOME 50 (`app_name`, `summary`, `body`, hints `desktop-entry`/`image-path`)? Com e sem `body-markup`/`body-hyperlinks`?
- **Como**: `dbus-monitor "interface='org.freedesktop.Notifications'"` enquanto YouTube, YouTube Music, Spotify Web e WhatsApp Web mandam notificação em cada navegador. Guardar os payloads como fixtures dos testes de `notification-source.ts`.
- **Pronto quando**: há uma fixture por navegador × serviço e a regra de extração está escrita na spec 04.

## S4 · Publicação no extensions.gnome.org (futuro, fora da v1)

- **Pergunta**: o review do EGO aceita uma extensão que lê credenciais de CLIs de terceiros e chama endpoints não documentados com User-Agent de outro cliente?
- **Pronto quando**: há uma resposta das diretrizes do EGO ou de um reviewer; enquanto isso, a instalação é só via `install.sh`.
