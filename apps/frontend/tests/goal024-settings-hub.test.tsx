// @vitest-environment jsdom
/**
 * Goal024 (WU-01/WU-02): hub de Configurações — o ponto de entrada único que
 * lista Negócio, Agenda, (Disponibilidade condicional), Atendente virtual,
 * WhatsApp, Importação, Conversas e Conta.
 *
 * O que esta suíte prova:
 *
 * - com a fonte de agenda ATENDLY, os oito cartões existem, cada um apontando
 *   para a rota certa, na ordem do vault;
 * - "Disponibilidade" só aparece quando `calendar.source === "ATENDLY"` — com
 *   fonte EXTERNAL o cartão não existe, não fica só desabilitado;
 * - a copy de cada cartão reflete o estado real (nome do negócio salvo, fonte
 *   de agenda, tom da IA), não um texto fixo.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { SettingsState } from "@/data";
import { SettingsHub } from "@/features/settings/SettingsHub";

// `SettingsHub` monta dentro de `SettingsPage`, que sempre acrescenta o link
// "Configurações" de volta ao próprio hub. Os cartões são os links restantes.
function cardLinks() {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href") !== "/configuracoes");
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
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    ...overrides,
  };
}

describe("hub com fonte de agenda Atendly", () => {
  test("lista os oito cartões, cada um apontando para a rota certa", () => {
    render(<SettingsHub settings={settingsFixture()} />);

    const expected: Array<[string, string]> = [
      ["Negócio", "/configuracoes/negocio"],
      ["Agenda", "/configuracoes/agenda"],
      ["Disponibilidade", "/configuracoes/disponibilidade"],
      ["Atendente virtual", "/configuracoes/ia"],
      ["WhatsApp", "/configuracoes/whatsapp"],
      ["Importação", "/importacao"],
      ["Conversas", "/configuracoes/conversas"],
      ["Conta", "/configuracoes/conta"],
    ];
    for (const [title, href] of expected) {
      expect(
        screen.getByRole("link", { name: new RegExp(`^${title}`) }),
      ).toHaveAttribute("href", href);
    }
    expect(cardLinks()).toHaveLength(expected.length);
  });

  test("a copy de cada cartão reflete o estado real salvo", () => {
    render(
      <SettingsHub
        settings={settingsFixture({
          ai: { enabled: true, tone: "PROFESSIONAL" },
        })}
      />,
    );

    const businessCard = screen.getByRole("link", { name: /Negócio/ });
    expect(businessCard).toHaveTextContent("Studio Marina");
    const calendarCard = screen.getByRole("link", { name: /^Agenda/ });
    expect(calendarCard).toHaveTextContent("Agenda Atendly");
    const aiCard = screen.getByRole("link", { name: /Atendente virtual/ });
    expect(aiCard).toHaveTextContent("Profissional");
  });

  test("Negócio sem nome salvo convida a completar o cadastro", () => {
    render(
      <SettingsHub settings={settingsFixture({ business: null })} />,
    );

    expect(screen.getByRole("link", { name: /Negócio/ })).toHaveTextContent(
      "Complete seus dados",
    );
  });
});

describe("hub com fonte de agenda externa (Minha Agenda)", () => {
  test("o cartão Disponibilidade não existe — a agenda externa é dona dos horários", () => {
    render(
      <SettingsHub
        settings={settingsFixture({
          calendar: {
            capabilities: {
              createAppointments: true,
              manageAvailability: false,
              manageCustomers: true,
              manageServices: true,
              migrate: false,
            },
            integration: null,
            source: "EXTERNAL",
            timezone: "America/Sao_Paulo",
          },
        })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /Disponibilidade/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Agenda/ })).toHaveTextContent(
      "Minha Agenda",
    );
    expect(cardLinks()).toHaveLength(7);
  });
});
