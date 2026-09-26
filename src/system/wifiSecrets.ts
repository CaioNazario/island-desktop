import type NM from 'gi://NM';
import Shell from 'gi://Shell';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Component as NetworkAgent } from 'resource:///org/gnome/shell/ui/components/networkAgent.js';

type RequestHandler = (requestId: string, connection: NM.Connection, ...rest: unknown[]) => void;

type NetworkAgentPrototype = Record<'_showNotification' | '_handleRequest', RequestHandler> & {
  _native: Shell.NetworkAgent;
};

// specs/08-controles-rapidos.md "Senha errada" (spike S2): quando o NM pede
// segredo de novo pra um perfil que a ilha acabou de criar com a PSK, a senha
// foi recusada. O pedido é cancelado aqui, antes do diálogo nativo.
//
// js/ui/components/networkAgent.js (Shell 50.4) liga `new-request` a
// `this._newRequest.bind(this)` no constructor, então injetar em
// `_newRequest` não pega a instância que já existe. `_newRequest` chama
// `this._showNotification` ou `this._handleRequest` pelo protótipo, e é
// neles que a injeção entra. A resposta é USER_CANCELED: com
// INTERNAL_ERROR o NM repassa o pedido pra outro agente.
export class WifiSecretInterceptor {
  private readonly injectionManager = new InjectionManager();

  /** `onRequest` devolve true quando o pedido é de um perfil da ilha. */
  constructor(onRequest: (uuid: string) => boolean) {
    const prototype = NetworkAgent.prototype as unknown as NetworkAgentPrototype;

    for (const methodName of ['_showNotification', '_handleRequest'] as const) {
      this.injectionManager.overrideMethod(
        prototype,
        methodName,
        (original: RequestHandler) =>
          function (this: NetworkAgentPrototype, requestId, connection, ...rest) {
            if (onRequest(connection.get_uuid())) {
              this._native.respond(requestId, Shell.NetworkAgentResponse.USER_CANCELED);
              return;
            }
            original.call(this, requestId, connection, ...rest);
          },
      );
    }
  }

  destroy(): void {
    this.injectionManager.clear();
  }
}
