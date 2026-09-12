import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  ExternalEntityType,
  ImportCategory,
  ImportItemStatus,
  ImportSessionStatus,
  IntegrationProvider,
} from "../../generated/prisma/enums.js";
import {
  addMinutes,
  localDateTimeToInstant,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError, toErrorMessage } from "../../shared/errors/app-error.js";
import { recordAppointmentEvent } from "../appointments/appointment-event-service.js";
import {
  calendarDaysBetween,
  lockCalendarDays,
  runCalendarWrite,
} from "../calendar/write-policy.js";
import { AtendlyCustomerService } from "../customers/atendly-customer-service.js";
import { migrationAvailabilityRules } from "../integrations/minha-agenda/availability.js";
import type {
  GetImportSnapshotInput,
  MinhaAgendaImportRecord,
  MinhaAgendaImportSnapshot,
} from "../integrations/minha-agenda/provider.js";
import {
  type MinhaAgendaAppointment,
  minhaAgendaAppointmentSchema,
  type MinhaAgendaCustomer,
  minhaAgendaCustomerSchema,
  type MinhaAgendaService,
  minhaAgendaServiceSchema,
  type WorkSchedule,
  workScheduleSchema,
} from "../integrations/minha-agenda/types.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";
import {
  acquireImportLease,
  importLeaseHeldError,
  ImportLeaseHolder,
  LEASABLE_IMPORT_STATUSES,
  newImportLeaseOwner,
} from "./import-lease.js";
import {
  CATEGORY_ENTITY_TYPE,
  ImportPreviewService,
  type ImportPreviewSourceReader,
} from "./import-preview-service.js";

/** O motor lê a origem pela mesma superfície mínima do preview (WU-02/WU-03). */
export type ImportExecutionSourceReader = ImportPreviewSourceReader;

export interface ImportExecutionContext {
  tenantId: string;
  sessionId: string;
  /** Ator da importação: vira `createdBy` e o ator do evento `CREATED`. */
  userId: string;
}

export interface ImportExecutionOptions {
  /**
   * Versão de preview que o negócio aprovou. É **obrigatória**: executar é
   * sempre executar um preview aprovado, e não "o que estiver valendo agora".
   * Se a origem mudou desde então, a versão vigente é outra e a execução é
   * recusada com `IMPORT_PREVIEW_STALE` (WU-03) em vez de rodar sobre uma
   * análise que ninguém viu.
   */
  previewVersion: number;
  /**
   * Teto de itens processados nesta passada. Existe porque a execução é
   * retomável por definição: parar no meio e chamar de novo continua do
   * checkpoint. É também como uma queda no meio do lote é exercitada sem
   * derrubar processo.
   */
  maxItems?: number;
  /**
   * Identidade da instância que reivindica a execução (WU-05). Omitida, uma
   * identidade nova é gerada: cada passada é de um dono, e nenhum dono é
   * reusado entre processos.
   */
  leaseOwner?: string;
  /** TTL do lease em segundos; o padrão é `IMPORT_LEASE_TTL_SECONDS`. */
  leaseTtlSeconds?: number;
  /**
   * Milissegundos entre duas renovações de lease. Só existe para o teste
   * forçar a renovação a cada item; em produção o padrão (um terço do TTL)
   * é o que evita uma ida ao banco por registro.
   */
  leaseRenewIntervalMs?: number;
}

export interface ImportExecutionCounts {
  pending: number;
  imported: number;
  skipped: number;
  failed: number;
  needsReview: number;
}

export interface ImportExecutionCategoryResult extends ImportExecutionCounts {
  category: ImportCategory;
}

export interface ImportExecutionResult {
  sessionId: string;
  previewVersion: number;
  status: "PARTIAL" | "READY";
  /** Itens que esta passada tentou importar; não conta o que já estava resolvido. */
  processed: number;
  counts: ImportExecutionCounts;
  categories: ImportExecutionCategoryResult[];
  /**
   * Dono do lease sob o qual esta passada rodou (WU-05).
   */
  leaseOwner: string;
  /**
   * Verdadeiro quando a passada parou por ter **perdido** o lease no meio do
   * lote. O resultado devolvido é então só a leitura do que está gravado: a
   * passada não escreveu status nem contagens de sessão, porque a sessão já é
   * de outro dono.
   */
  leaseLost: boolean;
}

/**
 * Ordem de dependência do lote. Serviço e cliente **antes** do agendamento
 * que os referencia: um agendamento só encontra o `ExternalEntityMap` do seu
 * serviço e do seu cliente porque as duas categorias já rodaram. Bloqueio e
 * disponibilidade não dependem de ninguém, mas vêm antes dos agendamentos
 * para que a agenda importada nasça sobre a jornada já declarada.
 */
const CATEGORY_ORDER: ImportCategory[] = [
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
];

/**
 * Sessão executável: preview pronto, ou execução anterior incompleta. É o
 * mesmo conjunto do lease (WU-05) de propósito — um estado que o lease
 * reivindica e o motor recusa, ou o contrário, seria duas verdades sobre
 * quando a importação pode rodar.
 */
const EXECUTABLE_STATUSES: ImportSessionStatus[] = LEASABLE_IMPORT_STATUSES;

/**
 * Item que uma passada anterior já resolveu — é este o checkpoint por item:
 * uma nova passada não o toca de novo. `NEEDS_REVIEW` também não é
 * reprocessado: ele espera decisão explícita, e "Importar tudo" nunca
 * resolve divergência sozinho.
 */
const RESOLVED_ITEM_STATUSES = new Set<ImportItemStatus>([
  "IMPORTED",
  "SKIPPED",
  "FAILED",
  "NEEDS_REVIEW",
]);

/** Categorias cujo registro de origem é um agendamento da agenda externa. */
const APPOINTMENT_CATEGORIES = new Set<ImportCategory>([
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
]);

/**
 * Categorias cuja importação ocupa a agenda daqui para a frente e, por isso,
 * disputa horário com o que o negócio confirma na Atendly. Histórico
 * (passado, cancelado e falta) não entra: ele não ocupa agenda, e recusá-lo
 * por horário tomado apagaria registro real do que já aconteceu.
 */
const OCCUPYING_APPOINTMENT_CATEGORIES = new Set<ImportCategory>([
  "FUTURE_APPOINTMENT",
]);

interface ImportItemRow {
  id: string;
  category: ImportCategory;
  externalId: string;
  status: ImportItemStatus;
  attemptCount: number;
}

/**
 * O que uma categoria consumiu nesta passada. `leaseLost` é o único motivo
 * de parada que não é "acabou" nem "estourou o teto": ele interrompe o lote
 * inteiro, porque a sessão já pertence a outra instância.
 */
interface ItemsConsumed {
  processed: number;
  lastExternalId: string | null;
  leaseLost: boolean;
}

/**
 * Resultado de importar um registro: criou algo, não havia o que criar, ou a
 * escrita esbarrou em uma divergência que só o negócio resolve — e nesse
 * caso nada é criado e o item espera decisão explícita.
 */
type ItemOutcome =
  | { kind: "IMPORTED"; internalId: string }
  | { kind: "SKIPPED"; reasonCode: string; reasonDetail: string }
  | { kind: "NEEDS_REVIEW"; reasonCode: string; reasonDetail: string };

interface ImportEnvironment {
  tenantId: string;
  userId: string;
  provider: IntegrationProvider;
  timeZone: string;
  /** `entityType:externalId` → id interno já criado na Atendly. */
  mapped: Map<string, string>;
  /**
   * Lease vivo da passada (WU-05). O laço de itens o consulta entre itens:
   * perdido o lease, a passada para **entre** dois itens, nunca no meio de
   * um — cada item já é uma transação própria, então parar entre eles deixa
   * o checkpoint exatamente como o commit anterior o gravou.
   */
  lease: ImportLeaseHolder;
}

/**
 * Motor de importação retomável, idempotente por origem e com falha parcial
 * (Goal010, WU-04).
 *
 * Substitui a transação monolítica de
 * `CalendarMigrationService.importToAtendly`: aqui **não existe** transação
 * cobrindo o lote. Cada item — ou grupo dependente, no caso da
 * disponibilidade — é uma transação própria que grava, no **mesmo commit**,
 * o registro criado na Atendly, a linha de `ExternalEntityMap` que o torna
 * idempotente por origem e o checkpoint do `ImportItem`. Daí decorrem as
 * três propriedades exigidas:
 *
 * - **Retomada**: queda no meio do lote deixa cada item ou resolvido ou
 *   intocado, nunca meio gravado; a passada seguinte só olha o que sobrou.
 * - **Idempotência por origem/item**: reprocessar o mesmo registro encontra
 *   `ExternalEntityMap (tenantId, provider, entityType, externalId)` e
 *   apenas reconcilia o item, sem criar um segundo registro na Atendly. É o
 *   que cobre a janela entre o commit do efeito e um checkpoint perdido.
 * - **Falha parcial**: erro ou divergência de um item marca **aquele** item
 *   e o laço continua; a sessão termina `PARTIAL` com contagens relidas do
 *   banco, nunca acumuladas em memória.
 *
 * Toda escrita de agenda (agendamento e bloqueio) passa por
 * `runCalendarWrite` com `lockCalendarDays` dos dias afetados: não há
 * caminho paralelo de escrita nem transação de agenda aberta aqui.
 *
 * Quem pode rodar é decidido pelo **lease** de `import-lease.ts` (WU-05): a
 * passada reivindica a sessão antes de ler a origem, renova o lease entre os
 * itens e o devolve no fim, no mesmo UPDATE que grava status e contagens.
 * Perder o lease no meio do lote para a passada sem escrever nada de sessão —
 * o dono novo é que manda. A conclusão única do negócio continua fora daqui
 * (WU-06): o motor devolve a sessão a `PARTIAL` ou `READY` e nunca conclui.
 */
export class ImportExecutionService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(
    context: ImportExecutionContext,
    reader: ImportExecutionSourceReader,
    snapshotInput: GetImportSnapshotInput,
    options: ImportExecutionOptions,
  ): Promise<ImportExecutionResult> {
    const session = await this.prisma.importSession.findUnique({
      where: {
        tenantId_id: { tenantId: context.tenantId, id: context.sessionId },
      },
    });
    if (!session) {
      throw new AppError(
        "IMPORT_SESSION_NOT_FOUND",
        "Import session was not found.",
        404,
      );
    }
    if (!EXECUTABLE_STATUSES.includes(session.status)) {
      throw new AppError(
        "IMPORT_SESSION_NOT_EXECUTABLE",
        `Import session cannot be executed while in status ${session.status}.`,
        409,
        { status: session.status },
      );
    }
    // Sempre, nunca opcional: a recusa de preview obsoleto não é uma opção
    // de quem chama. Sem esta checagem a execução rodaria sobre a versão
    // vigente qualquer que fosse ela, que é exatamente o que o Critério 2
    // proíbe.
    await new ImportPreviewService(this.prisma).assertPreviewVersionCurrent(
      context.tenantId,
      context.sessionId,
      options.previewVersion,
    );

    const settings = await this.prisma.calendarSettings.findUnique({
      where: { tenantId: context.tenantId },
    });
    if (!settings) {
      throw new AppError(
        "CALENDAR_SETTINGS_NOT_FOUND",
        "Calendar settings were not found for this tenant.",
        404,
      );
    }

    // Reivindicação **antes** de ler a origem: quem não tem o lote não gasta
    // a origem. Duas instâncias que lessem a origem para só então descobrir
    // que uma delas não vai executar já teriam feito trabalho duplicado —
    // aqui a perdedora desiste sem chamar a origem uma vez sequer.
    const owner = options.leaseOwner ?? newImportLeaseOwner();
    const claim = await acquireImportLease(this.prisma, {
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      owner,
      ttlSeconds: options.leaseTtlSeconds,
      statuses: EXECUTABLE_STATUSES,
      // Tomar o lease e declarar-se executando são o mesmo UPDATE: entre dois
      // UPDATEs caberia uma instância que viu a sessão livre. O início da
      // execução é o `now()` do banco da própria reivindicação — o mesmo
      // relógio do lease, e não o do processo.
      onClaim: (now) => ({
        status: "EXECUTING",
        startedAt: session.startedAt ?? now,
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
      }),
    });
    if (!claim.acquired) throw importLeaseHeldError(claim);
    const lease = new ImportLeaseHolder(
      this.prisma,
      claim.lease,
      options.leaseTtlSeconds ?? env.IMPORT_LEASE_TTL_SECONDS,
      options.leaseRenewIntervalMs,
    );

    try {
      return await this.run(
        context,
        reader,
        snapshotInput,
        options,
        session,
        settings.timezone,
        lease,
      );
    } catch (error) {
      // Falha que não é de item: a sessão fica em `EXECUTING`, mas sem lease,
      // então a próxima passada a reivindica na hora em vez de esperar o TTL.
      await lease.release();
      throw error;
    }
  }

  /**
   * O lote propriamente dito, já sob lease. Separado de `execute` para que a
   * liberação do lease cubra **tudo** o que acontece depois da reivindicação.
   */
  private async run(
    context: ImportExecutionContext,
    reader: ImportExecutionSourceReader,
    snapshotInput: GetImportSnapshotInput,
    options: ImportExecutionOptions,
    session: { provider: IntegrationProvider; previewVersion: number },
    timeZone: string,
    lease: ImportLeaseHolder,
  ): Promise<ImportExecutionResult> {
    const snapshot = await reader.getImportSnapshot(snapshotInput);
    const records = indexRecords(snapshot);

    const [items, categories, maps] = await Promise.all([
      this.prisma.importItem.findMany({
        where: { tenantId: context.tenantId, sessionId: context.sessionId },
        orderBy: { externalId: "asc" },
      }),
      this.prisma.importSessionCategory.findMany({
        where: { tenantId: context.tenantId, sessionId: context.sessionId },
      }),
      this.prisma.externalEntityMap.findMany({
        where: { tenantId: context.tenantId, provider: session.provider },
      }),
    ]);
    // Índice de idempotência por origem/item: nasce do que já está no banco e
    // cresce dentro desta passada, de modo que o agendamento encontre o
    // cliente e o serviço que as categorias anteriores acabaram de criar.
    const mapped = new Map(
      maps.map((entry) => [
        `${entry.entityType}:${entry.externalId}`,
        entry.internalId,
      ]),
    );
    const deselected = new Set(
      categories
        .filter((category) => !category.selected)
        .map((category) => category.category),
    );

    const environment: ImportEnvironment = {
      tenantId: context.tenantId,
      userId: context.userId,
      provider: session.provider,
      timeZone,
      mapped,
      lease,
    };

    let processed = 0;
    let leaseLost = false;
    const budget = options.maxItems ?? Number.POSITIVE_INFINITY;
    for (const category of CATEGORY_ORDER) {
      // Fronteira de categoria: o lease é renovado antes de começar a
      // próxima, e uma perda para o lote aqui, com a categoria anterior já
      // checkpointada.
      if (!(await lease.heartbeat())) {
        leaseLost = true;
        break;
      }
      const pending = items.filter(
        (item) =>
          item.category === category &&
          !RESOLVED_ITEM_STATUSES.has(item.status),
      );
      if (pending.length === 0) continue;

      if (deselected.has(category)) {
        // Categoria desmarcada em "Escolher o que importar": os itens são
        // ignorados com motivo — nunca somem em silêncio.
        for (const item of pending) {
          await this.markSkipped(
            environment,
            item,
            "CATEGORY_NOT_SELECTED",
            "Categoria não selecionada para esta importação.",
          );
        }
        await this.checkpointCategory(context, category, null);
        continue;
      }

      const consumed =
        category === "AVAILABILITY"
          ? await this.runAvailabilityGroup(environment, pending, records)
          : await this.runItems(
              environment,
              category,
              pending,
              records,
              budget - processed,
            );
      processed += consumed.processed;
      // O checkpoint da categoria é gravado mesmo quando o lease se perdeu no
      // meio dela: ele só reconta o que os commits de item já gravaram, e
      // deixar de gravá-lo faria a passada seguinte reler itens resolvidos.
      await this.checkpointCategory(context, category, consumed.lastExternalId);
      if (consumed.leaseLost) {
        leaseLost = true;
        break;
      }
      if (processed >= budget) break;
    }

    return this.finish(
      context,
      session.previewVersion,
      processed,
      lease,
      leaseLost,
    );
  }

  /**
   * Um item por vez, cada um em transação própria. Erro de um item nunca
   * interrompe o laço: ele vira `FAILED` com motivo sanitizado e o próximo
   * item roda — poucas divergências não bloqueiam milhares de registros
   * válidos.
   */
  private async runItems(
    environment: ImportEnvironment,
    category: ImportCategory,
    pending: ImportItemRow[],
    records: Map<string, MinhaAgendaImportRecord>,
    budget: number,
  ): Promise<ItemsConsumed> {
    const entityType = CATEGORY_ENTITY_TYPE[category];
    let processed = 0;
    let lastExternalId: string | null = null;

    for (const item of pending) {
      if (processed >= budget) break;
      // Entre dois itens, e nunca dentro de um: o item corrente já é uma
      // transação própria, então parar aqui deixa o checkpoint exatamente
      // como o commit anterior o gravou — nada meio escrito, nada reprocessado.
      if (!(await environment.lease.heartbeat())) {
        return { processed, lastExternalId, leaseLost: true };
      }
      const record = records.get(`${category}:${item.externalId}`);
      if (!record) {
        // Item que a origem não mostra mais nesta leitura: ignorado com
        // motivo, nunca importado a partir do que o preview lembrava.
        await this.markSkipped(
          environment,
          item,
          "SOURCE_RECORD_GONE",
          "O registro não está mais disponível na origem.",
        );
        lastExternalId = item.externalId;
        continue;
      }
      processed += 1;
      lastExternalId = item.externalId;

      const already = environment.mapped.get(
        `${entityType}:${item.externalId}`,
      );
      if (already) {
        // Idempotência por origem/item: este registro da origem já virou um
        // registro da Atendly. O item é reconciliado e **nada** é criado.
        await this.markAlreadyImported(environment, item, entityType, already);
        continue;
      }

      try {
        const outcome = await this.importRecord(
          environment,
          category,
          item,
          record,
        );
        if (outcome.kind === "SKIPPED") {
          await this.markSkipped(
            environment,
            item,
            outcome.reasonCode,
            outcome.reasonDetail,
          );
        } else if (outcome.kind === "NEEDS_REVIEW") {
          await this.markNeedsReview(
            environment,
            item,
            outcome.reasonCode,
            outcome.reasonDetail,
          );
        } else {
          environment.mapped.set(
            `${entityType}:${item.externalId}`,
            outcome.internalId,
          );
        }
      } catch (error) {
        await this.markFailed(environment, item, error);
      }
    }

    return { processed, lastExternalId, leaseLost: false };
  }

  /**
   * Disponibilidade é o **grupo dependente** da origem: a jornada da empresa
   * e a do profissional só produzem regras juntas — as duas linhas descrevem
   * uma única agenda semanal, e importar uma sem a outra geraria horário que
   * a origem nunca declarou. O grupo inteiro entra em uma transação, e cada
   * item do grupo é mapeado para a mesma âncora (a primeira regra criada),
   * de modo que reprocessar reconhece o grupo como já importado e não cria
   * uma segunda jornada.
   */
  private async runAvailabilityGroup(
    environment: ImportEnvironment,
    pending: ImportItemRow[],
    records: Map<string, MinhaAgendaImportRecord>,
  ): Promise<ItemsConsumed> {
    const present: ImportItemRow[] = [];
    for (const item of pending) {
      if (records.has(`AVAILABILITY:${item.externalId}`)) {
        present.push(item);
        continue;
      }
      await this.markSkipped(
        environment,
        item,
        "SOURCE_RECORD_GONE",
        "O registro não está mais disponível na origem.",
      );
    }
    if (present.length === 0) {
      return { processed: 0, lastExternalId: null, leaseLost: false };
    }

    const lastExternalId = present[present.length - 1].externalId;
    const anchor = present
      .map((item) => environment.mapped.get(`AVAILABILITY:${item.externalId}`))
      .find((internalId): internalId is string => Boolean(internalId));
    if (anchor) {
      for (const item of present) {
        await this.markAlreadyImported(
          environment,
          item,
          "AVAILABILITY",
          anchor,
        );
      }
      return { processed: present.length, lastExternalId, leaseLost: false };
    }

    try {
      const schedules = readSchedules(present, records);
      const rules = migrationAvailabilityRules(
        schedules.company,
        schedules.employee,
      );
      if (rules.length === 0) {
        for (const item of present) {
          await this.markSkipped(
            environment,
            item,
            "AVAILABILITY_EMPTY_IN_SOURCE",
            "A origem não declara nenhum horário de atendimento.",
          );
        }
        return { processed: present.length, lastExternalId, leaseLost: false };
      }

      await this.prisma.$transaction(async (transaction) => {
        const created: string[] = [];
        for (const rule of rules) {
          const row = await transaction.availabilityRule.create({
            data: {
              tenantId: environment.tenantId,
              dayOfWeek: rule.dayOfWeek,
              startTime: databaseTime(rule.startTime),
              endTime: databaseTime(rule.endTime),
              active: true,
            },
          });
          created.push(row.id);
        }
        for (const item of present) {
          await this.commitItem(
            transaction,
            environment,
            item,
            "AVAILABILITY",
            created[0],
          );
        }
      });
      // Âncora comum do grupo, relida de `ExternalEntityMap`: o índice em
      // memória passa a enxergar o que o commit gravou.
      for (const item of present) {
        const internalId = await this.readMappedId(
          environment,
          "AVAILABILITY",
          item.externalId,
        );
        if (internalId) {
          environment.mapped.set(`AVAILABILITY:${item.externalId}`, internalId);
        }
      }
    } catch (error) {
      for (const item of present) {
        await this.markFailed(environment, item, error);
      }
    }

    return { processed: present.length, lastExternalId, leaseLost: false };
  }

  /** Roteia o registro para a escrita da sua categoria. */
  private async importRecord(
    environment: ImportEnvironment,
    category: ImportCategory,
    item: ImportItemRow,
    record: MinhaAgendaImportRecord,
  ): Promise<ItemOutcome> {
    if (category === "SERVICE") {
      return this.importService(environment, item, record);
    }
    if (category === "CUSTOMER") {
      return this.importCustomer(environment, item, record);
    }
    if (category === "TIME_BLOCK") {
      return this.importTimeBlock(environment, item, record);
    }
    if (APPOINTMENT_CATEGORIES.has(category)) {
      return this.importAppointment(environment, category, item, record);
    }
    throw new AppError(
      "IMPORT_CATEGORY_NOT_SUPPORTED",
      `Import category ${category} has no execution path.`,
      500,
    );
  }

  private async importService(
    environment: ImportEnvironment,
    item: ImportItemRow,
    record: MinhaAgendaImportRecord,
  ): Promise<ItemOutcome> {
    const source = parseRecord<MinhaAgendaService>(
      minhaAgendaServiceSchema,
      record,
      "SERVICE",
    );
    const price = knownNumber(source.price);
    const durationMinutes = knownPositiveDuration(source.duration);

    const internalId = await this.prisma.$transaction(async (transaction) => {
      const created = await new AtendlyServiceService(
        transaction,
        environment.tenantId,
      ).create({
        name: source.name,
        durationMinutes,
        priceType: price === null ? "NOT_INFORMED" : "FIXED",
        price,
        active: !source.deleted,
        // Duração ausente na origem vira pendência de revisão com origem
        // "importação" — nunca duração ou preço fabricados (DATA-09/DATA-12).
        reviewOrigin: durationMinutes === null ? "IMPORT" : undefined,
      });
      await this.commitItem(
        transaction,
        environment,
        item,
        "SERVICE",
        created.id,
      );
      return created.id;
    });
    return { kind: "IMPORTED", internalId };
  }

  private async importCustomer(
    environment: ImportEnvironment,
    item: ImportItemRow,
    record: MinhaAgendaImportRecord,
  ): Promise<ItemOutcome> {
    const source = parseRecord<MinhaAgendaCustomer>(
      minhaAgendaCustomerSchema,
      record,
      "CUSTOMER",
    );
    // Uma pessoa por cliente da origem, mapeada pelo id externo — nunca pelo
    // telefone. Dois clientes externos com o mesmo número continuam sendo
    // duas pessoas, e nenhum cadastro existente é renomeado ou fundido.
    const internalId = await this.prisma.$transaction(async (transaction) => {
      const created = await new AtendlyCustomerService(
        transaction,
        environment.tenantId,
      ).create({
        name: source.name,
        phone: source.phone1 ?? source.phone2 ?? null,
      });
      await this.commitItem(
        transaction,
        environment,
        item,
        "CUSTOMER",
        created.id,
      );
      return created.id;
    });
    return { kind: "IMPORTED", internalId };
  }

  private async importTimeBlock(
    environment: ImportEnvironment,
    item: ImportItemRow,
    record: MinhaAgendaImportRecord,
  ): Promise<ItemOutcome> {
    const source = parseRecord<MinhaAgendaAppointment>(
      minhaAgendaAppointmentSchema,
      record,
      "TIME_BLOCK",
    );
    const interval = resolveInterval(source, environment.timeZone);

    const internalId = await runCalendarWrite(
      this.prisma,
      async (transaction) => {
        await lockCalendarDays(
          transaction,
          environment.tenantId,
          calendarDaysBetween(
            interval.startAt,
            interval.endAt,
            environment.timeZone,
          ),
        );
        const created = await transaction.timeBlock.create({
          data: {
            tenantId: environment.tenantId,
            startAt: interval.startAt,
            endAt: interval.endAt,
            reason: source.comments ?? null,
            kind: "BLOCK",
          },
        });
        await this.commitItem(
          transaction,
          environment,
          item,
          "TIME_BLOCK",
          created.id,
        );
        return created.id;
      },
    );
    return { kind: "IMPORTED", internalId };
  }

  /**
   * Agendamento importado é atendimento normal da Atendly: mesma tabela,
   * snapshots do Goal007 nos itens do acordo e evento `CREATED` gravado na
   * mesma transação, sob `runCalendarWrite` com os dias travados em ordem
   * estável.
   *
   * A disponibilidade **não** é revalidada: o que a origem tem é o que o
   * negócio tem, e recusar um horário importado por regra de oferta atual
   * apagaria história real. A política única dá a serialização e o lock de
   * dia; o que produz **um só efeito** no horário disputado é a leitura de
   * ocupação feita já dentro do lock (`findSlotHolder`): se uma confirmação
   * concorrente chegou primeiro, a importação não escreve por cima dela — o
   * item fica em revisão, com a decisão devolvida ao negócio.
   */
  private async importAppointment(
    environment: ImportEnvironment,
    category: ImportCategory,
    item: ImportItemRow,
    record: MinhaAgendaImportRecord,
  ): Promise<ItemOutcome> {
    const source = parseRecord<MinhaAgendaAppointment>(
      minhaAgendaAppointmentSchema,
      record,
      category,
    );
    const interval = resolveInterval(source, environment.timeZone);

    const customerExternalId = source.customer
      ? String(source.customer.id)
      : source.customerId !== null
        ? String(source.customerId)
        : null;
    if (!customerExternalId) {
      return {
        kind: "SKIPPED",
        reasonCode: "APPOINTMENT_WITHOUT_CUSTOMER",
        reasonDetail:
          "O agendamento da origem não tem cliente vinculado; nada é inventado no lugar dele.",
      };
    }
    // Dependência explícita: o cliente precisa ter sido importado antes.
    const customerId = environment.mapped.get(`CUSTOMER:${customerExternalId}`);
    if (!customerId) {
      throw new AppError(
        "IMPORT_CUSTOMER_MAPPING_MISSING",
        "The customer of this appointment was not imported.",
        409,
        { externalId: customerExternalId },
      );
    }

    const services = appointmentServices(source).map((service) => {
      const serviceId = environment.mapped.get(`SERVICE:${service.externalId}`);
      if (!serviceId) {
        throw new AppError(
          "IMPORT_SERVICE_MAPPING_MISSING",
          "A service of this appointment was not imported.",
          409,
          { externalId: service.externalId },
        );
      }
      return { ...service, serviceId };
    });

    const status = appointmentStatus(category);
    // Vocabulário da origem preservado uma única vez, na criação, como o
    // Goal008 faz com toda linha nova.
    const statusRaw = source.deleted ? "CANCELLED" : "SCHEDULED";
    const startTime = localTime(source.startTime);

    return runCalendarWrite<ItemOutcome>(this.prisma, async (transaction) => {
      await lockCalendarDays(
        transaction,
        environment.tenantId,
        calendarDaysBetween(
          interval.startAt,
          interval.endAt,
          environment.timeZone,
        ),
      );
      // Já sob o lock do dia: quem chegou antes no horário decide o que
      // acontece aqui. Se o horário está tomado por um atendimento que não
      // é desta importação, escrever produziria um segundo efeito no mesmo
      // instante e apagaria, na prática, o que o negócio acabou de
      // confirmar. O item vai para revisão em vez de sobrepor.
      if (OCCUPYING_APPOINTMENT_CATEGORIES.has(category)) {
        const holder = await this.findSlotHolder(
          transaction,
          environment,
          interval,
        );
        if (holder) {
          return {
            kind: "NEEDS_REVIEW",
            reasonCode: "APPOINTMENT_SLOT_TAKEN",
            reasonDetail:
              "O horário deste agendamento já está ocupado por um atendimento da Agenda Atendly; nada foi sobreposto e a decisão é do negócio.",
          };
        }
      }
      const created = await transaction.appointment.create({
        data: {
          source: "INTEGRATION",
          startAt: interval.startAt,
          endAt: interval.endAt,
          status,
          statusRaw,
          // Atendimento sem serviço conhecido na origem precisa de título
          // (`Appointment_title_required_without_items`); com serviço, o
          // acordo é quem descreve o atendimento.
          title: services.length === 0 ? appointmentTitle(source) : null,
          createdBy: environment.userId,
          comments: source.comments ?? null,
          customer: {
            connect: {
              tenantId_id: { tenantId: environment.tenantId, id: customerId },
            },
          },
          items: {
            create: services.map((service) => ({
              serviceNameSnapshot: service.name,
              durationMinutesSnapshot: service.durationMinutes,
              priceTypeSnapshot: service.priceType,
              priceSnapshot: service.price,
              service: {
                connect: {
                  tenantId_id: {
                    tenantId: environment.tenantId,
                    id: service.serviceId,
                  },
                },
              },
            })),
          },
        },
      });
      await recordAppointmentEvent(
        transaction,
        environment.tenantId,
        created.id,
        {
          type: "CREATED",
          source: "INTEGRATION",
          actor: environment.userId,
          after: {
            date: source.date,
            startTime,
            status,
            externalId: item.externalId,
          },
        },
      );
      await this.commitItem(
        transaction,
        environment,
        item,
        "APPOINTMENT",
        created.id,
      );
      return { kind: "IMPORTED", internalId: created.id };
    });
  }

  /**
   * Atendimento vigente que já ocupa o intervalo, ignorando o que a própria
   * importação criou: duas linhas vindas da mesma origem não disputam entre
   * si — `ExternalEntityMap` já as reconcilia, e recusá-las aqui esconderia
   * agenda que a origem realmente tem. Cancelado não ocupa, na mesma leitura
   * que a oferta de horários usa.
   */
  private async findSlotHolder(
    transaction: Prisma.TransactionClient,
    environment: ImportEnvironment,
    interval: { startAt: Date; endAt: Date },
  ): Promise<string | null> {
    const overlapping = await transaction.appointment.findMany({
      where: {
        tenantId: environment.tenantId,
        status: { not: "CANCELLED" },
        startAt: { lt: interval.endAt },
        endAt: { gt: interval.startAt },
      },
      select: { id: true },
    });
    if (overlapping.length === 0) return null;

    const fromSource = await transaction.externalEntityMap.findMany({
      where: {
        tenantId: environment.tenantId,
        provider: environment.provider,
        entityType: "APPOINTMENT",
        internalId: { in: overlapping.map((row) => row.id) },
      },
      select: { internalId: true },
    });
    const imported = new Set(fromSource.map((row) => row.internalId));
    return overlapping.find((row) => !imported.has(row.id))?.id ?? null;
  }

  /**
   * O commit de um item: efeito, mapa de origem e checkpoint no **mesmo**
   * commit. É o casamento entre checkpoint por item e idempotência por
   * `ExternalEntityMap` — separá-los abriria exatamente a janela em que uma
   * queda duplicaria o registro na Atendly.
   */
  private async commitItem(
    transaction: Prisma.TransactionClient,
    environment: ImportEnvironment,
    item: ImportItemRow,
    entityType: ExternalEntityType,
    internalId: string,
  ): Promise<void> {
    await transaction.externalEntityMap.create({
      data: {
        tenantId: environment.tenantId,
        provider: environment.provider,
        entityType,
        internalId,
        externalId: item.externalId,
      },
    });
    const now = new Date();
    await transaction.importItem.update({
      where: { tenantId_id: { tenantId: environment.tenantId, id: item.id } },
      data: {
        status: "IMPORTED",
        entityType,
        internalId,
        reasonCode: null,
        reasonDetail: null,
        attemptCount: item.attemptCount + 1,
        lastAttemptAt: now,
        processedAt: now,
      },
    });
  }

  /** Reconciliação sem escrita operacional: o registro já existe na Atendly. */
  private async markAlreadyImported(
    environment: ImportEnvironment,
    item: ImportItemRow,
    entityType: ExternalEntityType,
    internalId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.importItem.update({
      where: { tenantId_id: { tenantId: environment.tenantId, id: item.id } },
      data: {
        status: "IMPORTED",
        entityType,
        internalId,
        reasonCode: "ALREADY_IMPORTED_FROM_SOURCE",
        reasonDetail:
          "Este registro da origem já havia sido importado; nada foi criado de novo.",
        attemptCount: item.attemptCount + 1,
        lastAttemptAt: now,
        processedAt: now,
      },
    });
    environment.mapped.set(`${entityType}:${item.externalId}`, internalId);
  }

  private async markSkipped(
    environment: ImportEnvironment,
    item: ImportItemRow,
    reasonCode: string,
    reasonDetail: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.importItem.update({
      where: { tenantId_id: { tenantId: environment.tenantId, id: item.id } },
      data: {
        status: "SKIPPED",
        reasonCode,
        reasonDetail,
        lastAttemptAt: now,
        processedAt: now,
      },
    });
  }

  /**
   * Divergência encontrada na hora de escrever: nada foi criado e o item
   * espera decisão explícita. Não é falha técnica (não há o que retentar) nem
   * item ignorado (o negócio ainda pode querer esse registro), e por isso
   * `NEEDS_REVIEW` também não é reprocessado por uma nova passada.
   */
  private async markNeedsReview(
    environment: ImportEnvironment,
    item: ImportItemRow,
    reasonCode: string,
    reasonDetail: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.importItem.update({
      where: { tenantId_id: { tenantId: environment.tenantId, id: item.id } },
      data: {
        status: "NEEDS_REVIEW",
        reasonCode,
        reasonDetail,
        attemptCount: item.attemptCount + 1,
        lastAttemptAt: now,
        processedAt: now,
      },
    });
  }

  private async markFailed(
    environment: ImportEnvironment,
    item: ImportItemRow,
    error: unknown,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.importItem.update({
      where: { tenantId_id: { tenantId: environment.tenantId, id: item.id } },
      data: {
        status: "FAILED",
        // Motivo sanitizado: código estável e mensagem legível, nunca o
        // payload cru da origem nem segredo.
        reasonCode:
          error instanceof AppError ? error.code : "IMPORT_ITEM_FAILED",
        reasonDetail: toErrorMessage(error),
        attemptCount: item.attemptCount + 1,
        lastAttemptAt: now,
        processedAt: now,
      },
    });
  }

  private async readMappedId(
    environment: ImportEnvironment,
    entityType: ExternalEntityType,
    externalId: string,
  ): Promise<string | null> {
    const entry = await this.prisma.externalEntityMap.findFirst({
      where: {
        tenantId: environment.tenantId,
        provider: environment.provider,
        entityType,
        externalId,
      },
    });
    return entry?.internalId ?? null;
  }

  /**
   * Checkpoint da categoria: contagens relidas do banco e o cursor do último
   * item tocado. Nunca guarda payload cru da origem.
   */
  private async checkpointCategory(
    context: ImportExecutionContext,
    category: ImportCategory,
    lastExternalId: string | null,
  ): Promise<void> {
    const rows = await this.prisma.importItem.findMany({
      where: {
        tenantId: context.tenantId,
        sessionId: context.sessionId,
        category,
      },
    });
    const counts = tally(rows);
    await this.prisma.importSessionCategory.updateMany({
      where: {
        tenantId: context.tenantId,
        sessionId: context.sessionId,
        category,
      },
      data: {
        pendingCount: counts.pending,
        importedCount: counts.imported,
        skippedCount: counts.skipped,
        failedCount: counts.failed,
        needsReviewCount: counts.needsReview,
        ...(lastExternalId ? { cursor: { lastExternalId } } : {}),
        checkpointAt: new Date(),
      },
    });
  }

  /**
   * Fecha a passada com contagens **lidas do banco**, não acumuladas em
   * memória: é o que faz importados, ignorados, em revisão e falhos baterem
   * com o que está gravado, inclusive depois de uma retomada.
   *
   * O fechamento e a devolução do lease são o **mesmo UPDATE**, condicionado
   * a `leaseOwner` ainda ser meu. Perdido o lease, `count = 0` e nada é
   * escrito: quem perdeu não sobrescreve o status, as contagens nem o
   * `finishedAt` da instância que assumiu o lote. O resultado devolvido passa
   * a ser apenas a leitura do que está gravado.
   */
  private async finish(
    context: ImportExecutionContext,
    previewVersion: number,
    processed: number,
    lease: ImportLeaseHolder,
    leaseLost: boolean,
  ): Promise<ImportExecutionResult> {
    const rows = await this.prisma.importItem.findMany({
      where: { tenantId: context.tenantId, sessionId: context.sessionId },
    });
    const counts = tally(rows);
    const categories: ImportExecutionCategoryResult[] = [];
    for (const category of CATEGORY_ORDER) {
      const categoryRows = rows.filter((row) => row.category === category);
      if (categoryRows.length === 0) continue;
      categories.push({ category, ...tally(categoryRows) });
    }
    // Restou item não importado: a sessão fica **parcial**, e é dela que a
    // reanálise e a retomada partem. Sem resto, ela volta a `READY` e espera
    // a conclusão do negócio, que é decisão do usuário (WU-06) — o motor
    // nunca conclui importação.
    const status =
      counts.pending + counts.failed + counts.needsReview > 0
        ? "PARTIAL"
        : "READY";
    const closed = await lease.release({
      status,
      pendingCount: counts.pending,
      importedCount: counts.imported,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
      needsReviewCount: counts.needsReview,
      finishedAt: new Date(),
    });

    return {
      sessionId: context.sessionId,
      previewVersion,
      status,
      processed,
      counts,
      categories,
      leaseOwner: lease.owner,
      leaseLost: leaseLost || !closed,
    };
  }
}

function indexRecords(
  snapshot: MinhaAgendaImportSnapshot,
): Map<string, MinhaAgendaImportRecord> {
  const index = new Map<string, MinhaAgendaImportRecord>();
  const categories = [
    snapshot.services,
    snapshot.customers,
    snapshot.availability,
    snapshot.timeBlocks,
    snapshot.futureAppointments,
    snapshot.pastAppointments,
    snapshot.cancelledAppointments,
    snapshot.noShowAppointments,
  ];
  for (const category of categories) {
    for (const record of category.records) {
      index.set(`${category.category}:${record.externalId}`, record);
    }
  }
  return index;
}

function tally(
  rows: Array<{ status: ImportItemStatus }>,
): ImportExecutionCounts {
  const counts: ImportExecutionCounts = {
    pending: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
  };
  for (const row of rows) {
    if (row.status === "PENDING") counts.pending += 1;
    else if (row.status === "IMPORTED") counts.imported += 1;
    else if (row.status === "SKIPPED") counts.skipped += 1;
    else if (row.status === "FAILED") counts.failed += 1;
    else if (row.status === "NEEDS_REVIEW") counts.needsReview += 1;
  }
  return counts;
}

/**
 * O bruto da origem é `unknown` até aqui: um registro fora do contrato falha
 * **aquele** item, identificado pela categoria, e não vira registro na
 * Atendly.
 */
function parseRecord<TValue>(
  schema: {
    safeParse: (value: unknown) => { success: boolean; data?: unknown };
  },
  record: MinhaAgendaImportRecord,
  category: string,
): TValue {
  const parsed = schema.safeParse(record.raw);
  if (!parsed.success) {
    throw new AppError(
      "IMPORT_SOURCE_RECORD_INVALID",
      `The source record does not match the expected contract for ${category}.`,
      422,
      { externalId: record.externalId },
    );
  }
  return parsed.data as TValue;
}

function readSchedules(
  items: ImportItemRow[],
  records: Map<string, MinhaAgendaImportRecord>,
): { company: WorkSchedule; employee: WorkSchedule | null } {
  let company: WorkSchedule | null = null;
  let employee: WorkSchedule | null = null;
  for (const item of items) {
    const record = records.get(`AVAILABILITY:${item.externalId}`);
    if (!record) continue;
    const schedule = parseRecord<WorkSchedule>(
      workScheduleSchema,
      record,
      "AVAILABILITY",
    );
    if (item.externalId === "company") company = schedule;
    else employee = schedule;
  }
  if (!company) {
    throw new AppError(
      "IMPORT_AVAILABILITY_COMPANY_MISSING",
      "The company work schedule is required to import availability.",
      409,
    );
  }
  return { company, employee };
}

interface SourceAppointmentService {
  externalId: string;
  name: string;
  durationMinutes: number | null;
  priceType: "FIXED" | "NOT_INFORMED";
  price: number | null;
}

/**
 * Serviços do acordo, na mesma ordem de precedência do leitor da origem
 * (`services`, depois `appHasServices`, depois o serviço único). Preço é
 * preservado quando existe e nunca fabricado quando não existe; duração de
 * item nunca recebe a duração total do atendimento (DATA-09).
 */
function appointmentServices(
  appointment: MinhaAgendaAppointment,
): SourceAppointmentService[] {
  if (appointment.services?.length) {
    return appointment.services.map((service) => {
      const price = knownNumber(service.price);
      return {
        externalId: String(service.id),
        name: service.name,
        durationMinutes: knownPositiveDuration(service.duration),
        priceType:
          price === null ? ("NOT_INFORMED" as const) : ("FIXED" as const),
        price,
      };
    });
  }
  if (appointment.appHasServices?.length) {
    return appointment.appHasServices.map((entry) => {
      const price = knownNumber(entry.price ?? entry.service?.price);
      return {
        externalId: String(entry.serviceId),
        name: entry.service?.name ?? `Serviço ${entry.serviceId}`,
        durationMinutes: knownPositiveDuration(entry.service?.duration),
        priceType:
          price === null ? ("NOT_INFORMED" as const) : ("FIXED" as const),
        price,
      };
    });
  }
  if (appointment.serviceId) {
    const price = knownNumber(appointment.service?.price ?? appointment.price);
    return [
      {
        externalId: String(appointment.serviceId),
        name:
          appointment.serviceName ??
          appointment.service?.name ??
          `Serviço ${appointment.serviceId}`,
        durationMinutes: knownPositiveDuration(appointment.service?.duration),
        priceType:
          price === null ? ("NOT_INFORMED" as const) : ("FIXED" as const),
        price,
      },
    ];
  }
  return [];
}

/**
 * Estado do produto por categoria. Histórico **não** ganha conclusão pela
 * data: um atendimento passado entra `CONFIRMED` com `completedAt` nulo, e
 * quem conclui é a regra de conclusão do Goal008 — nunca a importação.
 * Falta também não recebe `noShowAt`: a origem não registra quando a
 * ausência foi marcada, e inventar o instante seria inventar o dado.
 */
function appointmentStatus(category: ImportCategory): string {
  if (category === "CANCELLED_APPOINTMENT") return "CANCELLED";
  if (category === "NO_SHOW_APPOINTMENT") return "NO_SHOW";
  return "CONFIRMED";
}

function appointmentTitle(appointment: MinhaAgendaAppointment): string {
  const comments = appointment.comments?.trim();
  return comments && comments.length > 0 ? comments : "Compromisso importado";
}

function resolveInterval(
  appointment: MinhaAgendaAppointment,
  timeZone: string,
): { startAt: Date; endAt: Date } {
  const startAt = localDateTimeToInstant(
    appointment.date,
    localTime(appointment.startTime),
    timeZone,
  );
  const duration = knownPositiveDuration(appointment.duration);
  if (duration !== null) {
    return { startAt, endAt: addMinutes(startAt, duration) };
  }
  const endAt = localDateTimeToInstant(
    appointment.date,
    localTime(appointment.endTime),
    timeZone,
  );
  if (endAt.getTime() <= startAt.getTime()) {
    throw new AppError(
      "IMPORT_APPOINTMENT_INTERVAL_INVALID",
      "The source record has neither a positive duration nor an end after its start.",
      422,
      { externalId: String(appointment.id) },
    );
  }
  return { startAt, endAt };
}

/** `HH:MM`, o formato que a agenda entende; a origem às vezes manda segundos. */
function localTime(value: string): string {
  return value.slice(0, 5);
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function knownNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function knownPositiveDuration(value: unknown): number | null {
  const known = knownNumber(value);
  return known !== null && known > 0 ? known : null;
}
