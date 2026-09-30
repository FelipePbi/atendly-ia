import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";

/**
 * Prazo de retencao configuravel por negocio (Goal023/WU-01, G-29).
 *
 * A **existencia da linha** em `RetentionSettings` nunca e a escolha aqui —
 * diferente de `ReminderSettings` (Goal021), a linha so guarda o desvio do
 * default do produto. Ausencia de linha e sempre Comercial 90 / Pessoal 30,
 * resolvido nesta funcao, nunca por linha fabricada em boot ou por `@default`
 * de coluna interpretado como valor gravado.
 *
 * So duas categorias existem. Nao ha campo, parametro ou default para uma
 * terceira categoria "nao classificada": esse conteudo segue o prazo Comercial
 * (U-01, D-096), regra escrita em `retentionCutoffs`.
 */

export const RETENTION_DAYS_OPTIONS = [30, 90, 180, 365] as const;
export type RetentionDays = (typeof RETENTION_DAYS_OPTIONS)[number];

export const DEFAULT_COMMERCIAL_RETENTION_DAYS: RetentionDays = 90;
export const DEFAULT_PERSONAL_RETENTION_DAYS: RetentionDays = 30;

export type RetentionCategory = "COMMERCIAL" | "PERSONAL";

const retentionDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(365),
]);

export const retentionPatchSchema = z
  .object({
    commercialRetentionDays: retentionDaysSchema.optional(),
    personalRetentionDays: retentionDaysSchema.optional(),
    // Sem default: reduzir sem isto e recusado; aumentar nunca exige.
    confirmReduction: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.commercialRetentionDays !== undefined ||
      body.personalRetentionDays !== undefined,
    {
      message: "Informe commercialRetentionDays e/ou personalRetentionDays.",
    },
  );

export type RetentionPatchInput = z.infer<typeof retentionPatchSchema>;

/** Os dois prazos vigentes, sem nada em volta. É o que a varredura lê. */
export interface RetentionDaysState {
  commercialRetentionDays: RetentionDays;
  personalRetentionDays: RetentionDays;
}

export interface RetentionState extends RetentionDaysState {
  /**
   * A allowlist do servidor, devolvida ao cliente. O seletor não decide quais
   * opções existem: ele lê as que o servidor aceita, e um valor fora desta
   * lista é recusado no `PATCH` mesmo que alguém o construa à mão.
   */
  retentionDaysOptions: readonly RetentionDays[];
  /**
   * **U-01 (D-096), dito no contrato e não só na tela.** Conteúdo de sessão
   * `UNCLASSIFIED` não tem prazo, coluna nem opção próprios: segue o prazo
   * Comercial — e um segundo consumidor da API precisa saber disso sem ler a
   * interface. Constante de propósito: não é estado, é invariante.
   */
  unclassifiedRetentionFollows: "COMMERCIAL";
  /**
   * Instante da última varredura **concluída** deste negócio — nula enquanto
   * nenhuma passada tiver terminado com todas as fontes de pé. Vem de
   * `RetentionSweepState.lastCompletedAt`, não de `lastRunAt`: passada que
   * degradou terminou, mas não concluiu.
   */
  lastSweepCompletedAt: string | null;
  /**
   * Uma redução aceita só passa a valer na varredura de purga seguinte:
   * nenhuma rota pública apaga dado nem antecipa a varredura.
   */
  appliesFrom: "NEXT_SWEEP";
}

interface RetentionRow {
  commercialRetentionDays: number;
  personalRetentionDays: number;
}

function resolveCurrent(row: RetentionRow | null): RetentionDaysState {
  return {
    commercialRetentionDays: (row?.commercialRetentionDays ??
      DEFAULT_COMMERCIAL_RETENTION_DAYS) as RetentionDays,
    personalRetentionDays: (row?.personalRetentionDays ??
      DEFAULT_PERSONAL_RETENTION_DAYS) as RetentionDays,
  };
}

/**
 * Só os dois prazos. É o que a varredura precisa saber, e ela não paga a
 * leitura do estado da própria varredura para descobrir o prazo do negócio.
 */
export async function loadRetentionDays(
  prisma: Pick<PrismaClient, "retentionSettings">,
  tenantId: string,
): Promise<RetentionDaysState> {
  return resolveCurrent(
    await prisma.retentionSettings.findUnique({ where: { tenantId } }),
  );
}

/**
 * O estado inteiro do contrato público: os prazos vigentes, a allowlist do
 * servidor, a invariante de Não classificadas e o instante da última
 * varredura concluída. Duas leituras porque são duas tabelas, e a segunda
 * pode não ter linha — negócio nunca varrido responde `null`, nunca uma data
 * inventada.
 */
export async function loadRetentionState(
  prisma: PrismaClient,
  tenantId: string,
): Promise<RetentionState> {
  const [days, sweep] = await Promise.all([
    loadRetentionDays(prisma, tenantId),
    prisma.retentionSweepState.findUnique({
      where: { tenantId },
      select: { lastCompletedAt: true },
    }),
  ]);
  return retentionState(days, sweep?.lastCompletedAt ?? null);
}

function retentionState(
  days: RetentionDaysState,
  lastSweepCompletedAt: Date | null,
): RetentionState {
  return {
    ...days,
    retentionDaysOptions: RETENTION_DAYS_OPTIONS,
    unclassifiedRetentionFollows: "COMMERCIAL",
    lastSweepCompletedAt: lastSweepCompletedAt?.toISOString() ?? null,
    appliesFrom: "NEXT_SWEEP",
  };
}

/**
 * Grava o patch inteiro numa unica linha (upsert). Categoria ausente do corpo
 * preserva o valor corrente — gravado ou default, o que valer no momento.
 *
 * Qualquer redução (comercial, pessoal, ou as duas) sem `confirmReduction:
 * true` é recusada antes de qualquer escrita, com o de/para de cada categoria
 * reduzida no erro. Aumentar nunca exige confirmação, mesmo quando a outra
 * categoria do mesmo corpo está reduzindo.
 *
 * `updatedBy` é o autor da escrita — o `userId` da sessão, resolvido pelo
 * `requireTenantContext`, nunca um identificador vindo do corpo. É rastro de
 * quem decidiu encurtar a memória do negócio: fica gravado, mas não sai no
 * contrato público (§7 não o lista) e nada o lê para decidir prazo ou purga.
 */
export async function applyRetentionPatch(
  prisma: PrismaClient,
  tenantId: string,
  patch: RetentionPatchInput,
  updatedBy: string,
): Promise<RetentionState> {
  const [row, sweep] = await Promise.all([
    prisma.retentionSettings.findUnique({ where: { tenantId } }),
    prisma.retentionSweepState.findUnique({
      where: { tenantId },
      select: { lastCompletedAt: true },
    }),
  ]);
  const current = resolveCurrent(row);

  const next = {
    commercialRetentionDays:
      patch.commercialRetentionDays ?? current.commercialRetentionDays,
    personalRetentionDays:
      patch.personalRetentionDays ?? current.personalRetentionDays,
  };

  const reductions: Array<{
    category: RetentionCategory;
    from: RetentionDays;
    to: RetentionDays;
  }> = [];
  if (next.commercialRetentionDays < current.commercialRetentionDays) {
    reductions.push({
      category: "COMMERCIAL",
      from: current.commercialRetentionDays,
      to: next.commercialRetentionDays,
    });
  }
  if (next.personalRetentionDays < current.personalRetentionDays) {
    reductions.push({
      category: "PERSONAL",
      from: current.personalRetentionDays,
      to: next.personalRetentionDays,
    });
  }

  if (reductions.length > 0 && patch.confirmReduction !== true) {
    throw new AppError(
      "RETENTION_REDUCTION_REQUIRES_CONFIRMATION",
      `Reducing retention requires confirmReduction: true (${reductions
        .map((r) => `${r.category} ${r.from}->${r.to}`)
        .join(", ")}).`,
      409,
      { reductions },
    );
  }

  await prisma.retentionSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...next, updatedBy },
    update: { ...next, updatedBy },
  });

  // O `PATCH` devolve a mesma forma do `GET`, inclusive a última varredura
  // concluída: gravar prazo não varre, e a resposta não pode sugerir que
  // varreu.
  return retentionState(next, sweep?.lastCompletedAt ?? null);
}
