// @vitest-environment jsdom
/**
 * Goal109, prova 8: os demais valores do frontend passam a Avenly sem quebrar
 * quem ainda tem o nome antigo.
 *
 * - o onboarding envia `"AVENLY"` como fonte da agenda;
 * - o detalhe do agendamento libera o ciclo de vida com `"AVENLY"`;
 * - `legal-details` lê `AVENLY_*` primeiro e cai para `ATENDLY_*` na falta;
 * - `check-legal-config.mjs` aceita a configuração só antiga e só nova;
 * - `Brand` não repete a assinatura para quem só tem a chave antiga.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getLegalDetails, legalDocumentsAreIndexable } from "@/config/legal-details";
import type { CalendarState } from "@/data";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import {
  persistScheduleStep,
  skipImportAndGoToScratch,
} from "@/features/onboarding/blocks/schedule";
import { sourceLabel } from "@/features/settings/shared/labels";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { BrandMark } from "@/shared/ui/Brand";

const updateOnboarding = vi.fn();
const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
    },
    onboarding: { update: updateOnboarding },
  }),
  useProductRuntime: () => ({
    session: {
      tenant: { id: "t1", name: "Studio Teste" },
      user: { email: "dono@teste.com", id: "user-dono", name: "Dono do negócio" },
    },
  }),
}));

const LEGAL_SUFFIXES = [
  "LEGAL_NAME",
  "TRADE_NAME",
  "CNPJ",
  "LEGAL_ADDRESS",
  "SUPPORT_EMAIL",
  "PRIVACY_EMAIL",
  "PRIVACY_OFFICER",
  "AI_PROVIDER",
  "HOSTING_PROVIDER",
  "ANALYTICS_PROVIDERS",
  "RETENTION_PERIOD",
  "APPLICABLE_FORUM",
  "LEGAL_REVIEW_APPROVED",
  "LEGAL_INDEXABLE",
];

function clearLegalEnvironment(env: NodeJS.ProcessEnv) {
  for (const suffix of LEGAL_SUFFIXES) {
    delete env[`AVENLY_${suffix}`];
    delete env[`ATENDLY_${suffix}`];
  }
}

function calendarFixture(): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

describe("onboarding envia AVENLY", () => {
  beforeEach(() => {
    updateOnboarding.mockReset();
    updateOnboarding.mockResolvedValue({});
  });

  function stepContext() {
    return {
      draft: { timezone: "America/Sao_Paulo" },
      go: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof skipImportAndGoToScratch>[0];
  }

  test("'Fazer depois' grava a fonte AVENLY", async () => {
    await skipImportAndGoToScratch(stepContext());

    expect(updateOnboarding).toHaveBeenCalledWith({
      calendar: { source: "AVENLY", timezone: "America/Sao_Paulo" },
    });
  });

  test("'Importar agora' grava a fonte AVENLY antes de seguir", async () => {
    await persistScheduleStep("quando-importar", stepContext());

    expect(updateOnboarding).toHaveBeenCalledWith({
      calendar: { source: "AVENLY", timezone: "America/Sao_Paulo" },
    });
  });
});

describe("agenda libera o ciclo de vida com AVENLY", () => {
  beforeEach(() => {
    for (const spy of [
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
    ]) {
      spy.mockReset();
    }
    getCalendar.mockResolvedValue(calendarFixture());
    listAppointmentEvents.mockResolvedValue([]);
    listAppointmentNotifications.mockResolvedValue([]);
    getAppointment.mockResolvedValue({
      bufferAfterMinutes: 0,
      bufferBeforeMinutes: 0,
      comments: null,
      completedAt: null,
      completionOrigin: null,
      customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
      customerId: "c1",
      date: "2026-09-14",
      durationMinutes: 60,
      endTime: "11:00",
      finalValue: null,
      id: "apt-1",
      noShowAt: null,
      noShowNote: null,
      presenceConfirmedAt: null,
      seriesId: null,
      services: [
        {
          durationMinutes: 60,
          name: "Corte feminino",
          price: 90,
          priceType: "FIXED",
          serviceId: "s1",
        },
      ],
      source: "USER",
      startTime: "10:00",
      status: "CONFIRMED",
      title: null,
      totalPrice: 90,
      totalPriceType: "FIXED",
    });
  });

  test("o detalhe oferece 'Concluir atendimento' com a fonte AVENLY", async () => {
    render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Mais ações do agendamento" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Concluir atendimento" }),
    ).toBeVisible();
  });

  test("a fonte AVENLY continua com o texto 'Agenda Avenly'", () => {
    expect(sourceLabel("AVENLY")).toBe("Agenda Avenly");
    expect(sourceLabel(null)).toBe("Não configurada");
  });
});

describe("legal-details lê AVENLY_* primeiro e ATENDLY_* como reserva", () => {
  const original = { ...process.env };

  beforeEach(() => clearLegalEnvironment(process.env));
  afterEach(() => {
    clearLegalEnvironment(process.env);
    for (const suffix of LEGAL_SUFFIXES) {
      for (const prefix of ["AVENLY_", "ATENDLY_"]) {
        const value = original[`${prefix}${suffix}`];
        if (value !== undefined) process.env[`${prefix}${suffix}`] = value;
      }
    }
  });

  test("só o nome novo configurado", () => {
    process.env.AVENLY_LEGAL_NAME = "Avenly Ltda";
    process.env.AVENLY_CNPJ = "11.111.111/0001-11";

    const details = getLegalDetails();

    expect(details.legalName).toBe("Avenly Ltda");
    expect(details.cnpj).toBe("11.111.111/0001-11");
    expect(details.tradeName).toBe("[NOME FANTASIA]");
  });

  test("só o nome antigo configurado ainda vale", () => {
    process.env.ATENDLY_LEGAL_NAME = "Atendly Ltda";
    process.env.ATENDLY_SUPPORT_EMAIL = "suporte@exemplo.test";

    const details = getLegalDetails();

    expect(details.legalName).toBe("Atendly Ltda");
    expect(details.supportEmail).toBe("suporte@exemplo.test");
    expect(details.tradeName).toBe("[NOME FANTASIA]");
  });

  test("com os dois, o novo vence", () => {
    process.env.ATENDLY_LEGAL_NAME = "Atendly Ltda";
    process.env.AVENLY_LEGAL_NAME = "Avenly Ltda";

    expect(getLegalDetails().legalName).toBe("Avenly Ltda");
  });

  test("um valor novo em branco cai para o antigo", () => {
    process.env.AVENLY_LEGAL_NAME = "   ";
    process.env.ATENDLY_LEGAL_NAME = "Atendly Ltda";

    expect(getLegalDetails().legalName).toBe("Atendly Ltda");
  });

  test("a indexação dos documentos lê o nome novo e o antigo", () => {
    expect(legalDocumentsAreIndexable()).toBe(false);

    process.env.ATENDLY_LEGAL_REVIEW_APPROVED = "true";
    process.env.ATENDLY_LEGAL_INDEXABLE = "true";
    expect(legalDocumentsAreIndexable()).toBe(true);

    clearLegalEnvironment(process.env);
    process.env.AVENLY_LEGAL_REVIEW_APPROVED = "true";
    process.env.AVENLY_LEGAL_INDEXABLE = "true";
    expect(legalDocumentsAreIndexable()).toBe(true);
  });
});

describe("check-legal-config.mjs aceita só antiga e só nova", () => {
  const script = path.resolve(__dirname, "../scripts/check-legal-config.mjs");
  const REQUIRED = LEGAL_SUFFIXES.filter(
    (suffix) =>
      suffix !== "LEGAL_REVIEW_APPROVED" && suffix !== "LEGAL_INDEXABLE",
  );

  function run(prefix: "AVENLY_" | "ATENDLY_" | null, approved = true) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    clearLegalEnvironment(env);
    if (prefix) {
      for (const suffix of REQUIRED) env[`${prefix}${suffix}`] = "valor";
      env[`${prefix}LEGAL_REVIEW_APPROVED`] = approved ? "true" : "false";
    }
    return spawnSync(process.execPath, [script], { encoding: "utf8", env });
  }

  test("configuração só com nomes novos passa", () => {
    const result = run("AVENLY_");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Configuração jurídica obrigatória validada.");
  });

  test("configuração só com nomes antigos passa", () => {
    const result = run("ATENDLY_");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("sem configuração, falha nomeando os campos pelo nome novo", () => {
    const result = run(null);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("campos ausentes");
    expect(result.stderr).toContain("AVENLY_LEGAL_NAME");
  });

  test("sem aprovação jurídica, falha mesmo com tudo preenchido", () => {
    for (const prefix of ["AVENLY_", "ATENDLY_"] as const) {
      const result = run(prefix, false);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("revisão jurídica não aprovada");
    }
  });
});

describe("Brand não repete a assinatura", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  function markClassName() {
    return document.querySelector("svg")?.getAttribute("class");
  }

  test("sem chave nenhuma, anima e grava só a chave nova", () => {
    render(<BrandMark signature="entry" />);

    expect(markClassName()).toBe("brand-mark brand-mark--entry");
    expect(window.sessionStorage.getItem("avenly:brand-signature-entry")).toBe("1");
    expect(window.sessionStorage.getItem("atendly:brand-signature-entry")).toBeNull();
  });

  test("com só a chave antiga, não anima de novo", () => {
    window.sessionStorage.setItem("atendly:brand-signature-entry", "1");

    render(<BrandMark signature="entry" />);

    expect(markClassName()).toBe("brand-mark");
  });

  test("a assinatura 'check' também respeita a chave antiga", () => {
    window.sessionStorage.setItem("atendly:brand-signature-check", "1");

    render(<BrandMark signature="check" />);

    expect(markClassName()).toBe("brand-mark");
  });

  test("com a chave nova, não anima de novo", () => {
    window.sessionStorage.setItem("avenly:brand-signature-entry", "1");

    render(<BrandMark signature="entry" />);

    expect(markClassName()).toBe("brand-mark");
  });
});
