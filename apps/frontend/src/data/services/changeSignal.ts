/**
 * Aviso em memória de que um cadastro mudou. As listas que ficam montadas
 * entre a lista e o detalhe (Clientes, Serviços) não buscam de novo a cada
 * clique; é um aviso destes que as faz atualizar quando há de fato algo novo.
 */
type Listener = () => void;

export function createChangeSignal() {
  const listeners = new Set<Listener>();
  return {
    notify: (): void => {
      for (const listener of listeners) listener();
    },
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
