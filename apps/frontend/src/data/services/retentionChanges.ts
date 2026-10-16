import { createChangeSignal } from "./changeSignal";

/**
 * Aviso de que a retenção das conversas mudou. A lista de Configurações fica
 * montada ao lado da seção aberta e não busca de novo a cada clique; é este
 * aviso que atualiza a linha "Conversas".
 */
const retention = createChangeSignal();

export const onRetentionChanged = retention.subscribe;
export const notifyRetentionChanged = retention.notify;
