// @vitest-environment jsdom
/**
 * Goal024 (WU-01/WU-02), revisto no Goal097 (M1): hub de Configurações — o
 * ponto de entrada único, em três grupos (Atendimento, Seu negócio, Dados e
 * conta) que listam Serviços, IA, WhatsApp, Negócio, Agenda, Importação,
 * Conversas e Conta.
 *
 * O que esta suíte prova:
 *
 * - as oito linhas existem, cada uma apontando para a rota certa;
 * - "Disponibilidade" não é linha do hub, com ou sem fonte de agenda: ela é a
 *   linha "Dias e horários" da Agenda (AG1);
 * - o estado de cada linha reflete o dado real (tom da IA), não um texto
 *   inventado, e o bloco de identidade só existe com o negócio gravado.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { SettingsState } from "@/data";
import { SettingsHub } from "@/features/settings/SettingsHub";
import type * as SystemStatusModule from "@/shared/runtime/systemStatus";

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: {
      getImportState: vi.fn().mockResolvedValue({ history: null, session: null }),
    },
    retention: {
      get: vi.fn().mockResolvedValue({
        commercialRetentionDays: 90,
        personalRetentionDays: 30,
      }),
    },
    serviceCatalog: {
      list: vi.fn().mockResolvedValue({ items: [] }),
    },
  }),
  useProductRuntime: () => ({
    session: { user: { email: "marina@studio.com" } },
  }),
}));

vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof SystemStatusModule>();
  return {
    ...actual,
    useSystemStatus: () => ({
      ai: null,
      aiView: "active",
      phase: "loaded",
      whatsapp: null,
      whatsappView: "off",
    }),
  };
});

// As linhas do hub são os links da página.
function rowLinks() {
  return screen.getAllByRole("link");
}

function settingsFixture(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    ai: { enabled: true, tone: "CASUAL" },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: ["ON_SITE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
    ...overrides,
  };
}

describe("hub com fonte de agenda Atendly", () => {
  test("lista as oito linhas, cada uma apontando para a rota certa", () => {
    render(<SettingsHub settings={settingsFixture()} />);

    const expected: Array<[string, string]> = [
      ["Serviços", "/servicos"],
      ["IA", "/configuracoes/ia"],
      ["WhatsApp", "/configuracoes/whatsapp"],
      ["Negócio", "/configuracoes/negocio"],
      ["Agenda", "/configuracoes/agenda"],
      ["Importação", "/importacao"],
      ["Conversas", "/configuracoes/conversas"],
      ["Conta", "/configuracoes/conta"],
    ];
    for (const [title, href] of expected) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${title}`) }),
      ).toHaveAttribute("href", href);
    }
    expect(rowLinks()).toHaveLength(expected.length);
  });

  test("o estado de cada linha reflete o dado real salvo", () => {
    render(
      <SettingsHub
        settings={settingsFixture({
          ai: { enabled: true, tone: "PROFESSIONAL" },
        })}
      />,
    );

    const aiRow = screen.getByRole("link", { name: /^IA/ });
    expect(aiRow).toHaveTextContent("Ativa · estilo Profissional");
    const businessRow = screen.getByRole("link", { name: /^Negócio/ });
    expect(businessRow).toHaveTextContent(
      "Endereço, pagamento, informações para a IA",
    );
    expect(screen.getByText("Studio Marina")).toBeInTheDocument();
  });

  test("Negócio sem cadastro salvo não mostra o bloco de identidade", () => {
    render(<SettingsHub settings={settingsFixture({ business: null })} />);

    expect(screen.queryByText("Studio Marina")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Negócio/ })).toHaveAttribute(
      "href",
      "/configuracoes/negocio",
    );
  });
});

describe("hub sem fonte de agenda escolhida", () => {
  test("não existe linha Disponibilidade — ela é a linha Dias e horários da Agenda", () => {
    render(
      <SettingsHub
        settings={settingsFixture({
          calendar: {
            capabilities: {
              createAppointments: false,
              manageAvailability: false,
              manageCustomers: false,
              manageServices: false,
              migrate: false,
            },
            integration: null,
            source: null,
            timezone: "America/Sao_Paulo",
          },
        })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /Disponibilidade/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Agenda/ })).toHaveAttribute(
      "href",
      "/configuracoes/agenda",
    );
    expect(rowLinks()).toHaveLength(8);
  });
});
