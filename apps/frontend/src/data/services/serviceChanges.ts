import { createChangeSignal } from "./changeSignal";

/**
 * Aviso de que o catálogo de serviços mudou (criação ou edição). A lista de
 * Serviços fica montada entre a lista e o editor e não busca de novo a cada
 * clique; é este aviso que a faz atualizar.
 */
const services = createChangeSignal();

export const onServicesChanged = services.subscribe;
export const notifyServicesChanged = services.notify;
