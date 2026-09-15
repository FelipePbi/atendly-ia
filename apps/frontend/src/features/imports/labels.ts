import type {
  ImportCategory,
  ImportDecisionKind,
  ImportSessionStatus,
} from "./types";

export const CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
];

export const CATEGORY_LABELS: Record<ImportCategory, string> = {
  SERVICE: "serviços",
  CUSTOMER: "clientes",
  AVAILABILITY: "horários de atendimento",
  TIME_BLOCK: "bloqueios",
  FUTURE_APPOINTMENT: "agendamentos futuros",
  PAST_APPOINTMENT: "atendimentos anteriores",
  CANCELLED_APPOINTMENT: "cancelamentos",
  NO_SHOW_APPOINTMENT: "faltas",
};

/**
 * Linguagem de produto para cada limitação declarada pela origem
 * (Goal020/WU-06). Nunca repete `limitationDetail` do servidor: aquele texto
 * é escrito para quem lê o código do provider, não para quem usa a tela.
 */
const LIMITATION_LABELS: Record<string, string> = {
  CUSTOMER_DIRECTORY_UNAVAILABLE:
    "O Minha Agenda não tem uma lista completa de clientes. Só trazemos quem aparece em um agendamento ou bloqueio encontrado.",
  NO_SHOW_NOT_MODELED_BY_SOURCE:
    "O Minha Agenda não distingue falta de cancelamento. Nenhum atendimento será marcado como falta a partir de lá.",
};

/** Nunca fabrica número: quando a origem não cobre a categoria, só explica por quê. */
export function limitationLabel(limitationCode: string | null): string {
  if (limitationCode && LIMITATION_LABELS[limitationCode]) {
    return LIMITATION_LABELS[limitationCode];
  }
  return "O Minha Agenda tem cobertura parcial nesta categoria.";
}

export const importCountFormatter = new Intl.NumberFormat("pt-BR");

/** Data/hora dos marcos da importação, no formato do produto. */
export function formatImportDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Decisão de item aceita pelo contrato (Goal020/WU-07): as cinco do endpoint
 * `.../items/:itemId/decision`, sem `IMPORT_ALL` nem
 * `ACCEPT_PENDING_COMPLETION` — esses dois são de outro escopo de decisão.
 */
export type ItemDecisionKind = Extract<
  ImportDecisionKind,
  "INCLUDE" | "EXCLUDE" | "MERGE_WITH_EXISTING" | "CREATE_NEW" | "KEEP_EXISTING"
>;

export const DECISION_LABELS: Record<ItemDecisionKind, string> = {
  INCLUDE: "Incluir mesmo assim",
  MERGE_WITH_EXISTING: "Mesclar com um cadastro existente",
  CREATE_NEW: "Criar um novo cadastro",
  KEEP_EXISTING: "Manter o cadastro existente (não importar este)",
  EXCLUDE: "Não importar este item",
};

/**
 * `MERGE_WITH_EXISTING`/`KEEP_EXISTING` só fazem sentido para uma entidade
 * que pode ter um cadastro já existente para apontar (serviço, cliente); o
 * próprio contrato recusa as duas para as demais categorias.
 */
const MERGE_ELIGIBLE_CATEGORIES = new Set<ImportCategory>(["SERVICE", "CUSTOMER"]);

export function decisionsForCategory(category: ImportCategory): ItemDecisionKind[] {
  return MERGE_ELIGIBLE_CATEGORIES.has(category)
    ? ["INCLUDE", "MERGE_WITH_EXISTING", "CREATE_NEW", "KEEP_EXISTING", "EXCLUDE"]
    : ["INCLUDE", "EXCLUDE"];
}

const TARGET_REQUIRED_DECISIONS = new Set<ItemDecisionKind>([
  "MERGE_WITH_EXISTING",
  "KEEP_EXISTING",
]);

export function decisionRequiresTarget(decision: ItemDecisionKind): boolean {
  return TARGET_REQUIRED_DECISIONS.has(decision);
}

/**
 * Linguagem de produto para cada conflito (Goal020/WU-07), pelo mesmo motivo
 * de `limitationLabel`: o texto do motor de importação é escrito para quem lê
 * o código do classificador, não para quem decide na tela.
 */
const CONFLICT_REASON_LABELS: Record<string, string> = {
  SERVICE_MATCH_AMBIGUOUS:
    "Mais de um serviço já cadastrado tem esse mesmo nome. Escolha qual corresponde, ou crie um novo.",
  SERVICE_MATCH_SIMILAR:
    "Já existe um serviço com nome parecido. Confirme se é o mesmo antes de importar.",
  SERVICE_DURATION_MISSING:
    "Esse serviço não tem duração informada. Sem duração, ele fica indisponível para novos agendamentos da IA até ser revisado.",
  CUSTOMER_MATCH_AMBIGUOUS:
    "Mais de um cliente já cadastrado tem o mesmo telefone e nome. Escolha qual corresponde, ou crie um novo cadastro.",
  CUSTOMER_MATCH_SIMILAR:
    "Já existe um cliente com nome parecido. Confirme se é a mesma pessoa antes de importar.",
  CUSTOMER_NAME_MISSING:
    "Esse cliente não tem nome na origem. Ele fica identificado temporariamente pelo id de origem, a não ser que você decida outra coisa.",
  APPOINTMENT_SLOT_TAKEN:
    "Esse horário já está ocupado por um atendimento na Atendly. Decida se ainda assim deve ser incluído ou não.",
};

export function conflictReasonLabel(reasonCode: string | null): string {
  if (reasonCode && CONFLICT_REASON_LABELS[reasonCode]) {
    return CONFLICT_REASON_LABELS[reasonCode];
  }
  return "Este item precisa da sua decisão antes de ser importado.";
}

/**
 * Rótulo de cada `ImportSessionStatus` (Goal020). Fica aqui, e não em uma
 * tela, porque a retomada e a execução mostram o mesmo estado de sessão.
 */
export const STATUS_LABELS: Record<ImportSessionStatus, string> = {
  DRAFT: "Conectado, preparando a análise",
  ANALYZING: "Analisando seus dados",
  READY: "Pronto para revisão",
  EXECUTING: "Importando",
  PARTIAL: "Importação parcial em andamento",
  FAILED: "Falhou",
  SUPERSEDED: "Substituída",
  COMPLETED: "Concluída",
};

/**
 * Confirmação final da conclusão, palavra por palavra como o vault a define
 * (`docs/product-vault/02-Fluxos/05-Importacao-Unica.md`, "Confirmação
 * final"). Só aparece quando restam itens não importados: sem pendência não
 * há o que aceitar, e pedir confirmação à toa ensina a confirmar sem ler.
 */
export const SINGLE_IMPORT_CONFIRMATION_TITLE = "Esta é sua única importação.";
export const SINGLE_IMPORT_CONFIRMATION_BODY =
  "Depois de concluir, não será possível importar novamente do Minha Agenda. Alguns registros não serão importados. Deseja concluir mesmo assim?";
