/**
 * Aviso de que o cadastro de clientes mudou (criação, edição de nome ou
 * telefone, responsável). A lista de Clientes fica montada entre a lista e o
 * detalhe e não busca de novo a cada clique; é este aviso que a faz atualizar
 * quando há de fato algo novo para mostrar.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onCustomersChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCustomersChanged(): void {
  for (const listener of listeners) listener();
}
