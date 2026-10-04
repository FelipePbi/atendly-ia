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
 * importação única, hoje nas etapas `quando-importar` e `importacao` do
 * Goal066). `onboardingOrder` e
 * `generateStaticParams` não geram mais rota estática para nenhum desses 21
 * cenários.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
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
const listServiceCatalog = vi.fn();
const createServiceCatalog = vi.fn();
const getImportState = vi.fn();

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
    // A etapa `importacao` (Goal066) só lê o estado da importação ao montar.
    migration: { getImportState },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    serviceCatalog: { create: createServiceCatalog, list: listServiceCatalog },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: ({
    consentPhase,
  }: {
    consentPhase?: {
      phase: "connect" | "consent";
      onConsentReadyChange: (ready: boolean) => void;
    };
  }) => (
    <div>
      Painel de conexão do WhatsApp
      {consentPhase?.phase === "consent" && (
        <button
          type="button"
          onClick={() => consentPhase.onConsentReadyChange(true)}
        >
          Aceitar consentimento
        </button>
      )}
    </div>
  ),
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
    source: "AVENLY" as const,
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
    customerChangeMinNoticeMinutes: 0,
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
  listServiceCatalog.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
  getImportState.mockResolvedValue({
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  });
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
    // telas do teste real (Goal019 §9); Goal065/WU-02 trocou
    // "dados-do-negocio" por quatro etapas (boas-vindas, segmento-e-nome,
    // modalidade, endereco), net +3. Goal065/WU-03 juntou "servico-nome",
    // "servico-duracao" e "servico-preco" numa etapa só e acrescentou
    // "servicos-adicionais", net -1. Goal066/WU-01 trocou "fonte-da-agenda",
    // "agenda-atendly-confirmar" e "agenda-atendly-metodo" por
    // "sistema-atual" e "quando-importar", net -1; e Goal066/WU-02
    // acrescentou "importacao", net +1.
    expect(onboardingOrder).toHaveLength(23);
  });

  test("PrototypeOnboardingScreen não existe mais no módulo despachante", () => {
    expect(Object.keys(OnboardingScreenModule)).toEqual(["OnboardingScreen"]);
  });
});

describe("todo cenário sobrevivente é montado pela rota real", () => {
  test.each(onboardingOrder)(
    "%s monta sem 404 e mostra seu título",
    async (step) => {
      // "importacao" só abre com a fonte da agenda gravada (Goal072).
      getOnboarding.mockResolvedValue(
        step === "importacao"
          ? stateFixture({ ...businessDone, ...calendarDone })
          : stateFixture(),
      );
      render(
        <OnboardingRuntimeProvider>
          {await OnboardingPage({ params: Promise.resolve({ step }) })}
        </OnboardingRuntimeProvider>,
      );
      // Goal099/WU-02: whatsapp-conectar abre na fase de consentimento.
      // Goal105: importacao abre na origem, cujo h1 vem do módulo de
      // importação, não do título do cenário.
      const title =
        step === "whatsapp-conectar"
          ? "Antes de conectar"
          : step === "importacao"
            ? "De onde vamos trazer seus dados?"
            : onboardingScenarios[step][1];
      expect(
        await screen.findByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
    },
  );
});

describe("o progresso nomeia o bloco corrente, sem contagem de telas", () => {
  // O trilho e a barra segmentada repetem os quatro nomes (Goal072); o bloco
  // corrente é o item da barra segmentada com aria-current="step" (Goal089: a
  // barra não escreve mais o nome, só preenche o segmento).
  const currentBlock = () =>
    within(
      screen.getByRole("group", { name: "Progresso da configuração inicial" }),
    ).getByRole("listitem", { current: "step" });

  test("boas-vindas não tem barra de progresso nem bloco corrente, e nenhuma contagem de etapas", async () => {
    renderScreen("boas-vindas", stateFixture());
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.queryByRole("group", { name: "Progresso da configuração inicial" }),
    ).toBeNull();
    expect(screen.queryByText(/Etapa \d+ de \d+/)).toBeNull();
  });

  test("servico-nome mostra o bloco 'Sua agenda'", async () => {
    renderScreen(
      "servico-nome",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await screen.findByRole("heading", { level: 1 });
    expect(currentBlock()).toHaveAccessibleName("Sua agenda");
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
    await screen.findByRole("heading", { level: 1 });
    expect(currentBlock()).toHaveAccessibleName("Sua IA");
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
    await screen.findByRole("heading", { level: 1 });
    expect(currentBlock()).toHaveAccessibleName("WhatsApp");
  });
});

describe("o encadeamento real de boas-vindas a endereco até validação", () => {
  // Goal065/WU-02: "dados-do-negocio" virou boas-vindas + segmento-e-nome +
  // modalidade + endereco. O encadeamento completo e a validação inline por
  // campo têm sua própria suíte em `goal065-onboarding-business.test.tsx`;
  // aqui fica só a prova de alcançabilidade da rota seguinte, "sistema-atual".
  //
  // Goal066/WU-01 substituiu "fonte-da-agenda", "agenda-atendly-confirmar" e
  // "agenda-atendly-metodo" por "sistema-atual" e "quando-importar". Os
  // cinco testes que cobriam essas três telas foram substituídos pela suíte
  // "goal066-onboarding-sistema-atual.test.tsx", que prova a mesma
  // alcançabilidade para as etapas novas:
  // - "fonte-da-agenda com Agenda Atendly volta para modalidade…": "Voltar
  //   aponta para modalidade sem ON_SITE" e "'Não, começar do zero' grava
  //   calendar.source…";
  // - "fonte-da-agenda sem escolher a Agenda Atendly bloqueia…": "não
  //   oferece Continuar" (não há mais escolha a esquecer: o card é a ação);
  // - "agenda-atendly-confirmar avança para agenda-atendly-metodo": "'Sim,
  //   quero importar' só navega para quando-importar…";
  // - "agenda-atendly-metodo avança para servico-nome": "'Fazer depois'
  //   grava calendar.source e só avança para servico-nome com 200";
  // - "agenda-atendly-metodo oferece as duas opções…": "mostra a pergunta do
  //   vault e os dois cards, nenhum marcado…", "servicePopulation e o aviso
  //   antigo de importação saíram…" e "'Importar agora' grava calendar.source,
  //   relê o onboarding e só então monta a etapa importacao".

  test("servico-nome (primeiro serviço) salva nome, duração e preço numa etapa só e avança para servicos-adicionais", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servico-nome",
      stateFixture({ ...businessDone, ...calendarDone }),
    );
    await user.type(
      await screen.findByLabelText("Nome do serviço"),
      "Corte feminino",
    );
    const durationInput = screen.getByLabelText("Duração em minutos");
    await user.clear(durationInput);
    await user.type(durationInput, "45");
    await user.type(screen.getByLabelText("Preço em reais"), "150");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      {
        service: {
          durationMinutes: number;
          name: string;
          price: number;
          priceType: string;
        };
      },
    ];
    expect(patch.service.name).toBe("Corte feminino");
    expect(patch.service.durationMinutes).toBe(45);
    expect(patch.service.price).toBe(150);
    expect(patch.service.priceType).toBe("FIXED");
    expect(push).toHaveBeenCalledWith("/onboarding/servicos-adicionais");
  });

  test("servico-nome com um serviço já lido como STARTING_AT grava o mesmo tipo, sem conversão", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servico-nome",
      stateFixture({
        ...businessDone,
        ...calendarDone,
        service: {
          active: true,
          bufferAfterMinutes: 0,
          bufferBeforeMinutes: 0,
          durationMinutes: 45,
          id: "svc-1",
          name: "Corte",
          needsReview: false,
          price: 80,
          priceType: "STARTING_AT",
        },
      }),
    );
    expect(
      await screen.findByRole("button", { name: "A partir de" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { service: { priceType: string } },
    ];
    expect(patch.service.priceType).toBe("STARTING_AT");
  });

  test("servicos-adicionais avança para dias-de-atendimento sem exigir nenhum adicional", async () => {
    const user = userEvent.setup();
    renderScreen(
      "servicos-adicionais",
      stateFixture({ ...businessDone, ...calendarDone, ...serviceDone }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(updateOnboarding).not.toHaveBeenCalled();
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

  test("demonstracao-da-ia com serviço e horário reais mostra a conversa com o preço e os horários reais, e avança para tom-da-ia sem escrever nem enviar", async () => {
    // Com prefers-reduced-motion a conversa abre inteira, com o Continuar
    // (Goal079); a sequência item a item é provada em goal079-onboarding-demo.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      }),
      writable: true,
    });
    try {
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
        await screen.findByRole("log", { name: "Conversa de exemplo da IA" }),
      ).toBeVisible();
      expect(
        screen.getByText("Corte custa R$ 100,00.", { exact: false }),
      ).toBeVisible();
      expect(
        screen.getByText(/Tenho segunda às 9h, 13h ou 17h\./u),
      ).toBeVisible();

      // "Continuar" entra num efeito depois da conversa: espera, não afirma.
      await user.click(await screen.findByRole("button", { name: "Continuar" }));

      expect(push).toHaveBeenCalledWith("/onboarding/tom-da-ia");
      // A demonstração é simulada: nenhuma escrita nem porta de envio.
      expect(updateOnboarding).not.toHaveBeenCalled();
      expect(completeOnboarding).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
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
    await user.click(
      screen.getByRole("button", { name: "Continuar com Profissional" }),
    );

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
    expect(await screen.findByText("Só um número por negócio.")).toBeVisible();
    expect(
      screen.getByText("Suas conversas ficam organizadas aqui."),
    ).toBeVisible();
    expect(
      screen.getByText("quem a IA nunca responde", { selector: "strong" }),
    ).toBeVisible();
    expect(
      screen.getByText("você responde", { selector: "strong" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Conectar meu WhatsApp" }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp-conectar");
  });

  test("whatsapp: Fazer isso depois leva a whatsapp-concluido sem concluir o onboarding ainda", async () => {
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

    // A conclusão fica para o CTA de whatsapp-concluido (Goal063): até lá a
    // pessoa ainda pode voltar e conectar.
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp-concluido");
  });

  test("whatsapp-concluido mostra a copy do vault com as duas ações, e o CTA de início conclui o onboarding", async () => {
    const user = userEvent.setup();
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
    // Goal071/WU-03: "Conectar agora" volta à etapa do onboarding — a
    // conclusão sem WhatsApp continua só em "Ir para o início".
    expect(
      screen.getByRole("link", { name: "Conectar agora" }),
    ).toHaveAttribute("href", "/onboarding/whatsapp");

    await user.click(
      screen.getByRole("button", { name: "Ir para o início" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
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
    await user.click(
      await screen.findByRole("button", { name: "Aceitar consentimento" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Aceitar consentimento" }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

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
    // Fase de consentimento (Goal099/WU-02): aceite e resposta liberam o
    // "Continuar", que só abre a fase de conexão. O avanço continua exigindo
    // CONNECTED; a fase de conexão traz o "Continuar" que valida.
    await user.click(
      await screen.findByRole("button", { name: "Aceitar consentimento" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Aceitar consentimento" }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
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
    // Nem pular nem continuar concluem o onboarding aqui (Goal063): só o
    // teste real que termina bem ativa a IA e conclui.
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
  });

  test("contatos-ignorados: Ir para o teste avança sem concluir o onboarding", async () => {
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

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
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
    await user.click(
      screen.getByRole("button", { name: "Continuar com Profissional" }),
    );

    expect(
      await screen.findByText(
        "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.",
      ),
    ).toBeVisible();
    // O trilho do progresso nomeia o capítulo "WhatsApp"; a copy do erro não.
    expect(screen.getByRole("alert")).not.toHaveTextContent(/WhatsApp/);
    expect(push).not.toHaveBeenCalledWith("/onboarding/whatsapp");
  });
});

describe("a retomada abre a próxima pendência real", () => {
  // Goal065/WU-02: "dados-do-negocio" virou boas-vindas (sem gravação) +
  // segmento-e-nome + modalidade + endereco. Business é gravado atômico
  // (nome+categoria+timezone sempre juntos), então "sem nome" é o único
  // estado que volta a boas-vindas — as pendências mais avançadas do mesmo
  // bloco resumem direto na etapa pendente real.
  test("com o negócio pendente, a retomada não força o passo de WhatsApp", () => {
    expect(nextRequiredStep(emptyState())).toBe("boas-vindas");
  });

  test("com nome e categoria preenchidos mas sem modalidade escolhida, a retomada continua em modalidade", () => {
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
    ).toBe("modalidade");
  });

  test("com ON_SITE escolhido e sem endereço, a retomada continua em endereco", () => {
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
    ).toBe("endereco");
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
