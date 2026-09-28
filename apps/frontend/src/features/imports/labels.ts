import type { BffHttpError } from "@/data";

import type {
  ImportAvailabilityGridRule,
  ImportCategory,
  ImportDecisionKind,
  ImportSessionStatus,
  ImportWorkErrorCode,
} from "./types";

/**
 * Código de domínio de uma recusa do Scheduling, sempre repassado pelo BFF
 * como `error.code: "UPSTREAM_ERROR"` com `error.details.upstreamCode`
 * (Goal061 §7): nunca o código cru como `error.code` direto.
 */
export function upstreamErrorCode(error: BffHttpError): string | undefined {
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof value === "string" ? value : undefined;
}

/**
 * Texto por classe de `lastError` do trabalho em segundo plano (Goal061 §6):
 * a mensagem da origem nunca chega à tela, só a classe do código fechado.
 */
const WORK_ERROR_LABELS: Record<ImportWorkErrorCode, string> = {
  IMPORT_SOURCE_AUTH_REJECTED:
    "O Minha Agenda recusou a entrada. A senha pode ter mudado.",
  IMPORT_SOURCE_UNAVAILABLE:
    "O Minha Agenda não respondeu agora. Nada foi alterado. Tente mais tarde.",
  IMPORT_SOURCE_INVALID_RESPONSE:
    "O Minha Agenda respondeu de um jeito que não conseguimos entender. Tente novamente.",
  IMPORT_PREVIEW_STALE:
    "Seus dados mudaram desde a última análise. Nada foi importado nesta tentativa.",
  IMPORT_INTERNAL_ERROR:
    "Não foi possível continuar agora por uma falha da Atendly. Tente novamente.",
};

export function workErrorLabel(code: string): string {
  return (
    (WORK_ERROR_LABELS as Record<string, string>)[code] ??
    "Não foi possível continuar agora. Tente novamente."
  );
}

/**
 * Motivo de item `FAILED`, em linguagem leiga (Goal061 §6/IM-08): a tela
 * nunca mostra `reasonCode` cru. Código sem texto próprio cai no genérico.
 */
const FAILED_REASON_LABELS: Record<string, string> = {
  IMPORT_SERVICE_MAPPING_MISSING:
    "O serviço deste atendimento não veio da Minha Agenda (por exemplo, porque foi apagado lá).",
  IMPORT_CUSTOMER_MAPPING_MISSING:
    "O cliente deste atendimento não foi importado, então o atendimento também ficou de fora.",
  IMPORT_APPOINTMENT_INTERVAL_INVALID:
    "Este atendimento está sem duração e sem horário de término na Minha Agenda.",
  IMPORT_SOURCE_RECORD_INVALID:
    "Este registro veio incompleto ou em um formato que a Atendly não reconhece.",
  IMPORT_AVAILABILITY_COMPANY_MISSING:
    "A Minha Agenda não informou o horário de funcionamento do seu negócio.",
  IMPORT_ITEM_FAILED:
    "Houve uma falha inesperada ao importar este item.",
  AVAILABILITY_CHANGED_SINCE_ANALYSIS:
    "Seus horários de atendimento mudaram depois da análise, então nada foi alterado neles. Analise de novo para escolher entre os horários do Minha Agenda e os atuais.",
  AVAILABILITY_SOURCE_OVERLAP:
    "Os horários do Minha Agenda se sobrepõem no mesmo dia e não foram usados. Seus horários atuais continuam como estavam.",
};

export function failedReasonLabel(reasonCode: string): string {
  return FAILED_REASON_LABELS[reasonCode] ?? "Este item não foi importado.";
}

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
  CUSTOMER_DIRECTORY_LISTING_UNSUPPORTED:
    "Não foi possível ler a lista completa de clientes desta vez. Só trazemos quem aparece em um agendamento ou bloqueio encontrado.",
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
  AVAILABILITY_REPLACES_CURRENT:
    "O negócio já tem horários de atendimento cadastrados. Escolha se quer usar os horários do Minha Agenda no lugar deles ou manter os atuais.",
  AVAILABILITY_SOURCE_OVERLAP:
    "Os horários do Minha Agenda se sobrepõem no mesmo dia e não puderam ser usados. Você pode manter os horários atuais.",
  SERVICE_PRICE_NOT_INFORMED:
    "Esse serviço está com preço zero no Minha Agenda. Ele entra sem preço informado, e você pode definir o preço depois.",
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

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export interface AvailabilityDayGroup {
  dayOfWeek: number;
  label: string;
  intervals: string[];
}

/**
 * Agrupa a grade de disponibilidade por dia da semana para o conflito de
 * importação (Goal062 §2): a mesma regra de dia com mais de um intervalo
 * aparece junto, na ordem Domingo→Sábado, nunca na ordem de chegada da API.
 */
export function groupAvailabilityByDay(
  rules: ImportAvailabilityGridRule[] | null | undefined,
): AvailabilityDayGroup[] {
  if (!rules || rules.length === 0) return [];
  const byDay = new Map<number, string[]>();
  for (const rule of rules) {
    const intervals = byDay.get(rule.dayOfWeek) ?? [];
    intervals.push(`${rule.startTime}–${rule.endTime}`);
    byDay.set(rule.dayOfWeek, intervals);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, intervals]) => ({
      dayOfWeek,
      label: WEEKDAY_LABELS[dayOfWeek],
      intervals,
    }));
}
