import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * POST /v1/onboarding/complete sem WhatsApp (Goal018, WU-04) — WhatsApp deixa
 * de ser exigência bloqueante; as pendências novas de negócio (modalidade e
 * endereço) entram no mesmo conjunto que já bloqueava com 409.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamOptions {
  calendarSource?: "ATENDLY" | "MINHA_AGENDA" | null;
  hasActiveService?: boolean;
  hasActiveAvailabilityRule?: boolean;
}

const aiTenantConfigCalls: unknown[] = [];

function calendarPayload(source: "ATENDLY" | "MINHA_AGENDA" | null) {
  return {
    source,
    timezone: source ? "America/Sao_Paulo" : null,
    integration:
      source === "MINHA_AGENDA"
        ? {
            status: "CONNECTED",
            lastSuccessfulSyncAt: null,
            lastErrorAt: null,
            lastErrorCode: null,
          }
        : null,
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: false,
      aiActivationReady: true,
    },
  };
}

function servicePayload(active: boolean) {
  return {
    id: "service-1",
    name: "Corte",
    durationMinutes: 60,
    priceType: "FIXED",
    price: 100,
    active,
    needsReview: false,
    reviewOrigin: null,
    description: null,
    colorToken: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    recurrenceIntervalDays: null,
  };
}

function availabilitySettingsPayload(hasActiveRule: boolean) {
  return {
    timezone: "America/Sao_Paulo",
    rules: hasActiveRule
      ? [
          {
            id: "rule-1",
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "18:00",
            active: true,
          },
        ]
      : [],
    minLeadMinutes: 0,
    maxLeadDays: 90,
    granularityMinutes: 30,
  };
}

function stubUpstream(options: UpstreamOptions = {}) {
  const {
    calendarSource = null,
    hasActiveService = false,
    hasActiveAvailabilityRule = false,
  } = options;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);

      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({
            data: calendarPayload(calendarSource),
            requestId: "upstream-calendar",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/service-catalog") {
        return new Response(
          JSON.stringify({
            data: hasActiveService ? [servicePayload(true)] : [],
            requestId: "upstream-services",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/availability-settings") {
        return new Response(
          JSON.stringify({
            data: availabilitySettingsPayload(hasActiveAvailabilityRule),
            requestId: "upstream-availability",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        aiTenantConfigCalls.push(
          request.method === "GET" ? null : JSON.parse(await request.text()),
        );
        return new Response(JSON.stringify({ ok: true, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

async function linkWhatsAppInstance(
  session: SessionHandle,
  status: "CREATED" | "CONNECTED" | "DISCONNECTED",
): Promise<void> {
  const name = `goal018-wu04-${session.tenantId}`;
  await getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${name}-id`,
      evolutionInstanceName: name,
      status,
      ...sealedInstanceCredentialData("wa_synthetic_wu04_credential", {
        tenantId: session.tenantId,
        evolutionInstanceName: name,
      }),
    },
  });
}

async function completeBusinessAndAi(
  session: SessionHandle,
  business: { modalities: string[]; address?: string | null },
): Promise<void> {
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/onboarding",
    headers: browserMutation(session),
    payload: {
      business: {
        name: "Studio Completo",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: business.modalities,
        ...(business.address !== undefined ? { address: business.address } : {}),
      },
      ai: { tone: "BALANCED" },
    },
  });
  expect(response.statusCode).toBe(200);
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  aiTenantConfigCalls.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal018/WU-04: concluir onboarding sem WhatsApp, com pendências nomeadas",
  () => {
    it("conclui com WhatsApp ausente", async () => {
      const owner = await business("complete-no-whatsapp");
      stubUpstream({
        calendarSource: "ATENDLY",
        hasActiveService: true,
        hasActiveAvailabilityRule: true,
      });
      await completeBusinessAndAi(owner, { modalities: ["ONLINE"] });

      const complete = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(complete.statusCode).toBe(200);
      expect(complete.json().data.completed).toBe(true);
      expect(complete.json().data.whatsapp).toBeNull();
    });

    it("conclui com WhatsApp vinculado e desconectado", async () => {
      const owner = await business("complete-whatsapp-disconnected");
      await linkWhatsAppInstance(owner, "DISCONNECTED");
      stubUpstream({
        calendarSource: "ATENDLY",
        hasActiveService: true,
        hasActiveAvailabilityRule: true,
      });
      await completeBusinessAndAi(owner, { modalities: ["ONLINE"] });

      const complete = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(complete.statusCode).toBe(200);
      expect(complete.json().data.completed).toBe(true);
    });

    it("WHATSAPP_NOT_CONFIGURED e WHATSAPP_NOT_CONNECTED não aparecem mais em error.details.issues", async () => {
      const owner = await business("complete-issues-no-whatsapp-codes");
      stubUpstream();

      const complete = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(complete.statusCode).toBe(409);
      const issues = complete.json().error.details.issues as string[];
      expect(issues).not.toContain("WHATSAPP_NOT_CONFIGURED");
      expect(issues).not.toContain("WHATSAPP_NOT_CONNECTED");
    });

    it("modalidade não escolhida e endereço ON_SITE ausente bloqueiam com 409, junto das demais pendências", async () => {
      const owner = await business("complete-business-issues");
      stubUpstream();

      const missingModality = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(missingModality.statusCode).toBe(409);
      let issues = missingModality.json().error.details.issues as string[];
      expect(issues).toContain("BUSINESS_MODALITY_NOT_SELECTED");
      expect(issues).toContain("BUSINESS_PROFILE_INCOMPLETE");
      expect(issues).toContain("CALENDAR_NOT_SELECTED");
      expect(issues).toContain("AI_TONE_NOT_SELECTED");

      // Grava ON_SITE sem endereço diretamente no perfil, contornando a
      // recusa própria de PATCH — prova o que /complete verifica por si,
      // independente da validação de escrita.
      await getPrisma().businessProfile.update({
        where: { tenantId: owner.tenantId },
        data: {
          businessName: "Studio Sem Endereço",
          category: "Beleza",
          modalities: ["ON_SITE"],
          address: null,
        },
      });

      const missingAddress = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(missingAddress.statusCode).toBe(409);
      issues = missingAddress.json().error.details.issues as string[];
      expect(issues).toContain("BUSINESS_ADDRESS_REQUIRED");
      expect(issues).not.toContain("BUSINESS_MODALITY_NOT_SELECTED");
      expect(issues).not.toContain("BUSINESS_PROFILE_INCOMPLETE");
    });

    it("não altera AiSettings.enabled nem projeta enabled: true ao concluir", async () => {
      const owner = await business("complete-does-not-enable-ai");
      stubUpstream({
        calendarSource: "ATENDLY",
        hasActiveService: true,
        hasActiveAvailabilityRule: true,
      });
      await completeBusinessAndAi(owner, { modalities: ["ONLINE"] });

      const beforeSettings = await getPrisma().aiSettings.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(beforeSettings.enabled).toBe(false);
      const callsBeforeComplete = aiTenantConfigCalls.length;

      const complete = await app.inject({
        method: "POST",
        url: "/v1/onboarding/complete",
        headers: browserMutation(owner),
      });
      expect(complete.statusCode).toBe(200);

      const afterSettings = await getPrisma().aiSettings.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(afterSettings.enabled).toBe(false);
      // /complete não chama o orquestrador de IA de novo: nenhuma chamada
      // nova a /internal/ai-tenant-config, muito menos uma com enabled: true.
      expect(aiTenantConfigCalls.length).toBe(callsBeforeComplete);
      for (const call of aiTenantConfigCalls) {
        expect((call as { enabled?: boolean } | null)?.enabled).not.toBe(true);
      }
    });
  },
);
