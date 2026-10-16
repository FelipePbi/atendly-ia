import { createChangeSignal } from "./changeSignal";

/**
 * Aviso de que a importação mudou de estado (começou, foi analisada,
 * executada ou concluída). A lista de Configurações fica montada ao lado da
 * seção aberta e não busca de novo a cada clique; é este aviso que atualiza a
 * linha "Importação".
 */
const imports = createChangeSignal();

export const onImportChanged = imports.subscribe;
export const notifyImportChanged = imports.notify;
