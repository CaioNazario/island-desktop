# 14 · Spikes

Pontos que ninguém verificou ainda. Cada spike se resolve **antes** de implementar a feature que depende dele: um experimento pequeno e descartável, e o resultado (o que funciona, com a API exata) entra na spec dependente. Depois disso, o spike sai desta lista.

## S1 · Formato da notificação web no Firefox

- **Bloqueia**: identificação da origem das notificações do Firefox (spec 04). Brave, Chrome e Chromium já estão resolvidos: o Chromium põe o domínio na primeira linha do corpo (payload real do Brave, fixture em `src/core/notificationSource.test.ts`). O formato do Chrome e do Chromium foi assumido pelo código compartilhado, sem payload colhido.
- **Pergunta**: em que campo e formato o Firefox entrega o domínio de origem de uma notificação web no GNOME 50 (`app_name`, `summary`, `body`, hints `desktop-entry`/`image-path`)?
- **Como**: `dbus-monitor "interface='org.freedesktop.Notifications'"` enquanto um site manda `new Notification(...)` pelo console do DevTools do Firefox. Guardar o payload como fixture dos testes de `notificationSource.ts`.
- **Pronto quando**: há uma fixture do Firefox e a regra de extração dele está escrita na spec 04.

## S4 · Publicação no extensions.gnome.org (futuro, fora da v1)

- **Pergunta**: o review do EGO aceita uma extensão que lê credenciais de CLIs de terceiros e chama endpoints não documentados com User-Agent de outro cliente?
- **Pronto quando**: há uma resposta das diretrizes do EGO ou de um reviewer; enquanto isso, a instalação é só via `install.sh`.
