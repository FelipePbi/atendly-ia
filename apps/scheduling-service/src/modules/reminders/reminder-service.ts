import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  AppointmentNotificationSlot,
  ReminderPricePolicy,
} from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

/** As duas posicoes que `ReminderRule` admite (constraint `ReminderRule_slot_check`). */
export type ReminderSlot = Extract<AppointmentNotificationSlot, "FIRST" | "SECOND">;

const REMINDER_SLOTS: readonly ReminderSlot[] = ["FIRST", "SECOND"];
const PRICE_POLICIES: readonly ReminderPricePolicy[] = ["NEVER", "WHEN_FIXED"];

/**
 * Antecedencia padrao do produto (G-27): um lembrete a vinte e quatro horas,
 * quando o negocio nunca configurou lembrete. Constante unica, nunca
 * materializada por backfill (ver migration.sql e o header do schema) —
 * usada apenas em leitura, quando `ReminderSettings` nao tem linha.
 */
export const DEFAULT_REMINDER_LEAD_MINUTES = 24 * 60;

/**
 * Teto de antecedencia declarado pela constraint SQL
 * `ReminderRule_leadMinutes_check`: trinta dias, para que "personalizado"
 * nao vire lembrete a anos do compromisso.
 */
export const MAX_REMINDER_LEAD_MINUTES = 43_200;

export interface ReminderRuleInput {
  slot: ReminderSlot;
  leadMinutes: number;
}

export interface ReminderConfigInput {
  confirmationEnabled?: boolean;
  pricePolicy?: ReminderPricePolicy;
  rules: ReminderRuleInput[];
}

export interface ReminderRuleRecord {
  slot: ReminderSlot;
  leadMinutes: number;
}

export interface ReminderConfig {
  /**
   * `false` quando o negocio nunca gravou `ReminderSettings`: a leitura
   * devolve o default do produto, nao uma escolha do negocio. `true` sempre
   * que a linha existe, mesmo com `rules` vazio — a escolha explicita de
   * desligar os lembretes.
   */
  configured: boolean;
  confirmationEnabled: boolean;
  pricePolicy: ReminderPricePolicy;
  rules: ReminderRuleRecord[];
}

/**
 * Configuracao de lembrete do negocio (Goal021, G-27). A existencia da linha
 * em `ReminderSettings` e a escolha: sem linha, o default do produto vale
 * (um lembrete a 24h); com linha e zero `ReminderRule`, o negocio desligou os
 * lembretes de proposito. A mesma regra que o Goal018 aplicou a
 * `BusinessProfile.modalities`.
 */
export class ReminderService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  async get(): Promise<ReminderConfig> {
    const settings = await this.database.reminderSettings.findUnique({
      where: { tenantId: this.tenantId },
      include: { rules: true },
    });
    if (!settings) {
      return {
        configured: false,
        confirmationEnabled: false,
        pricePolicy: "NEVER",
        rules: [
          { slot: "FIRST", leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES },
        ],
      };
    }
    return {
      configured: true,
      confirmationEnabled: settings.confirmationEnabled,
      pricePolicy: settings.pricePolicy,
      rules: sortRules(
        settings.rules.map((rule) => ({
          slot: rule.slot as ReminderSlot,
          leadMinutes: rule.leadMinutes,
        })),
      ),
    };
  }

  /**
   * Grava a configuracao inteira: a linha de `ReminderSettings` nasce (ou e
   * atualizada) e o conjunto de `ReminderRule` e substituido, na mesma
   * transacao — mesmo padrao de `PATCH /internal/availability-settings`
   * (delete + createMany). `rules` vazio e a escolha explicita de desligar,
   * nao ausencia: apos este metodo, `configured` e sempre `true`.
   */
  async set(
    input: ReminderConfigInput,
    /** Roda na mesma transação, com o estado novo — o registro de atividade (D-176). */
    within?: (
      transaction: Prisma.TransactionClient,
      next: ReminderConfig,
    ) => Promise<void>,
  ): Promise<ReminderConfig> {
    const rules = normalizeRules(input.rules);
    const pricePolicy = normalizePricePolicy(input.pricePolicy);
    const confirmationEnabled = input.confirmationEnabled ?? false;
    const next: ReminderConfig = {
      configured: true,
      confirmationEnabled,
      pricePolicy,
      rules,
    };

    await this.database.$transaction(async (transaction) => {
      await transaction.reminderSettings.upsert({
        where: { tenantId: this.tenantId },
        create: { tenantId: this.tenantId, confirmationEnabled, pricePolicy },
        update: { confirmationEnabled, pricePolicy },
      });
      await transaction.reminderRule.deleteMany({
        where: { tenantId: this.tenantId },
      });
      // No maximo duas linhas (`REMINDER_SLOTS`): `create` sequencial na
      // mesma transacao, sem precisar de `createMany`.
      for (const rule of rules) {
        await transaction.reminderRule.create({
          data: {
            tenantId: this.tenantId,
            slot: rule.slot,
            leadMinutes: rule.leadMinutes,
          },
        });
      }
      await within?.(transaction, next);
    });

    return next;
  }
}

function sortRules(rules: ReminderRuleRecord[]): ReminderRuleRecord[] {
  return [...rules].sort(
    (left, right) =>
      REMINDER_SLOTS.indexOf(left.slot) - REMINDER_SLOTS.indexOf(right.slot),
  );
}

function normalizePricePolicy(
  value: ReminderPricePolicy | undefined,
): ReminderPricePolicy {
  if (value === undefined) return "NEVER";
  if (!PRICE_POLICIES.includes(value)) {
    throw new AppError(
      "INVALID_REMINDER_PRICE_POLICY",
      "Reminder price policy is not recognised.",
      400,
    );
  }
  return value;
}

function normalizeRules(rules: ReminderRuleInput[]): ReminderRuleRecord[] {
  if (rules.length > REMINDER_SLOTS.length) {
    throw new AppError(
      "TOO_MANY_REMINDER_RULES",
      `At most ${REMINDER_SLOTS.length} reminders are allowed.`,
      400,
    );
  }
  const seenSlots = new Set<ReminderSlot>();
  for (const rule of rules) {
    if (!REMINDER_SLOTS.includes(rule.slot)) {
      throw new AppError(
        "INVALID_REMINDER_SLOT",
        "Reminder slot is not recognised.",
        400,
      );
    }
    if (seenSlots.has(rule.slot)) {
      throw new AppError(
        "DUPLICATE_REMINDER_SLOT",
        "Each reminder slot can be configured at most once.",
        400,
      );
    }
    seenSlots.add(rule.slot);
    // Antecedencia zero, negativa ou acima do teto e recusada aqui, alem da
    // constraint SQL `ReminderRule_leadMinutes_check` que a espelha.
    if (
      !Number.isInteger(rule.leadMinutes) ||
      rule.leadMinutes <= 0 ||
      rule.leadMinutes > MAX_REMINDER_LEAD_MINUTES
    ) {
      throw new AppError(
        "INVALID_REMINDER_LEAD_MINUTES",
        `Reminder lead time must be a positive integer of minutes, up to ${MAX_REMINDER_LEAD_MINUTES}.`,
        400,
      );
    }
  }
  return sortRules(
    rules.map((rule) => ({ slot: rule.slot, leadMinutes: rule.leadMinutes })),
  );
}
