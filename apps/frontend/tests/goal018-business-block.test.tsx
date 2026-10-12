// @vitest-environment jsdom
/**
 * Goal018/WU-11 — o bloco "Seu negócio" coleta segmento (frequentes + "Outro"),
 * nome, modalidades múltiplas e endereço condicional em
 * `configuracoes/negocio` (`ProductSettingsScreen`, como está, sem
 * redecomposição).
 *
 * O onboarding equivalente (`dados-do-negocio`) foi dividido em três etapas
 * (`segmento-e-nome`, `modalidade`, `endereco`) mais `boas-vindas` pelo
 * Goal065/WU-02 — a suíte antiga deste arquivo testava as quatro como uma
 * tela só e foi substituída por `goal065-onboarding-business.test.tsx`, que
 * cobre o novo encadeamento e a validação inline por campo.
 *
 * O que esta suíte prova pelo que a usuária encontra, em Configurações:
 * - nenhuma modalidade escolhida bloqueia o salvamento com uma mensagem;
 * - `ON_SITE` exige cada parte obrigatória do endereço não vazia antes de
 *   salvar;
 * - desmarcar `ON_SITE` depois de ter digitado um endereço preserva o
 *   endereço já gravado: o payload não envia `address` nem `addressParts` (§1 do Goal018:
 *   retirar ON_SITE não apaga o endereço, só deixa de exigi-lo);
 * - o payload de `updateBusiness` é exatamente o que a tela mostra, e o
 *   aviso de projeção pendente aparece quando o servidor devolve
 *   `contextProjectionStatus: "PENDING"`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SettingsState } from "@/data";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import {
  addressField,
  composedAddress,
  fillAddress,
  FLORES_ADDRESS,
  settingsAddressGroup,
} from "./support/address";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getSettings = vi.fn();
const updateBusiness = vi.fn();
const getWhatsapp = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    // Goal104: o resumo de "O que a IA sabe responder" lê a base; sem ela, a linha fica sem valor.
    knowledge: {
      getOtherInfo: () => Promise.reject(new Error("fora do escopo")),
      list: () => Promise.reject(new Error("fora do escopo")),
    },
    settings: { get: getSettings, updateBusiness },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: { businessProfile: { businessName: "Studio Marina" } },
    setUnauthenticated: vi.fn(),
  }),
}));

function settingsFixture(
  overrides: Partial<NonNullable<SettingsState["business"]>> = {},
): SettingsState {
  return {
    ai: { enabled: false, tone: null },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: [],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
      ...overrides,
    },
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
      timezone: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshSession.mockResolvedValue(null);
  getWhatsapp.mockResolvedValue(null);
});

describe("configurações/negocio: BusinessSettings dentro de ProductSettingsScreen", () => {
  async function renderSettings(
    fixture: SettingsState = settingsFixture({ modalities: ["ONLINE"] }),
  ) {
    getSettings.mockResolvedValue(fixture);
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="business" />
      </ShellConfigProvider>,
    );
    // Goal088 (N1): o editor abre sob demanda pela linha com `›`.
    await user.click(await screen.findByRole("button", { name: /^Nome/ }));
    await screen.findByLabelText("Nome do negócio");
    return user;
  }

  test("segmento oferece frequentes mais 'Outro' com texto livre", async () => {
    await renderSettings(
      settingsFixture({ category: "Cabelo", modalities: ["ONLINE"] }),
    );
    expect(screen.getByRole("button", { name: "Cabelo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Barbearia" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Outro" })).toBeVisible();
    expect(
      screen.queryByPlaceholderText("Qual é o seu segmento?"),
    ).toBeNull();
  });

  test("sem modalidade escolhida, bloqueia o salvamento com mensagem", async () => {
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText("Escolha ao menos uma modalidade de atendimento."),
    ).toBeVisible();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço só espaços bloqueia o salvamento com mensagem", async () => {
    // Mesmo raciocínio do onboarding: `required` já barra vazio, então a
    // prova do trim() usa partes só de espaços.
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    const group = await settingsAddressGroup();
    await fillAddress(
      user,
      {
        ...FLORES_ADDRESS,
        city: "   ",
        district: "   ",
        number: "   ",
        street: "   ",
      },
      group,
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    // `noValidate` com erro abaixo de cada campo, igual ao onboarding: o
    // padrão "não só espaços" de cada parte barra o envio com mensagem
    // própria, sem o balão nativo do navegador.
    expect(addressField("Rua", group)).toHaveAccessibleDescription(
      "Informe a rua.",
    );
    expect(addressField("Número", group)).toHaveAccessibleDescription(
      "Informe o número.",
    );
    expect(addressField("Bairro", group)).toHaveAccessibleDescription(
      "Informe o bairro.",
    );
    expect(addressField("Cidade", group)).toHaveAccessibleDescription(
      "Informe a cidade.",
    );
    expect(addressField("Rua", group)).toHaveAttribute("aria-invalid", "true");
    expect(addressField("Rua", group)).toHaveFocus();
    expect(addressField("CEP", group)).not.toHaveAttribute("aria-invalid");
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço envia o payload exato a updateBusiness e mostra confirmação", async () => {
    updateBusiness.mockResolvedValue(
      settingsFixture({
        address: composedAddress(FLORES_ADDRESS),
        addressParts: FLORES_ADDRESS,
        modalities: ["ON_SITE"],
      }),
    );
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    await fillAddress(
      user,
      { ...FLORES_ADDRESS, complement: " Sala 2 ", street: " Rua das Flores " },
      await settingsAddressGroup(),
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateBusiness).toHaveBeenCalledWith({
        addressParts: {
          city: "São Paulo",
          complement: "Sala 2",
          district: "Centro",
          number: "100",
          postalCode: "01310100",
          state: "SP",
          street: "Rua das Flores",
        },
        category: "Beleza",
        modalities: ["ON_SITE"],
        name: "Studio Marina",
        timezone: "America/Sao_Paulo",
      }),
    );
    expect(await screen.findByText("Dados do negócio salvos.")).toBeVisible();
  });

  test("desmarcar ON_SITE depois de digitar o endereço envia updateBusiness sem a chave address", async () => {
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    await fillAddress(user, FLORES_ADDRESS, await settingsAddressGroup());
    // Desmarca ON_SITE e escolhe Online no lugar.
    await user.click(screen.getByText("Local próprio"));
    await user.click(screen.getByText("Online"));
    expect(
      screen.queryByRole("group", { name: "Endereço do seu espaço" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateBusiness).toHaveBeenCalled());
    expect(updateBusiness).toHaveBeenCalledWith({
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    });
    // Nem o texto nem as partes: o endereço gravado fica como está.
    const payload: unknown = updateBusiness.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("address");
    expect(payload).not.toHaveProperty("addressParts");
  });

  test("aviso de projeção pendente aparece quando o servidor devolve PENDING após salvar", async () => {
    updateBusiness.mockResolvedValue(
      settingsFixture({
        contextProjectionStatus: "PENDING",
        modalities: ["ONLINE"],
      }),
    );
    const user = await renderSettings();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText(
        "Os dados do negócio foram salvos. A IA ainda está atualizando o contexto com essa mudança.",
      ),
    ).toBeVisible();
  });
});
