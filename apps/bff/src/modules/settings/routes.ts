import {
  aiMessageDeliverySchema,
  aiSandboxSettingsInputSchema,
  reminderMessageExampleInputSchema,
} from "@avenly-ia/public-api-contract";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { Prisma } from "../../generated/prisma/client.js";
import {
  type ActivationTestRun,
  getValidActivationRun,
} from "../../lib/ai-activation.js";
import {
  aiConversationStyleSchema,
  normalizeStoredAiConversationStyle,
  parseBodyWithAiConversationStyle,
  resolveAiConversationStyle,
} from "../../lib/ai-conversation-style.js";
import { currentUser, requireAuth } from "../../lib/auth.js";
import {
  businessAddressPartsDto,
  businessAddressPartsSchema,
  businessAddressSchema,
  businessContextPayload,
  businessContextProjectionState,
  businessModalitySchema,
  resolveBusinessProfileFields,
} from "../../lib/business-profile.js";
import { CALENDAR_SOURCE } from "../../lib/calendar-source.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import {
  normalizeBrazilianWhatsappPhone,
  phonesMatch,
} from "../../lib/phone.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { reconcileBusinessTimezone } from "../../lib/timezone-reconciliation.js";
import { assertAiActivationNotBlockedByDeletion } from "../account/service.js";
import {
  activityCreate,
  diffFields,
  recordActivity,
  userActor,
} from "../activity/activity-log.js";
import { aiActivatedDedupeKey } from "../notifications/species.js";
import { materialize } from "../notifications/store.js";
import { internalContext } from "../tenant/context.js";

const businessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
  // Ausente preserva o que esta gravado; nunca grava conjunto vazio so por
  // omissao (Goal018/WU-01).
  modalities: z.array(businessModalitySchema).optional(),
  address: businessAddressSchema.optional(),
  addressParts: businessAddressPartsSchema.optional(),
});
const aiSchema = z.object({
  enabled: z.boolean(),
  // Os tres estilos do produto e os dois valores antigos como alias
  // declarado (Goal011); a resposta sempre devolve o vocabulario novo.
  tone: aiConversationStyleSchema,
  // Como as mensagens saem (D-208). Ausente preserva o gravado.
  messageDelivery: aiMessageDeliverySchema.optional(),
});
// --- Lembretes e confirmacao de presenca (Goal021, WU-009, G-27) -----------
// So humano: a IA nunca configura lembrete, no mesmo padrao de disponibilidade
// e oferta acima. Mesmos tetos do Scheduling (`ReminderRule_leadMinutes_check`
// e `ReminderService`): ate dois lembretes, trinta dias de antecedencia no
// maximo.
const reminderSlotSchema = z.enum(["FIRST", "SECOND"]);
const reminderPricePolicySchema = z.enum(["NEVER", "WHEN_FIXED"]);
const reminderRuleSchema = z.object({
  slot: reminderSlotSchema,
  leadMinutes: z.number().int().positive().max(43_200),
});
const reminderSettingsSchema = z.object({
  confirmationEnabled: z.boolean().optional(),
  pricePolicy: reminderPricePolicySchema.optional(),
  // Mensagem de exemplo (D-197): ausente mantem a gravada, `null` ou vazio
  // volta ao padrao. A regra do texto (teto, so os campos conhecidos, nenhuma
  // data, horario ou valor escrito a mao) e a do contrato, a mesma da tela.
  messageExample: reminderMessageExampleInputSchema.optional(),
  // Vazio e escolha legitima: desligar os lembretes de proposito.
  rules: z.array(reminderRuleSchema).max(2),
});
const availabilitySchema = z.object({
  // Ausente resolve para o fuso do negocio (Goal029/WU-03).
  timezone: z.string().trim().min(1).max(100).optional(),
  rules: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      active: z.boolean().default(true),
    }),
  ),
  // Regras de oferta do negocio (Goal009), aditivas ao corpo existente:
  // ausentes preservam o valor ja gravado no Scheduling.
  minLeadMinutes: z.number().int().min(0).max(43_200).optional(),
  maxLeadDays: z.number().int().min(1).max(365).optional(),
  granularityMinutes: z.number().int().min(5).max(120).optional(),
  // Antecedencia minima do cliente (via IA) para cancelar/remarcar o proprio
  // atendimento (Goal073). Ausente preserva o valor ja gravado, no mesmo
  // padrao das demais regras de oferta.
  customerChangeMinNoticeMinutes: z.number().int().min(0).max(10_080).optional(),
});

const agendaInitialViewSchema = z.enum(["DAY", "WEEK", "MONTH"]);
const agendaHiddenWeekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(6)
  .refine((days) => new Set(days).size === days.length, {
    message: "hiddenWeekdays must not contain a repeated day.",
  });
const agendaViewPreferenceSchema = z.object({
  // Ausente preserva o que ja esta gravado (ou vazio, sem linha); ate seis
  // dias, sem repetido — sete ocultaria a semana inteira (Goal073).
  hiddenWeekdays: agendaHiddenWeekdaysSchema.optional(),
  // `null` explicito limpa a escolha; ausente preserva.
  initialView: agendaInitialViewSchema.nullable().optional(),
});

// Aparencia da conta (D-181). Ausente preserva o que ja esta gravado.
const appearancePreferenceSchema = z
  .object({
    accent: z
      .enum(["VERDE", "ROSE", "CHAMPANHE", "AZUL", "LAVANDA", "TERRACOTA"])
      .optional(),
    mode: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
  })
  .strict();

export async function registerV1SettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/settings",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(request, await settingsState(request, scheduling)),
  );

  app.patch(
    "/v1/settings/business",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(businessSchema, request.body);
      assertTimezone(body.timezone);
      const tenant = currentTenantContext(request);
      const prisma = getPrisma();
      const current = await prisma.businessProfile.findUnique({
        where: { tenantId: tenant.tenantId },
      });
      const { modalities, address, addressParts } = resolveBusinessProfileFields(
        current,
        body,
      );
      // O dono do fuso muda, ou nao, nesta gravacao (D-010). So propaga
      // quando muda: negocio sem mudanca nao deve custa uma chamada ao
      // Scheduling nem arriscar `FAILED` por um servico que nao precisava
      // ser chamado.
      const timezoneChanged = current?.timezone !== body.timezone;
      const businessChanges = diffFields(
        businessActivityFields(current),
        businessActivityFields({
          businessName: body.name,
          category: body.category,
          timezone: body.timezone,
          modalities,
          address,
        }),
        BUSINESS_ACTIVITY_FIELDS,
      );
      await prisma.$transaction([
        ...(businessChanges.length > 0
          ? [
              activityCreate(prisma, tenant.tenantId, {
                actor: userActor(tenant.userId),
                area: "SETTINGS",
                action: "settings.business_updated",
                entityType: "business",
                entityLabel: body.name,
                changes: businessChanges,
              }),
            ]
          : []),
        prisma.tenant.update({
          where: { id: tenant.tenantId },
          data: { name: body.name },
        }),
        prisma.businessProfile.upsert({
          where: { tenantId: tenant.tenantId },
          create: {
            tenantId: tenant.tenantId,
            businessName: body.name,
            category: body.category,
            timezone: body.timezone,
            modalities,
            address,
            addressParts: addressParts ?? Prisma.DbNull,
          },
          update: {
            businessName: body.name,
            category: body.category,
            timezone: body.timezone,
            modalities,
            address,
            addressParts: addressParts ?? Prisma.DbNull,
            businessContextVersion: { increment: 1 },
          },
        }),
      ]);
      const projected = await syncAi(request, ai);
      // Fora da transacao do BFF, de proposito: BFF e Scheduling sao bases
      // distintas sem transacao comum, e o dado do dono ja esta gravado e
      // comitado antes desta chamada. `reconcileBusinessTimezone` nunca
      // lanca; a nao convergencia fica legivel no `calendar` da resposta,
      // que `settingsState` le de novo do Scheduling logo abaixo.
      if (timezoneChanged) {
        await reconcileBusinessTimezone(
          internalContext(request),
          {
            scheduling,
            log: {
              warn: (payload, message) => request.log.warn(payload, message),
            },
          },
          { businessTimezone: body.timezone },
        );
      }
      return dataResponse(
        request,
        await settingsState(request, scheduling, projected, timezoneChanged),
      );
    },
  );

  app.patch(
    "/v1/settings/ai",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBodyWithAiConversationStyle(aiSchema, request.body);
      const tenant = currentTenantContext(request);
      let activatedByRunId: string | undefined;
      const current = await getPrisma().aiSettings.findUnique({
        where: { tenantId: tenant.tenantId },
      });
      // Desligada -> ligada, e só essa passagem (Goal077/WU-01): é o momento
      // em que a prova foi exigida acima, e a notificação da central nasce
      // com a ativação, na mesma transação.
      const activating = body.enabled && !current?.enabled;
      if (body.enabled) {
        // Goal025 §3: conta em exclusao nao religa a IA por nenhum caminho, e
        // este e o unico caminho de pedido humano que grava `enabled: true`.
        // Antes de qualquer outra checagem de proposito: a exclusao e sobre a
        // conta inteira, e perguntar se da para ativar uma conta que esta
        // sendo apagada nao faz sentido nem em ordem nem em custo.
        await assertAiActivationNotBlockedByDeletion(tenant.tenantId);
        // Prova valida so e exigida na passagem desligada -> ligada
        // (Goal063/WU-01, criterio 4). Ja ligada, o pedido so troca o estilo:
        // nem prova nova nem `activatedByRunId` mudam.
        if (!current?.enabled) {
          const run = await getValidActivationRunOrRefuse(
            internalContext(request),
            ai,
          );
          activatedByRunId = run.id;
        }
        const calendar = await scheduling.calendar(internalContext(request));
        if (!calendar.capabilities.aiActivationReady) {
          throw new AppError(
            "CONFLICT",
            "At least one operational service is required to activate the AI.",
            409,
          );
        }
      } else if (current?.enabled) {
        // Pausar (ligada -> desligada) grava a execucao valida corrente (se
        // houver) como ja usada, para a reconciliacao (Goal019 §7) nunca
        // desfazer a pausa humana com a mesma prova que a ligou (Goal063/WU-01,
        // review063 observacao 2). `enabled` ja gravado como `false` e so
        // troca de estilo: gravar aqui religaria a IA por reconciliacao com
        // uma prova que nunca autorizou pausa nenhuma. Leitura falhando nao
        // bloqueia pausar; so deixa de marcar a execucao como consumida.
        try {
          const run = await getValidActivationRun(internalContext(request), ai);
          if (run) activatedByRunId = run.id;
        } catch {
          // Pausar segue sem a marcacao; nao e recusa de leitura como ligar.
        }
      }
      // So a passagem ligada -> desligada grava o instante da pausa; ligar
      // limpa; salvar so o estilo com a IA ja desligada nao toca a coluna
      // (Goal117/WU-01).
      const pausing = !body.enabled && Boolean(current?.enabled);
      const pausedAtWrite = body.enabled
        ? { pausedAt: null }
        : pausing
          ? { pausedAt: new Date() }
          : {};
      const deliveryWrite = body.messageDelivery
        ? { messageDelivery: body.messageDelivery }
        : {};
      const upsertArgs = {
        where: { tenantId: tenant.tenantId },
        create: {
          tenantId: tenant.tenantId,
          enabled: body.enabled,
          tone: body.tone,
          ...deliveryWrite,
          ...(activatedByRunId ? { activatedByRunId } : {}),
          ...pausedAtWrite,
        },
        update: {
          enabled: body.enabled,
          tone: body.tone,
          ...deliveryWrite,
          ...(activatedByRunId ? { activatedByRunId } : {}),
          ...pausedAtWrite,
        },
      };
      const currentDelivery = current?.messageDelivery ?? "PARTS";
      const aiChanges = diffFields(
        {
          enabled: current?.enabled ?? false,
          tone: current?.tone ?? null,
          messageDelivery: currentDelivery,
        },
        {
          enabled: body.enabled,
          tone: body.tone,
          messageDelivery: body.messageDelivery ?? currentDelivery,
        },
        ["enabled", "tone", "messageDelivery"],
      );
      const aiAction = activating
        ? "settings.ai_enabled"
        : pausing
          ? "settings.ai_paused"
          : "settings.ai_updated";
      // A ativação e a notificação nascem juntas: falha ao gravar a
      // notificação desfaz o `enabled: true` desta mesma passada. A atividade
      // (D-176) vai no mesmo commit.
      const occurredAt = new Date();
      await getPrisma().$transaction(async (tx) => {
        await tx.aiSettings.upsert(upsertArgs);
        if (activating) {
          await materialize(tx, tenant.tenantId, [
            {
              kind: "AI_ACTIVATED",
              dedupeKey: aiActivatedDedupeKey(activatedByRunId as string),
              subjectId: null,
              occurredAt,
              payload: {},
            },
          ]);
        }
        if (aiChanges.length > 0) {
          await recordActivity(tx, tenant.tenantId, {
            actor: userActor(tenant.userId),
            area: "SETTINGS",
            action: aiAction,
            entityType: "ai_settings",
            changes: aiChanges,
          });
        }
      });
      const projected = await syncAi(request, ai);
      return dataResponse(
        request,
        await settingsState(request, scheduling, projected),
      );
    },
  );

  // --- Modo sandbox da IA (D-199) -----------------------------------------
  // A IA e a dona do estado (e ela quem envia); o BFF valida, repassa e
  // registra a atividade. Falha da IA nunca vira sucesso: a resposta e o erro.

  app.get(
    "/v1/settings/ai/sandbox",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(request, await ai.getAiSandbox(internalContext(request))),
  );

  app.patch(
    "/v1/settings/ai/sandbox",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(aiSandboxSettingsInputSchema, request.body);
      const exceptionPhones =
        body.exceptionPhones === undefined
          ? undefined
          : normalizeSandboxExceptionPhones(body.exceptionPhones);
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      const before = await ai.getAiSandbox(context);
      const input = {
        ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
        ...(exceptionPhones === undefined ? {} : { exceptionPhones }),
      };
      let after;
      try {
        after = await ai.updateAiSandbox(context, input);
      } catch (error) {
        // Negocio ainda sem configuracao na IA: projeta (como qualquer
        // gravacao das Configuracoes faz) e tenta uma vez mais.
        if (upstreamCodeOf(error) !== "AI_TENANT_CONFIG_NOT_PROJECTED") {
          throw error;
        }
        await syncAi(request, ai);
        after = await ai.updateAiSandbox(context, input);
      }
      // Os numeros entram mascarados (DDD e quatro ultimos digitos, D-200):
      // o registro diz qual numero passou a receber de verdade sem guardar
      // o telefone inteiro (D-199).
      const changes = diffFields(
        {
          enabled: before.enabled,
          exceptionPhones: maskedSandboxPhones(before.exceptionPhones),
        },
        {
          enabled: after.enabled,
          exceptionPhones: maskedSandboxPhones(after.exceptionPhones),
        },
        ["enabled", "exceptionPhones"],
      );
      const listChanged =
        before.exceptionPhones.join(",") !== after.exceptionPhones.join(",");
      if (changes.length > 0 || listChanged) {
        await recordActivity(getPrisma(), tenant.tenantId, {
          actor: userActor(tenant.userId),
          area: "SETTINGS",
          action:
            before.enabled === after.enabled
              ? "settings.ai_sandbox_updated"
              : after.enabled
                ? "settings.ai_sandbox_enabled"
                : "settings.ai_sandbox_disabled",
          entityType: "ai_settings",
          changes,
        });
      }
      return dataResponse(request, after);
    },
  );

  app.patch(
    "/v1/settings/availability",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(availabilitySchema, request.body);
      const tenant = currentTenantContext(request);
      // Fuso unico do negocio (Goal029/WU-03): `timezone` nao decide mais
      // sozinho, so herda ou confirma `BusinessProfile.timezone` (D-010).
      const profile = await getPrisma().businessProfile.findUnique({
        where: { tenantId: tenant.tenantId },
        select: { timezone: true },
      });
      return dataResponse(
        request,
        await scheduling.updateAvailabilitySettings(internalContext(request), {
          ...body,
          timezone: resolveAvailabilityTimezone(
            body.timezone,
            profile?.timezone ?? null,
          ),
        }),
      );
    },
  );

  app.get(
    "/v1/settings/reminders",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.reminderSettings(internalContext(request)),
      ),
  );

  app.patch(
    "/v1/settings/reminders",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.updateReminderSettings(
          internalContext(request),
          parseBody(reminderSettingsSchema, request.body),
        ),
      ),
  );

  // --- Preferencia de visualizacao da agenda (Goal073) --------------------
  // So do BFF: a Agenda Avenly nao tem noticao de "vista", entao nao existe
  // rota interna correspondente no Scheduling. Ausencia de linha e o default
  // do produto (nada oculto, sem vista inicial escolhida), nunca gravada por
  // esta leitura.

  app.get(
    "/v1/settings/agenda-view",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const row = await getPrisma().agendaViewPreference.findUnique({
        where: { tenantId: tenant.tenantId },
      });
      return dataResponse(request, {
        hiddenWeekdays: row?.hiddenWeekdays ?? [],
        initialView: row?.initialView ?? null,
      });
    },
  );

  app.patch(
    "/v1/settings/agenda-view",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(agendaViewPreferenceSchema, request.body);
      const tenant = currentTenantContext(request);
      const current = await getPrisma().agendaViewPreference.findUnique({
        where: { tenantId: tenant.tenantId },
      });
      const hiddenWeekdays = body.hiddenWeekdays ?? current?.hiddenWeekdays ?? [];
      const initialView =
        body.initialView !== undefined
          ? body.initialView
          : (current?.initialView ?? null);
      const row = await getPrisma().agendaViewPreference.upsert({
        where: { tenantId: tenant.tenantId },
        create: { tenantId: tenant.tenantId, hiddenWeekdays, initialView },
        update: { hiddenWeekdays, initialView },
      });
      return dataResponse(request, {
        hiddenWeekdays: row.hiddenWeekdays,
        initialView: row.initialView,
      });
    },
  );

  // --- Aparencia da conta (D-181) -----------------------------------------
  // Por usuario, nao por negocio: a escolha acompanha a pessoa em qualquer
  // aparelho, e so precisa de sessao (vale tambem antes do onboarding). Sem
  // linha, o padrao do produto, nunca gravado por esta leitura. Nao entra no
  // registro de atividade: e preferencia de quem usa, nao configuracao do
  // negocio.

  app.get(
    "/v1/settings/appearance",
    { preHandler: requireAuth },
    async (request) => {
      const row = await getPrisma().appearancePreference.findUnique({
        where: { userId: currentUser(request).id },
      });
      return dataResponse(request, {
        accent: row?.accent ?? "VERDE",
        mode: row?.mode ?? "LIGHT",
      });
    },
  );

  app.patch(
    "/v1/settings/appearance",
    { preHandler: requireAuth },
    async (request) => {
      const body = parseBody(appearancePreferenceSchema, request.body);
      const userId = currentUser(request).id;
      const row = await getPrisma().appearancePreference.upsert({
        where: { userId },
        create: { userId, ...body },
        update: body,
      });
      return dataResponse(request, { accent: row.accent, mode: row.mode });
    },
  );
}

async function settingsState(
  request: FastifyRequest,
  scheduling: SchedulingClient,
  /**
   * A projecao tentada **nesta requisicao** chegou na IA?
   *
   * `undefined` e "esta requisicao nao projetou nada" — leitura pura, em que
   * o estado vem so da comparacao entre as versoes gravadas. `false` e a
   * tentativa que falhou agora: a resposta continua sendo sucesso, porque o
   * dado do BFF foi gravado, mas o estado de projecao e o real.
   */
  projectedNow?: boolean,
  /**
   * O fuso do negocio ja foi reconciliado **nesta requisicao** por quem
   * chamou (`PATCH /v1/settings/business` quando o fuso mudou)?
   *
   * Existe para manter a propriedade 1 de D-010 valendo por requisicao, e
   * nao por chamada: sem isso a gravacao que ja tentou propagar tentaria uma
   * segunda escrita no Scheduling na mesma requisicao. Leitura pura passa
   * `false` e reconcilia normalmente.
   */
  timezoneAlreadyReconciled = false,
) {
  const tenant = currentTenantContext(request);
  const context = internalContext(request);
  const [profile, aiSettings, calendar] = await Promise.all([
    getPrisma().businessProfile.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    getPrisma().aiSettings.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    // Leitura do calendario, como sempre foi: falha dela continua sendo falha
    // da requisicao. Este Goal so acrescenta a reconciliacao do fuso, e ela
    // nunca transforma um calendario ilegivel em um calendario vazio de
    // mentira — `source: null` e `capabilities` todas `false` sao um estado
    // de produto que existe (negocio sem agenda operacional), e devolve-lo
    // porque o Scheduling nao respondeu faria a tela afirmar exatamente o que
    // ela nao sabe.
    scheduling.calendar(context),
  ]);
  // Reconciliacao em requisicao do fuso unico do negocio (Goal029/WU-04,
  // D-010). As duas copias ja foram lidas acima, entao decidir aqui nao
  // custa consulta nova ao Scheduling: tenant convergido devolve `NOOP` sem
  // escrita nenhuma, e tenant divergente gasta uma unica tentativa. A
  // tentativa e um efeito de favor: `reconcileBusinessTimezone` nunca lanca,
  // entao o Scheduling recusando a escrita deixa esta leitura responder do
  // mesmo jeito, com a divergencia legivel entre `business.timezone` e
  // `calendar.timezone` na mesma resposta.
  const reconciliation = timezoneAlreadyReconciled
    ? null
    : await reconcileBusinessTimezone(
        context,
        {
          scheduling,
          log: {
            warn: (payload, message) => request.log.warn(payload, message),
          },
        },
        {
          businessTimezone: profile?.timezone ?? null,
          calendarTimezone: calendar.timezone,
        },
      );
  const availability =
    calendar.source === CALENDAR_SOURCE
      ? await scheduling.availabilitySettings(context)
      : null;
  return {
    business: profile
      ? {
          name: profile.businessName,
          category: profile.category,
          timezone: profile.timezone,
          language: profile.language,
          currency: profile.currency,
          modalities: profile.modalities,
          address: profile.address,
          addressParts: businessAddressPartsDto(profile.addressParts),
          contextVersion: profile.businessContextVersion,
          contextProjectedVersion: profile.businessContextProjectedVersion,
          contextProjectionStatus:
            projectedNow === false
              ? "PENDING"
              : businessContextProjectionState(profile),
        }
      : null,
    ai: {
      enabled: Boolean(aiSettings?.enabled),
      tone: normalizeStoredAiConversationStyle(aiSettings?.tone),
      pausedAt: aiSettings?.pausedAt?.toISOString() ?? null,
      // D-208: sem linha, em varias partes, como o default da coluna.
      messageDelivery: aiSettings?.messageDelivery ?? "PARTS",
    },
    calendar: {
      ...calendar,
      source: calendar.source === CALENDAR_SOURCE ? CALENDAR_SOURCE : null,
      // O fuso da replica **depois** desta passada. Convergiu: sai o fuso do
      // dono. Nao convergiu: sai o valor que continua gravado no Scheduling,
      // divergente de `business.timezone` na mesma resposta. Nenhum caminho
      // aqui afirma convergencia que nao aconteceu.
      timezone: reconciliation
        ? reconciliation.calendarTimezone
        : calendar.timezone,
    },
    availability,
  };
}

/**
 * Falha de projecao nunca vira erro da requisicao: o dado do negocio ja foi
 * gravado antes desta chamada, e o estado projetado/pendente exposto em
 * `settingsState` e o unico aviso — sem retentativa automatica, sem 500
 * (Goal018/WU-03).
 *
 * Devolve se a projecao **desta** chamada chegou na IA (Goal019 §7, residuo
 * nominal do review018). Sem isso a resposta de `PATCH /v1/settings/ai`
 * afirmava `PROJECTED` mesmo com a projecao falhada: o contexto de negocio
 * nao muda de versao nesse caminho, entao a comparacao entre versoes gravadas
 * continuava batendo e escondia a falha que acabara de acontecer.
 */
async function syncAi(
  request: FastifyRequest,
  ai: AiOrchestratorClient,
): Promise<boolean> {
  const tenant = currentTenantContext(request);
  const [settings, businessProfile] = await Promise.all([
    getPrisma().aiSettings.upsert({
      where: { tenantId: tenant.tenantId },
      create: { tenantId: tenant.tenantId, enabled: false },
      update: {},
    }),
    getPrisma().businessProfile.upsert({
      where: { tenantId: tenant.tenantId },
      create: { tenantId: tenant.tenantId },
      update: {},
    }),
  ]);
  try {
    await ai.updateTenantConfig(internalContext(request), {
      enabled: settings.enabled,
      tone: resolveAiConversationStyle(settings.tone),
      businessContext: businessContextPayload(businessProfile),
      messageDelivery: settings.messageDelivery,
    });
    if (
      businessProfile.businessContextProjectedVersion !==
      businessProfile.businessContextVersion
    ) {
      await getPrisma().businessProfile.update({
        where: { tenantId: tenant.tenantId },
        data: {
          businessContextProjectedVersion:
            businessProfile.businessContextVersion,
        },
      });
    }
    return true;
  } catch (error) {
    request.log.warn(
      { err: error, tenantId: tenant.tenantId },
      "AI tenant config projection failed; business context stays pending.",
    );
    return false;
  }
}

/**
 * A prova exigida para ligar a IA por `PATCH /v1/settings/ai` (Goal063/WU-01).
 *
 * Recusa com `409 AI_ACTIVATION_TEST_REQUIRED` sem gravar nada: sem execucao,
 * execucao `FAILED`/`PAUSED_BY_HUMAN`, execucao `SUCCEEDED` superada por troca
 * de canal, ou leitura do teste que falhou — os quatro casos do criterio 1
 * caem no mesmo `catch`, porque `getValidActivationRun` nunca lanca por causa
 * de estado, so por falha de leitura, e ausencia de prova valida e `null`.
 */
async function getValidActivationRunOrRefuse(
  context: ReturnType<typeof internalContext>,
  ai: AiOrchestratorClient,
): Promise<ActivationTestRun> {
  let run: ActivationTestRun | null;
  try {
    run = await getValidActivationRun(context, ai);
  } catch (error) {
    throw new AppError(
      "AI_ACTIVATION_TEST_REQUIRED",
      `A successful, still-valid real activation test is required before turning the AI on: ${toErrorMessage(error)}`,
      409,
    );
  }
  if (!run) {
    throw new AppError(
      "AI_ACTIVATION_TEST_REQUIRED",
      "A successful, still-valid real activation test is required before turning the AI on.",
      409,
    );
  }
  return run;
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid IANA timezone.", 400);
  }
}

/**
 * Reduz o dominio de `availability.timezone` ao fuso unico do negocio
 * (Goal029/WU-03, D-010): ausente herda o fuso do negocio, presente e
 * divergente e recusado, e sem `business.timezone` gravado nao ha dono
 * contra o qual resolver ou comparar — recusa em vez de deixar a
 * disponibilidade virar dona por um caminho que nao e `business.timezone`.
 */
function resolveAvailabilityTimezone(
  provided: string | undefined,
  businessTimezone: string | null,
): string {
  if (provided !== undefined) assertTimezone(provided);
  if (businessTimezone === null) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Business timezone must be set before availability.timezone can be resolved.",
      400,
    );
  }
  if (provided !== undefined && provided !== businessTimezone) {
    throw new AppError(
      "VALIDATION_ERROR",
      "availability.timezone must match the business timezone.",
      400,
    );
  }
  return businessTimezone;
}

/** Campos do negócio no antes/depois da atividade (D-176). */
const BUSINESS_ACTIVITY_FIELDS = [
  "name",
  "category",
  "timezone",
  "modalities",
  "address",
] as const;

function businessActivityFields(
  profile: {
    businessName: string;
    category: string | null;
    timezone: string;
    modalities: readonly string[];
    address: string | null;
  } | null,
): Record<string, string | null> {
  if (!profile) return {};
  return {
    name: profile.businessName,
    category: profile.category,
    timezone: profile.timezone,
    modalities: [...profile.modalities].sort().join(",") || null,
    address: profile.address,
  };
}

/**
 * Excecoes do modo sandbox (D-199): numero brasileiro valido, canonico, sem
 * repeticao (com ou sem o 9o digito). Numero invalido recusa a gravacao
 * inteira: nunca e descartado em silencio.
 */
function normalizeSandboxExceptionPhones(phones: string[]): string[] {
  const result: string[] = [];
  phones.forEach((raw, index) => {
    const phone = normalizeBrazilianWhatsappPhone(raw);
    if (!phone) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Sandbox exception phone is not a valid Brazilian number.",
        400,
        { field: "exceptionPhones", index },
      );
    }
    if (!result.some((existing) => phonesMatch(existing, phone))) {
      result.push(phone);
    }
  });
  return result;
}

/**
 * Telefone de excecao do sandbox para o registro de atividade (D-200): DDD e
 * os quatro ultimos digitos, o resto escondido (`+55 11 •••••-5678`). Lista
 * vazia e `null` ("Nenhum" na tela).
 */
export function maskedSandboxPhones(phones: readonly string[]): string | null {
  if (phones.length === 0) return null;
  return phones
    .map((phone) => {
      const digits = phone.replace(/\D/gu, "");
      const national = digits.startsWith("55") ? digits.slice(2) : digits;
      const ddd = national.slice(0, 2);
      const subscriber = national.slice(2);
      const hidden = "•".repeat(Math.max(subscriber.length - 4, 0));
      return `+55 ${ddd} ${hidden}-${subscriber.slice(-4)}`;
    })
    .join(", ");
}

function upstreamCodeOf(error: unknown): string | undefined {
  if (!(error instanceof AppError) || error.code !== "UPSTREAM_ERROR") {
    return undefined;
  }
  return (error.details as { upstreamCode?: string } | undefined)
    ?.upstreamCode;
}
