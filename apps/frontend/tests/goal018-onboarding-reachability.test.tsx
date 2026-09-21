// @vitest-environment jsdom
/**
 * Goal018 (WU-07) — decomposição do onboarding em módulos por bloco.
 *
 * `features/onboarding` deixou de ser dois arquivos que concentravam o fluxo
 * inteiro (`OnboardingScreen.tsx` com o protótipo e `ProductOnboardingScreen.tsx`
 * com produto + persistência + navegação) e passou a ser um despachante
 * (`OnboardingScreen.tsx`) que delega corpo e persistência a
 * `features/onboarding/blocks/*`, um por bloco do vault.
 *
 * Esta suíte prova alcançabilidade pelo que o usuário encontra: a rota real
 * (`app/onboarding/[step]/page.tsx`) monta cada cenário sobrevivente, e cada
 * etapa oferece o link/submit real que leva à próxima — não apenas um import
 * de teste sem consumidor de produção.
 *
 * Cenários removidos (protótipo sem consumidor real): as 8 variações
 * `importar-*` (só existiam no fluxo do protótipo descontinuado; a
 * importação real é do Goal019) e as 13 variações `minha-agenda-*`, incluindo
 * `minha-agenda-conectar` (Goal027: a Atendly é a única fonte oficial, então
 * "Minha Agenda" deixou de ser uma escolha de agenda — só sobrevive como
 * importação única em `agenda-atendly-metodo`). `onboardingOrder` e
 * `generateStaticParams` não geram mais rota estática para nenhum desses 21
 * cenários.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();
const listConversations = vi.fn();
const setIgnoredConversation = vi.fn();
const ignoreByPhone = vi.fn();
const getActivationTest = vi.fn();
const startActivationTest = vi.fn();
const restartActivationTest = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: restartActivationTest,
      start: startActivationTest,
    },
    auth: { logout },
    conversations: {
      ignoreByPhone,
      list: listConversations,
      setIgnored: setIgnoredConversation,
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import OnboardingPage from "@/app/onboarding/[step]/page";
import { onboardingError } from "@/features/onboarding/blocks/registry";
import {
  nextRequiredStep,
  OnboardingRuntimeProvider,
} from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import * as OnboardingScreenModule from "@/features/onboarding/OnboardingScreen";
import {
  isOnboardingScenario,
  onboardingOrder,
  onboardingScenarios,
} from "@/features/onboarding/scenarios";

function emptyState(): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

function stateFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return { ...emptyState(), ...overrides };
}

const businessDone: Partial<OnboardingState> = {
  business: {
    address: null,
    category: "Beleza",
    modalities: ["ONLINE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};
const calendarDone = {
  calendar: {
    integration: null,
    source: "ATENDLY" as const,
    timezone: "America/Sao_Paulo",
  },
};
const serviceDone = {
  service: {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    needsReview: false,
    price: 100,
    priceType: "FIXED" as const,
  },
};
const availabilityDone = {
  availability: {
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: [
      {
        active: true,
        dayOfWeek: 1,
        endTime: "18:00",
        id: "rule-1",
        startTime: "09:00",
      },
    ],
    timezone: "America/Sao_Paulo",
  },
};
const toneDone = { ai: { tone: "PROFESSIONAL" as const } };

function renderScreen(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  completeOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  listConversations.mockResolvedValue([]);
});

describe("cenários do protótipo sem consumidor real foram removidos", () => {
  test("nenhum dos 20 cenários órfãos continua declarado", () => {
    const removed = [
      "importar-conectar",
      "importar-analisar",
      "importar-previa",
      "importar-confirmar",
      "importar-progresso",
      "importar-sucesso",
      "importar-parcial",
      "importar-erro",
      "minha-agenda-conectar",
      "minha-agenda-introducao",
      "minha-agenda-autenticando",
      "minha-agenda-conectada",
      "minha-agenda-verificar",
      "minha-agenda-servicos",
      "minha-agenda-clientes",
      "minha-agenda-agendamentos",
      "minha-agenda-disponibilidade",
      "minha-agenda-valida",
      "minha-agenda-incompleta",
      "minha-agenda-falha",
      "minha-agenda-indisponivel",
    ];
    for (const scenario of removed) {
      expect(isOnboardingScenario(scenario)).toBe(false);
    }
    // 16 do Goal018 (Goal027 retirou `minha-agenda-conectar`) mais as cinco
    // telas do teste real (Goal019 §9).
    expect(onboardingOrder).toHaveLength(21);
  });

  test("PrototypeOnboardingScreen não existe mais no módulo despachante", () => {
    expect(Object.keys(OnboardingScreenModule)).toEqual(["OnboardingScreen"]);
  });
});

describe("todo cenário sobrevivente é montado pela rota real", () => {
  test.each(onboardingOrder)(
    "%s monta sem 404 e mostra seu título",
    async (step) => {
      getOnboarding.mockResolvedValue(stateFixture());
      render(
        <OnboardingRuntimeProvider>
          {await OnboardingPage({ params: Promise.resolve({ step }) })}
        </OnboardingRuntimeProvider>,
      );
      const [, title] = onboardingScenarios[step];
      expect(
        await screen.findByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
    },
  );
});

describe("o progresso nomeia o bloco corrente, sem contagem de telas", () => {
  test("dados-do-negocio mostra o bloco 'Seu negócio' e nenhuma contagem de etapas", async () => {
    renderScreen("dados-do-negocio", stateFixture());
    expect(await screen.findByText("Seu negócio")).toBeVisible();
    expect(screen.queryByText(/Etapa \d+ de \d+/)).toBeNull();
  });

  test("servico-nome mostra o bloco 'Sua agenda'", async () => {
    renderScreen(
      "servico-nome",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    expect(await screen.findByText("Sua agenda")).toBeVisible();
    expect(screen.queryByText(/Etapa \d+ de \d+/)).toBeNull();
  });

  test("tom-da-ia mostra o bloco 'Sua IA'", async () => {
    renderScreen(
      "tom-da-ia",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...availabilityDone,
      }),
    );
    expect(await screen.findByText("Sua IA")).toBeVisible();
  });

  test("whatsapp mostra o bloco 'WhatsApp'", async () => {
    renderScreen(
      "whatsapp",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...availabilityDone,
        ...toneDone,
      }),
    );
    expect(await screen.findByText("WhatsApp")).toBeVisible();
  });
});

describe("o encadeamento real de dados-do-negocio até validação", () => {
  test("dados-do-negocio salva e leva a fonte-da-agenda", async () => {
    const user = userEvent.setup();
    renderScreen("dados-do-negocio", emptyState());
    await user.type(
      await screen.findByLabelText("Nome do negócio"),
      "Studio Aurora",
    );
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.type(
      screen.getByPlaceholderText("Qual é o seu segmento?"),
      "Beleza",
    );
    await user.click(screen.getByText("Online"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Beleza",
        modalities: ["ONLINE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
    expect(push).toHaveBeenCalledWith("/onboarding/fonte-da-agenda");
  });

  test("fonte-da-agenda com Agenda Atendly volta para dados-do-negocio e avança para agenda-atendly-confirmar", async () => {
    const user = userEvent.setup();
    renderScreen("fonte-da-agenda", stateFixture(businessDone));
    expect(await screen.findByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/onboarding/dados-do-negocio",
    );

    await user.click(screen.getByRole("button", { name: /^Agenda Atendly/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(updateOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        calendar: { source: "ATENDLY", timezone: "America/Sao_Paulo" },
      }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/agenda-atendly-confirmar");
  });

  test("fonte-da-agenda sem escolher a Agenda Atendly bloqueia com erro, sem salvar", async () => {
    const user = userEvent.setup();
    renderScreen("fonte-da-agenda", stateFixture(businessDone));

    await user.click(
      await screen.findByRole("button", { name: "Continuar" }),
    );

    expect(
      await screen.findByText("Escolha uma fonte oficial para continuar."),
    ).toBeVisible();
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith("/onboarding/agenda-atendly-confirmar");
  });

  test("agenda-atendly-confirmar avança para agenda-atendly-metodo", async () => {
    const user = userEvent.setup();
    renderScreen(
      "agenda-atendly-confirmar",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/agenda-atendly-metodo");
  });

  test("agenda-atendly-metodo avança para servico-nome", async () => {
    const user = userEvent.setup();
    renderScreen(
      "agenda-atendly-metodo",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/servico-nome");
  });

  test("agenda-atendly-metodo oferece as duas opções como escolha real, sem promessa de habilitação futura", async () => {
    const user = userEvent.setup();
    renderScreen(
      "agenda-atendly-metodo",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    expect(
      screen.queryByText("A importação única será habilitada no fluxo de migração."),
    ).not.toBeInTheDocument();

    const scratch = await screen.findByRole("button", {
      name: /Começar do zero/,
    });
    const imported = screen.getByRole("button", {
      name: /Importar do Minha Agenda/,
    });
    expect(scratch.className).toContain("is-selected");
    expect(imported.className).not.toContain("is-selected");

    await user.click(imported);
    expect(imported.className).toContain("is-selected");
    expect(scratch.className).not.toContain("is-selected");
    expect(
      screen.getByText(/A importação acontece depois, em Configurações/),
    ).toBeInTheDocument();

    // Continua alcançando servico-nome independente da escolha (Goal020/WU-09).
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/servico-nome");
  });

  test("servico-nome salva e avança para servico-duracao", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servico-nome",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.type(
      await screen.findByLabelText("Nome do serviço"),
      "Corte feminino",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/servico-duracao");
  });

  test("servico-duracao avança para servico-preco", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servico-duracao",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    const input = await screen.findByLabelText("Duração em minutos");
    await user.clear(input);
    await user.type(input, "45");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/servico-preco");
  });

  test("servico-preco salva preço fixo e avança para dias-de-atendimento", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servico-preco",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.type(await screen.findByLabelText("Preço em reais"), "150");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { service: { price: number; priceType: string } },
    ];
    expect(patch.service.price).toBe(150);
    expect(patch.service.priceType).toBe("FIXED");
    expect(push).toHaveBeenCalledWith("/onboarding/dias-de-atendimento");
  });

  test("dias-de-atendimento com dias padrão avança para horarios", async () => {
    const user = userEvent.setup();
    renderScreen(
      "dias-de-atendimento",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/horarios");
  });

  test("horarios salva a disponibilidade e avança para agenda-atendly-pronta", async () => {
    const user = userEvent.setup();
    renderScreen(
      "horarios",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: unknown },
    ];
    expect(patch.availability).toBeDefined();
    expect(push).toHaveBeenCalledWith("/onboarding/agenda-atendly-pronta");
  });

  test("agenda-atendly-pronta avança para demonstracao-da-ia", async () => {
    const user = userEvent.setup();
    renderScreen(
      "agenda-atendly-pronta",
      stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/demonstracao-da-ia");
  });

  test("demonstracao-da-ia sem serviço operacional nem horário válido explica o que falta, sem oferecer a demonstração", async () => {
    renderScreen("demonstracao-da-ia", stateFixture());
    expect(
      await screen.findByText(
        "Configure um serviço ativo com duração definida e um horário de atendimento configurado para ver a demonstração da IA.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/simulado/u)).toBeNull();
  });

  test("demonstracao-da-ia com serviço e horário reais mostra a demonstração simulada com o preço e o horário reais, e avança para tom-da-ia sem escrever nem enviar", async () => {
    const user = userEvent.setup();
    renderScreen(
      "demonstracao-da-ia",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...availabilityDone,
      }),
    );
    expect(
      await screen.findByText("Demonstração simulada", { exact: false }),
    ).toBeVisible();
    expect(screen.getByText("O Corte custa R$ 100,00.")).toBeVisible();
    expect(screen.getAllByText(/09:00/u).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(push).toHaveBeenCalledWith("/onboarding/tom-da-ia");
    // A demonstração é simulada: nenhuma escrita nem porta de envio.
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("tom-da-ia salva o estilo escolhido e avança para whatsapp", async () => {
    const user = userEvent.setup();
    renderScreen(
      "tom-da-ia",
      stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Profissional/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(updateOnboarding).toHaveBeenCalledWith({
      ai: { tone: "PROFESSIONAL" },
    });
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp");
  });

  test("whatsapp mostra a orientação sobre número pessoal e avança para whatsapp-conectar", async () => {
    const user = userEvent.setup();
    renderScreen(
      "whatsapp",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
      }),
    );
    expect(
      await screen.findByText(
        "Você pode usar um número de WhatsApp pessoal ou comercial.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A Atendly organiza todas as suas conversas automaticamente.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Você pode desativar a IA para pessoas específicas, como família e amigos.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Quando você responde uma conversa manualmente, a IA sai de cena.",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Conectar meu WhatsApp" }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp-conectar");
  });

  test("whatsapp: Fazer isso depois conclui o onboarding e leva a whatsapp-concluido", async () => {
    const user = userEvent.setup();
    renderScreen(
      "whatsapp",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Fazer isso depois" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp-concluido");
  });

  test("whatsapp-concluido mostra a copy do vault com as duas ações", async () => {
    renderScreen(
      "whatsapp-concluido",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
      }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sua Atendly está configurada.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Conecte seu WhatsApp quando quiser colocar a IA para atender seus clientes.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Ir para o início" }),
    ).toHaveAttribute("href", "/inicio");
    expect(
      screen.getByRole("link", { name: "Conectar agora" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
  });

  test("whatsapp-conectar conectado avança para contatos-ignorados, sem concluir ainda", async () => {
    getWhatsapp.mockResolvedValue({ status: "CONNECTED" });
    const user = userEvent.setup();
    renderScreen(
      "whatsapp-conectar",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
        whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    expect(push).toHaveBeenCalledWith("/onboarding/contatos-ignorados");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("whatsapp-conectar sem conexão concluída bloqueia com erro, sem avançar", async () => {
    getWhatsapp.mockResolvedValue({ status: "PENDING" });
    const user = userEvent.setup();
    renderScreen(
      "whatsapp-conectar",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByText(
        "Conclua a vinculação no WhatsApp antes de continuar.",
      ),
    ).toBeVisible();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("contatos-ignorados: marcar uma conversa existente chama o mesmo caminho de ignore já existente", async () => {
    listConversations.mockResolvedValue([
      { id: "conv-1", externalContactId: "5511988880000", customerName: "Maria" },
    ]);
    setIgnoredConversation.mockResolvedValue({});
    const user = userEvent.setup();
    renderScreen(
      "contatos-ignorados",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
        whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
      }),
    );

    await user.click(await screen.findByRole("button", { name: "Ignorar" }));

    expect(setIgnoredConversation).toHaveBeenCalledWith("conv-1", true);
    expect(await screen.findByRole("button", { name: "Ignorado" })).toBeDisabled();
  });

  test("contatos-ignorados: marcar por telefone cria o contato e mostra a confirmação só após a resposta", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-1",
      externalContactId: "5511977770000",
      ignored: true,
      ignoredAt: new Date().toISOString(),
    });
    const user = userEvent.setup();
    renderScreen(
      "contatos-ignorados",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
        whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
      }),
    );

    expect(screen.queryByText(/ignorado/iu)).toBeNull();
    await user.type(
      await screen.findByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledWith("+55 11 97777-0000", true);
    expect(await screen.findByText("5511977770000 ignorado")).toBeVisible();
  });

  test("contatos-ignorados: pular não bloqueia e não afirma ninguém ignorado sem marcação gravada", async () => {
    const user = userEvent.setup();
    renderScreen(
      "contatos-ignorados",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
        whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Pular esta etapa" }),
    );

    expect(setIgnoredConversation).not.toHaveBeenCalled();
    expect(ignoreByPhone).not.toHaveBeenCalled();
    expect(completeOnboarding).toHaveBeenCalled();
    // Pular a etapa opcional não pula o teste real: o vault põe o teste
    // **depois** dos contatos ignorados, e é ele que ativa a IA.
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
  });

  test("contatos-ignorados: concluir configuração finaliza o onboarding", async () => {
    const user = userEvent.setup();
    renderScreen(
      "contatos-ignorados",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        ...serviceDone,
        ...toneDone,
        whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Ir para o teste" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
  });
});

describe("erro 409 ao salvar uma etapa não cita WhatsApp", () => {
  function conflictError(): BffHttpError {
    return new BffHttpError({
      code: "ONBOARDING_INCOMPLETE",
      message: "conflict",
      requestId: "req-1",
      status: 409,
    });
  }

  test("onboardingError traduz 409 para a copy de itens obrigatórios pendentes", () => {
    expect(onboardingError(conflictError())).toBe(
      "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.",
    );
  });

  test("tom-da-ia: 409 ao salvar mostra a copy de itens pendentes, sem citar WhatsApp", async () => {
    updateOnboarding.mockRejectedValueOnce(conflictError());
    const user = userEvent.setup();
    renderScreen(
      "tom-da-ia",
      stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Profissional/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText(
        "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(push).not.toHaveBeenCalledWith("/onboarding/whatsapp");
  });
});

describe("a retomada abre a próxima pendência real", () => {
  test("com o negócio pendente, a retomada não força o passo de WhatsApp", () => {
    expect(nextRequiredStep(emptyState())).toBe("dados-do-negocio");
  });

  test("com nome e categoria preenchidos mas sem modalidade escolhida, a retomada continua em dados-do-negocio", () => {
    expect(
      nextRequiredStep(
        stateFixture({
          business: {
            address: null,
            category: "Beleza",
            modalities: [],
            name: "Studio Aurora",
            timezone: "America/Sao_Paulo",
          },
          ...calendarDone,
          ...serviceDone,
          ...availabilityDone,
          ...toneDone,
          whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
        }),
      ),
    ).toBe("dados-do-negocio");
  });

  test("com ON_SITE escolhido e sem endereço, a retomada continua em dados-do-negocio", () => {
    expect(
      nextRequiredStep(
        stateFixture({
          business: {
            address: null,
            category: "Beleza",
            modalities: ["ON_SITE"],
            name: "Studio Aurora",
            timezone: "America/Sao_Paulo",
          },
          ...calendarDone,
          ...serviceDone,
          ...availabilityDone,
          ...toneDone,
          whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
        }),
      ),
    ).toBe("dados-do-negocio");
  });

  test("com tudo pendente só o WhatsApp, a próxima pendência real é whatsapp", () => {
    expect(
      nextRequiredStep(
        stateFixture({
          ...businessDone,
          ...calendarDone,
          ...serviceDone,
          ...availabilityDone,
          ...toneDone,
        }),
      ),
    ).toBe("whatsapp");
  });

  test("com disponibilidade pendente, mesmo sem WhatsApp conectado, a retomada abre dias-de-atendimento", () => {
    expect(
      nextRequiredStep(
        stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
      ),
    ).toBe("dias-de-atendimento");
  });

  test("com o WhatsApp já conectado, a retomada abre contatos-ignorados para concluir", () => {
    expect(
      nextRequiredStep(
        stateFixture({
          ...businessDone,
          ...calendarDone,
          ...serviceDone,
          ...availabilityDone,
          ...toneDone,
          whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
        }),
      ),
    ).toBe("contatos-ignorados");
  });

  test("com o estilo da IA pendente, mesmo com agenda pronta, a retomada abre demonstracao-da-ia", () => {
    expect(
      nextRequiredStep(
        stateFixture({
          ...businessDone,
          ...calendarDone,
          ...serviceDone,
          ...availabilityDone,
        }),
      ),
    ).toBe("demonstracao-da-ia");
  });
});
