import { createChangeSignal } from "./changeSignal";

/**
 * Aviso de que o cadastro de clientes mudou (criação, edição de nome ou
 * telefone, responsável). A lista de Clientes fica montada entre a lista e o
 * detalhe e não busca de novo a cada clique; é este aviso que a faz atualizar
 * quando há de fato algo novo para mostrar.
 */
const customers = createChangeSignal();

export const onCustomersChanged = customers.subscribe;
export const notifyCustomersChanged = customers.notify;
