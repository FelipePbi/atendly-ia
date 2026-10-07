import type { BffHttpError } from "@/data";

import type {
  ImportAvailabilityGridRule,
  ImportCategory,
  ImportDecisionKind,
  ImportItem,
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
    "Não foi possível continuar agora por uma falha da Avenly. Tente novamente.",
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
    "Este registro veio incompleto ou em um formato que a Avenly não reconhece.",
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

export const DEFAULT_BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** Ordem do histórico concluído (I1): as cinco do quadro, depois as demais na ordem do contrato. */
const HISTORY_FIRST_CATEGORIES: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "AVAILABILITY",
];
export const HISTORY_CATEGORY_ORDER: ImportCategory[] = [
  ...HISTORY_FIRST_CATEGORIES,
  ...CATEGORY_ORDER.filter(
    (category) => !HISTORY_FIRST_CATEGORIES.includes(category),
  ),
];

/**
 * Texto curto da pílula da importação concluída no onboarding (2.I10), no
 * singular e no plural. Os horários não entram: a pílula deles não leva número.
 */
const HISTORY_PILL_LABELS: Record<
  Exclude<ImportCategory, "AVAILABILITY">,
  [singular: string, plural: string]
> = {
  SERVICE: ["serviço", "serviços"],
  CUSTOMER: ["cliente", "clientes"],
  FUTURE_APPOINTMENT: ["futuro", "futuros"],
  PAST_APPOINTMENT: ["anterior", "anteriores"],
  TIME_BLOCK: ["bloqueio", "bloqueios"],
  CANCELLED_APPOINTMENT: ["cancelamento", "cancelamentos"],
  NO_SHOW_APPOINTMENT: ["falta", "faltas"],
};

/** "12 serviços", "1 cliente" e, para os horários de atendimento, só "Horários". */
export function historyPillLabel(
  category: ImportCategory,
  imported: number,
): string {
  if (category === "AVAILABILITY") return "Horários";
  const [singular, plural] = HISTORY_PILL_LABELS[category];
  return `${importCountFormatter.format(imported)} ${imported === 1 ? singular : plural}`;
}

/** "18 de setembro de 2026, 10:42", no fuso do negócio. */
export function formatImportMoment(
  value: string | null,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): string | null {
  if (!value) return null;
  const moment = new Date(value);
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone,
    year: "numeric",
  }).format(moment);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(moment);
  return `${day}, ${time}`;
}

/** "18/09", no fuso do negócio. */
export function formatImportDayMonth(
  value: string | null,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
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

/**
 * Linguagem de produto para cada conflito (Goal020/WU-07), pelo mesmo motivo
 * de `limitationLabel`: o texto do motor de importação é escrito para quem lê
 * o código do classificador, não para quem decide na tela.
 */
const CONFLICT_REASON_LABELS: Record<string, string> = {
  SERVICE_MATCH_AMBIGUOUS:
    "Mais de um serviço já cadastrado tem esse mesmo nome. Escolha qual corresponde, ou crie um novo.",
  SERVICE_MATCH_DIVERGENT:
    "Esse serviço já existe na Avenly com outra duração ou outro preço. Compare e escolha qual fica.",
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
    "Esse horário já está ocupado por um atendimento na Avenly. Decida se ainda assim deve ser incluído ou não.",
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

/**
 * Partes da folha da confirmação (2.I9). O vault fixa a frase inteira em
 * `SINGLE_IMPORT_CONFIRMATION_BODY`; a folha do quadro põe o número em negrito
 * no meio dela, então o texto é cortado em duas pontas e o meio, "Alguns
 * registros não serão importados.", vira `notImportedSentence`. A constante de
 * cima continua sendo a fonte do texto.
 */
export const SINGLE_IMPORT_CONFIRMATION_LEAD =
  "Depois de concluir, não será possível importar novamente do Minha Agenda.";
export const SINGLE_IMPORT_CONFIRMATION_TAIL = "Deseja concluir mesmo assim?";

/** "3 registros não serão importados." e, no singular, "1 registro não será importado." */
export function notImportedSentence(count: number): string {
  return count === 1
    ? "1 registro não será importado."
    : `${importCountFormatter.format(count)} registros não serão importados.`;
}

/** Cada categoria no singular, em minúscula, para o motivo genérico do 2.I8. */
export const CATEGORY_SINGULAR_LABELS: Record<ImportCategory, string> = {
  SERVICE: "serviço",
  CUSTOMER: "cliente",
  AVAILABILITY: "horário de atendimento",
  TIME_BLOCK: "bloqueio",
  FUTURE_APPOINTMENT: "agendamento futuro",
  PAST_APPOINTMENT: "atendimento anterior",
  CANCELLED_APPOINTMENT: "cancelamento",
  NO_SHOW_APPOINTMENT: "falta",
};

/** Título da tela parada (2.I8), com a importação ainda por concluir. */
export const IMPORT_PENDING_TITLE = "Importação quase concluída";

/** "1.843 registros" e, no singular, "1 registro", no cartão do sucesso do 2.I8. */
export function importedCardCount(count: number): string {
  return `${importCountFormatter.format(count)} ${count === 1 ? "registro" : "registros"}`;
}

export function importedCardHint(count: number): string {
  return count === 1 ? "já está na Avenly" : "já estão na Avenly";
}

/**
 * Cabeçalho do painel das pendências (2.I8): os itens em revisão quando há; sem
 * eles, o que ainda não entrou (falhas e o que não foi processado).
 */
export function pendingPanelHeading(
  needsReview: number,
  outstanding: number,
): string {
  if (needsReview > 0) {
    return needsReview === 1
      ? "1 registro precisa de revisão"
      : `${importCountFormatter.format(needsReview)} registros precisam de revisão`;
  }
  return outstanding === 1
    ? "1 registro ainda não entrou"
    : `${importCountFormatter.format(outstanding)} registros ainda não entraram`;
}

/** Linha final do painel quando há mais itens em revisão que os mostrados. */
export function pendingMoreLabel(count: number): string {
  return `Mais ${importCountFormatter.format(count)} em Revisar pendências.`;
}

export const PENDING_ITEMS_READ_FAILED = "Não foi possível listar os itens agora.";
export const PENDING_PANEL_NOTE =
  "Você pode revisar agora. O que continuar pendente não será importado quando você concluir.";

export function pendingNotProcessedLabel(count: number): string {
  return count === 1
    ? "1 ainda não foi importado"
    : `${importCountFormatter.format(count)} ainda não foram importados`;
}

/**
 * Motivo curto e ação de um item em revisão no 2.I8, por `reasonCode`. O texto
 * longo de cada motivo continua em `conflictReasonLabel`, na tela de decisão.
 */
export function importReviewCopy(
  reasonCode: string | null,
  category: ImportCategory,
): { action: string; reason: string } {
  switch (reasonCode) {
    case "SERVICE_DURATION_MISSING":
      return { action: "Corrigir", reason: "sem duração · precisa de revisão" };
    case "CUSTOMER_NAME_MISSING":
      return { action: "Nomear", reason: "cliente sem nome" };
    default:
      return {
        action: "Corrigir",
        reason: `${CATEGORY_SINGULAR_LABELS[category]} · precisa de revisão`,
      };
  }
}

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

/**
 * Cadastro que a análise sugeriu para um item (D-150): no serviço traz os
 * valores, no cliente só o nome. Tipo derivado do contrato, sem repeti-lo.
 */
export type ImportItemCandidate = NonNullable<ImportItem["candidates"]>[number];
export type ImportServiceCandidate = Extract<
  ImportItemCandidate,
  { priceType: unknown }
>;
export type ImportProposedService = NonNullable<ImportItem["proposedService"]>;

export function isServiceCandidate(
  candidate: ImportItemCandidate,
): candidate is ImportServiceCandidate {
  return "priceType" in candidate;
}

/**
 * Onde o serviço da origem difere do cadastro sugerido, pela regra de D-150
 * (item 3): a duração só difere quando a origem a informa, e o preço só quando
 * a origem traz um preço fixo. Valor desconhecido da origem nunca diverge.
 */
export function serviceDivergence(
  candidate: ImportServiceCandidate,
  proposed: ImportProposedService | null | undefined,
): { duration: boolean; price: boolean } {
  if (!proposed) return { duration: false, price: false };
  const duration =
    proposed.durationMinutes !== null &&
    candidate.durationMinutes !== proposed.durationMinutes;
  const price =
    proposed.priceType === "FIXED" &&
    (candidate.priceType !== "FIXED" ||
      candidate.price === null ||
      candidate.price !== proposed.price);
  return { duration, price };
}

/**
 * Motivo curto do cabeçalho do cartão de decisão (2.I6), em minúscula e com o
 * tipo do registro na frente, como o quadro escreve.
 */
export function conflictShortReason(item: ImportItem): string {
  if (item.category === "CUSTOMER") return "cliente";
  switch (item.reasonCode) {
    case "SERVICE_MATCH_DIVERGENT": {
      const candidate = item.candidates?.find(isServiceCandidate);
      if (!candidate) return "serviço · valores diferentes";
      const { duration, price } = serviceDivergence(
        candidate,
        item.proposedService,
      );
      if (duration && price) return "serviço · preço e duração diferentes";
      if (duration) return "serviço · duração diferente";
      if (price) return "serviço · preço diferente";
      return "serviço · valores diferentes";
    }
    case "SERVICE_MATCH_SIMILAR":
      return "serviço · nome parecido";
    case "SERVICE_MATCH_AMBIGUOUS":
      return "serviço · mais de um com esse nome";
    case "SERVICE_DURATION_MISSING":
      return "serviço · sem duração";
    default:
      return CATEGORY_SINGULAR_LABELS[item.category];
  }
}

/** A pergunta do cartão de cliente com cadastro sugerido, por motivo. */
export function customerQuestionLabel(reasonCode: string | null): string {
  switch (reasonCode) {
    case "CUSTOMER_MATCH_SIMILAR":
      return "Nomes parecidos. São a mesma pessoa?";
    case "CUSTOMER_MATCH_AMBIGUOUS":
      return "Mais de um cliente com o mesmo nome e telefone. Qual é a mesma pessoa?";
    case "CUSTOMER_PHONE_SHARED":
      return "Mesmo telefone, nomes diferentes. São a mesma pessoa?";
    default:
      return "Parece alguém que já está na Avenly. São a mesma pessoa?";
  }
}

/** O cadastro sugerido sumiu entre a análise e a decisão. */
export const SUGGESTED_RECORD_GONE =
  "O cadastro sugerido não está mais na Avenly.";

/** O que a decisão tomada faz, na linha de resultado do cartão decidido. */
export function conflictResultLabel(
  category: ImportCategory,
  decision: ItemDecisionKind,
  targetName?: string,
): string {
  if (category === "AVAILABILITY") {
    return decision === "INCLUDE"
      ? "Vai usar os horários da Minha Agenda"
      : "Vai manter seus horários";
  }
  switch (decision) {
    case "KEEP_EXISTING":
      return "Vai manter o da Avenly";
    case "CREATE_NEW":
      return category === "CUSTOMER"
        ? "Vão ficar separadas"
        : "Vai entrar como outro serviço";
    case "MERGE_WITH_EXISTING":
      return targetName ? `Vai juntar com ${targetName}` : "Vai juntar";
    case "INCLUDE":
      return "Vai ser importado";
    case "EXCLUDE":
      return "Não vai ser importado";
  }
}

/** "3 registros precisam da sua decisão" e, no singular, "1 registro precisa da sua decisão". */
export function conflictsTitle(count: number): string {
  return count === 1
    ? "1 registro precisa da sua decisão"
    : `${importCountFormatter.format(count)} registros precisam da sua decisão`;
}

/** A descrição da tela de conflitos; `readyCount` é opcional (2.I6). */
export function conflictsDescription(readyCount?: number): string {
  const lead = "Encontramos dados parecidos aqui e no Minha Agenda.";
  if (!readyCount || readyCount <= 0) return lead;
  return readyCount === 1
    ? `${lead} O outro já está pronto.`
    : `${lead} Os outros ${importCountFormatter.format(readyCount)} já estão prontos.`;
}

export const CONFLICTS_FOOTER_NOTE =
  "Itens sem decisão ficam de fora até você resolver.";
