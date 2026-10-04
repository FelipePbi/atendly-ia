// @vitest-environment jsdom
/**
 * Goal071/WU-02: o painel de conexão do WhatsApp (onboarding e Configurações,
 * o mesmo componente para os dois) exige consentimento e resposta sobre
 * número pessoal antes de qualquer `connect`/`reconnect`, sempre com
 * `consentAccepted: true`; a visão de QR relê `GET /v1/whatsapp/qr` num
 * relógio próprio (menor que o giro, sem leitura concorrente, pausado com a
 * aba oculta, dentro de uma janela declarada) e nunca mostra "Conectando"
 * nem "Aguardando conexão" depois de expirar; a visão de código copia,
 * numera cinco passos e regenera com o mesmo número.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type WhatsAppConnection } from "@/data";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";

import { expectNoA11yViolations } from "./support/a11y";

const whatsappGet = vi.fn();
const whatsappConnect = vi.fn();
const whatsappReconnect = vi.fn();
const whatsappQr = vi.fn();
const whatsappDisconnect = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    whatsapp: {
      connect: whatsappConnect,
      disconnect: whatsappDisconnect,
      get: whatsappGet,
      qr: whatsappQr,
      reconnect: whatsappReconnect,
    },
  }),
}));

function connectionFixture(
  overrides: Partial<WhatsAppConnection> = {},
): WhatsAppConnection {
  return {
    connectedAt: null,
    id: "wa-1",
    phoneNumber: null,
    status: "WAITING_QR",
    updatedAt: "2026-09-27T12:00:00.000Z",
    ...overrides,
  };
}

const PHONE_FORMAT_ERROR =
  "Digite o número com DDD, só com números. Exemplo: 11999990000.";

const CONSENT_TEXT =
  "Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Avenly.";

async function acceptConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
}

/**
 * Com timers falsos, `userEvent` trava esperando um `setTimeout` real que
 * nunca dispara: as suítes de renovação (relógio simulado) dirigem os campos
 * por `fireEvent`, que não depende do relógio.
 */
function acceptConsentSync() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
}

/**
 * `vi.advanceTimersByTimeAsync(0)` só esvazia promessas presas atrás de um
 * timer que de fato dispara nessa janela; uma cadeia de `await` sem timer
 * no meio (como a resposta mockada de `connect`) precisa de mais de uma
 * volta do laço de microtarefas. Mesma receita de `flushUntilFirstRead` em
 * `goal020-import-run.test.tsx`.
 */
async function flushMicrotasks(times = 10) {
  for (let tick = 0; tick < times; tick += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  whatsappGet.mockResolvedValue(null);
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }) as MediaQueryList;
  }
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("consentimento obrigatório", () => {
  test("connect nunca é chamado antes do checkbox e da resposta escolhida, e sempre envia consentAccepted: true", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    const cta = await screen.findByRole("button", { name: "Conectar WhatsApp" });
    expect(cta).toBeDisabled();
    // O rótulo do checkbox é a própria frase exigida, e começa desmarcado;
    // nenhuma das duas respostas vem pré-marcada.
    expect(screen.getByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Sim, também" })).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Não, só trabalho" }),
    ).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Saiba mais" })).toHaveAttribute(
      "href",
      "/politica-de-privacidade",
    );

    await user.click(screen.getByRole("checkbox"));
    expect(cta).toBeDisabled();
    expect(whatsappConnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
    expect(cta).toBeEnabled();

    whatsappConnect.mockResolvedValue({
      connection: connectionFixture(),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });

    await user.click(cta);

    expect(whatsappConnect).toHaveBeenCalledTimes(1);
    expect(whatsappConnect).toHaveBeenCalledWith(
      expect.objectContaining({ consentAccepted: true, mode: "QR" }),
    );
  });

  test("resposta 'Sim, também' revela o bloco de controle", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    await screen.findByRole("button", { name: "Conectar WhatsApp" });
    expect(
      screen.queryByText(/você continua no controle/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Sim, também" }));

    expect(
      screen.getByText(/você continua no controle/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sim, também" })).toBeChecked();
  });

  test("resposta 'Não, só trabalho' não revela o bloco de controle", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    await screen.findByRole("button", { name: "Conectar WhatsApp" });
    await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));

    expect(screen.getByRole("radio", { name: "Não, só trabalho" })).toBeChecked();
    expect(
      screen.queryByText(/você continua no controle/i),
    ).not.toBeInTheDocument();

    // Trocar de "Sim" para "Não" também esconde o bloco.
    await user.click(screen.getByRole("radio", { name: "Sim, também" }));
    expect(screen.getByText(/você continua no controle/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
    expect(
      screen.queryByText(/você continua no controle/i),
    ).not.toBeInTheDocument();
  });

  test("checkbox e respostas são controles nativos alcançáveis pelo teclado, sem violação de acessibilidade", async () => {
    const user = userEvent.setup();
    const { container } = render(<WhatsAppConnectionPanel />);
    await screen.findByRole("button", { name: "Conectar WhatsApp" });

    const checkbox = screen.getByRole("checkbox", { name: CONSENT_TEXT });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();

    await user.tab();
    expect(screen.getByRole("link", { name: "Saiba mais" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Sim, também" })).toHaveFocus();

    await expectNoA11yViolations(container);
  });

  test("com o número conectado, o painel não mostra o consentimento", async () => {
    whatsappGet.mockResolvedValue(
      connectionFixture({ phoneNumber: "5511987654321", status: "CONNECTED" }),
    );
    render(<WhatsAppConnectionPanel />);

    expect(await screen.findByText("WhatsApp conectado")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/você usa esse número também/i),
    ).not.toBeInTheDocument();
  });

  test("antes da primeira leitura de status, nem consentimento nem CTA: só o carregamento", async () => {
    let resolveStatus: (value: WhatsAppConnection | null) => void = () => {};
    whatsappGet.mockImplementationOnce(
      () => new Promise((resolve) => (resolveStatus = resolve)),
    );
    const { container } = render(<WhatsAppConnectionPanel />);

    // A leitura já saiu e não voltou: o painel não sabe se o número conecta.
    await vi.waitFor(() => expect(whatsappGet).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(primaryButtons()).toHaveLength(0);

    // Número já conectado: a tela vai direto ao conectado, sem nunca ter
    // mostrado o consentimento.
    resolveStatus(
      connectionFixture({ phoneNumber: "5511987654321", status: "CONNECTED" }),
    );
    expect(await screen.findByText("WhatsApp conectado")).toBeVisible();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("falha na primeira leitura de status oferece tentar de novo, sem consentimento", async () => {
    whatsappGet.mockRejectedValueOnce(new Error("rede instável"));
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    expect(
      await screen.findByText("Não foi possível verificar a conexão."),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(primaryButtons()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("button", { name: "Conectar WhatsApp" }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(whatsappGet).toHaveBeenCalledTimes(2);
  });

  test("reconectar (número já vinculado antes) também exige consentimento e chama reconnect", async () => {
    whatsappGet.mockResolvedValue(
      connectionFixture({ status: "DISCONNECTED" }),
    );
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);

    const cta = await screen.findByRole("button", {
      name: "Reconectar WhatsApp",
    });
    expect(cta).toBeDisabled();

    await acceptConsent(user);
    expect(cta).toBeEnabled();

    whatsappReconnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });
    await user.click(cta);

    expect(whatsappReconnect).toHaveBeenCalledWith(
      expect.objectContaining({ consentAccepted: true }),
    );
    expect(whatsappConnect).not.toHaveBeenCalled();
  });
});

describe("renovação do QR", () => {
  test("o src troca sozinho, pausa com a aba oculta, retoma visível e termina na janela declarada", async () => {
    vi.useFakeTimers();
    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();

    acceptConsentSync();
    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();

    const image = screen.getByAltText("QR Code para vincular o WhatsApp");
    expect(image.getAttribute("src")).toContain("qr-1");
    expect(whatsappQr).not.toHaveBeenCalled();

    // Renovação sozinha: o serviço devolve um QR novo sem nenhuma ação da pessoa.
    whatsappQr.mockResolvedValueOnce({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-2",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByAltText("QR Code para vincular o WhatsApp")
        .getAttribute("src"),
    ).toContain("qr-2");

    // Aba oculta: nenhuma leitura nova, mesmo passando o intervalo inteiro.
    setVisibility("hidden");
    whatsappQr.mockResolvedValueOnce({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-3",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);

    // Volta a ficar visível: retoma exatamente aí, sem esperar o intervalo inteiro de novo.
    setVisibility("visible");
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(2);

    // Nunca chega ao fim de uma janela de 5 minutos sem expirar.
    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-4",
    });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Gerar novo QR Code" })).toBeVisible();
    expect(screen.queryByText("Conectando")).not.toBeInTheDocument();
    expect(screen.queryByText("Aguardando conexão")).not.toBeInTheDocument();
  });

  test("recusa WHATSAPP_QR_NOT_IN_PROGRESS expira a tela imediatamente", async () => {
    vi.useFakeTimers();
    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();

    acceptConsentSync();
    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByAltText("QR Code para vincular o WhatsApp");

    whatsappQr.mockRejectedValueOnce(
      new BffHttpError({
        code: "WHATSAPP_QR_NOT_IN_PROGRESS",
        message: "There is no WhatsApp QR pairing in progress for this business.",
        requestId: "req-1",
        status: 409,
      }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();

    expect(screen.getByText("O QR Code expirou.")).toBeVisible();
    expect(screen.queryByText("Conectando")).not.toBeInTheDocument();
    expect(screen.queryByText("Aguardando conexão")).not.toBeInTheDocument();
  });

  test("conectar durante a espera para a renovação e nunca mais lê o QR", async () => {
    vi.useFakeTimers();
    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();

    acceptConsentSync();
    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByAltText("QR Code para vincular o WhatsApp");

    whatsappQr.mockResolvedValueOnce({
      connection: connectionFixture({
        status: "CONNECTED",
        phoneNumber: "5511987654321",
      }),
      qrcode: null,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();

    expect(screen.getByText("WhatsApp conectado")).toBeVisible();
    const callsAfterConnect = whatsappQr.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await flushMicrotasks();
    expect(whatsappQr.mock.calls.length).toBe(callsAfterConnect);
  });

  test("desmontar para a renovação", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();

    acceptConsentSync();
    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByAltText("QR Code para vincular o WhatsApp");

    unmount();
    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-2",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(whatsappQr).not.toHaveBeenCalled();
  });

  test("sem leitura concorrente: voltar a ficar visível com uma leitura em voo não abre uma segunda", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    // A primeira leitura fica em voo até o teste resolvê-la.
    let resolveFirst: (value: unknown) => void = () => {};
    whatsappQr.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);

    // Oculta e volta a ficar visível com a leitura ainda em voo.
    setVisibility("hidden");
    setVisibility("visible");
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);

    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-next",
    });
    resolveFirst({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-2",
    });
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);

    // Uma cadeia só: um intervalo, uma leitura.
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(3);
  });

  test("qrcode: null persistente além de um giro leva a 'O QR Code expirou'", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: null,
    });
    // Aos 15 s o QR lido no início ainda tem menos de um giro de idade.
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Aguardando conexão")).toBeVisible();

    // Aos 20 s completa um giro sem QR novo: expira.
    await vi.advanceTimersByTimeAsync(5_000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Gerar novo QR Code" }),
    ).toBeVisible();
    expect(
      screen.queryByAltText("QR Code para vincular o WhatsApp"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Aguardando conexão")).not.toBeInTheDocument();
    expect(screen.queryByText("Conectando")).not.toBeInTheDocument();
  });

  test("falha transitória nunca deixa na tela um QR com mais de um giro de idade", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    whatsappQr.mockRejectedValue(new Error("rede instável"));
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    // Falhou dentro do giro: o QR de 15 s ainda vale.
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-1");

    await vi.advanceTimersByTimeAsync(5_000);
    await flushMicrotasks();
    expect(
      screen.queryByAltText("QR Code para vincular o WhatsApp"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();
    expect(screen.queryByText("Aguardando conexão")).not.toBeInTheDocument();

    // Expirado, a tela para de reler.
    const callsAfterExpiry = whatsappQr.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(whatsappQr.mock.calls.length).toBe(callsAfterExpiry);
  });

  test("leitura em voo quando o giro expira a tela nunca toca a vinculação seguinte", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    // A leitura dos 15 s fica em voo além do giro (mais de 5 s).
    let resolveStale: (value: unknown) => void = () => {};
    whatsappQr.mockImplementationOnce(
      () => new Promise((resolve) => (resolveStale = resolve)),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr).toHaveBeenCalledTimes(1);

    // Aos 20 s o giro expira a tela com a leitura ainda em voo.
    await vi.advanceTimersByTimeAsync(5_000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();

    // A pessoa abre uma vinculação nova.
    whatsappReconnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-new",
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo QR Code" }));
    await flushMicrotasks();
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-new");

    // A leitura velha volta sem QR: não expira a vinculação nova.
    resolveStale({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: null,
    });
    await flushMicrotasks();
    expect(screen.queryByText("O QR Code expirou.")).not.toBeInTheDocument();
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-new");

    // A vinculação nova segue no próprio relógio: a leitura dela aos 15 s
    // renova o QR, e nada da cadeia velha sobra para expirá-la depois.
    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-new-2",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-new-2");
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(screen.queryByText("O QR Code expirou.")).not.toBeInTheDocument();
    expect(screen.getByText("Aguardando conexão")).toBeVisible();
  });

  test("leitura em voo com QR velho não troca o QR da vinculação seguinte", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    let resolveStale: (value: unknown) => void = () => {};
    whatsappQr.mockImplementationOnce(
      () => new Promise((resolve) => (resolveStale = resolve)),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();

    whatsappReconnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-new",
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo QR Code" }));
    await flushMicrotasks();

    resolveStale({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-stale",
    });
    await flushMicrotasks();
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-new");
  });

  test("'Gerar novo QR Code' chama reconnect com consentimento e reabre a renovação", async () => {
    vi.useFakeTimers();
    await startQrLinking();

    whatsappQr.mockRejectedValueOnce(
      new BffHttpError({
        code: "WHATSAPP_QR_NOT_IN_PROGRESS",
        message: "There is no WhatsApp QR pairing in progress for this business.",
        requestId: "req-2",
        status: 409,
      }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();

    whatsappReconnect.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      expiresAt: null,
      pairingCode: null,
      qrcode: "qr-renewed",
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo QR Code" }));
    await flushMicrotasks();

    expect(whatsappReconnect).toHaveBeenCalledWith({
      consentAccepted: true,
      mode: "QR",
    });
    expect(
      screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
    ).toContain("qr-renewed");

    whatsappQr.mockResolvedValue({
      connection: connectionFixture({ status: "WAITING_QR" }),
      qrcode: "qr-renewed-2",
    });
    const callsBefore = whatsappQr.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(whatsappQr.mock.calls.length).toBe(callsBefore + 1);
  });
});

/** Consente e abre uma vinculação por QR com `qr-1` (relógio simulado). */
async function startQrLinking() {
  render(<WhatsAppConnectionPanel />);
  await flushMicrotasks();
  acceptConsentSync();
  whatsappConnect.mockResolvedValue({
    connection: connectionFixture({ status: "WAITING_QR" }),
    expiresAt: null,
    pairingCode: null,
    qrcode: "qr-1",
  });
  fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
  await flushMicrotasks();
  expect(
    screen.getByAltText("QR Code para vincular o WhatsApp").getAttribute("src"),
  ).toContain("qr-1");
}

function stubClipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

describe("visão de código", () => {
  test("copia, cinco passos, Abrir WhatsApp e Gerar novo código com o mesmo número", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();
    acceptConsentSync();
    fireEvent.click(screen.getByRole("radio", { name: "Código" }));
    fireEvent.change(screen.getByLabelText("Seu número de WhatsApp com DDD"), {
      target: { value: "11988887777" },
    });

    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "CONNECTING" }),
      expiresAt: "2026-09-27T12:05:00.000Z",
      pairingCode: "K7M2-P9QX",
      qrcode: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    // A leitura genérica de status enquanto o código aguarda (mesmo caminho
    // de detecção automática) não pode derrubar a conexão de volta a `null`.
    whatsappGet.mockResolvedValue(connectionFixture({ status: "CONNECTING" }));

    // Código como texto (selecionável), não como imagem.
    expect(screen.getByText("K7M2-P9QX").tagName).toBe("STRONG");
    expect(screen.getByText("K7M2-P9QX")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(
      screen.getByText("Aguardando conexão… detectamos sozinhos quando conectar."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Abrir WhatsApp" }),
    ).toBeVisible();

    expect(screen.queryByText("Código copiado")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
    await flushMicrotasks();
    expect(writeText).toHaveBeenCalledWith("K7M2-P9QX");
    expect(screen.getByRole("status")).toHaveTextContent("Código copiado");

    // Expira e regenera com o mesmo número, sem perguntar de novo.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await flushMicrotasks();
    expect(screen.getByText("O código expirou.")).toBeVisible();

    whatsappReconnect.mockResolvedValue({
      connection: connectionFixture({ status: "CONNECTING" }),
      expiresAt: "2026-09-27T12:10:00.000Z",
      pairingCode: "Z1X2-Y3W4",
      qrcode: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo código" }));
    await flushMicrotasks();

    expect(whatsappReconnect).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "11988887777", mode: "PAIRING_CODE" }),
    );
    expect(screen.getByText("Z1X2-Y3W4")).toBeVisible();
  });

  test("a leitura de status enquanto o código vale continua a cada 3 s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();
    acceptConsentSync();
    fireEvent.click(screen.getByRole("radio", { name: "Código" }));
    fireEvent.change(screen.getByLabelText("Seu número de WhatsApp com DDD"), {
      target: { value: "11988887777" },
    });
    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "CONNECTING" }),
      expiresAt: "2026-09-27T12:05:00.000Z",
      pairingCode: "K7M2-P9QX",
      qrcode: null,
    });
    whatsappGet.mockResolvedValue(connectionFixture({ status: "CONNECTING" }));
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByText("K7M2-P9QX");
    const readsBefore = whatsappGet.mock.calls.length;

    await vi.advanceTimersByTimeAsync(2_999);
    expect(whatsappGet.mock.calls.length).toBe(readsBefore);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(whatsappGet.mock.calls.length).toBe(readsBefore + 1);
    await vi.advanceTimersByTimeAsync(3_000);
    await flushMicrotasks();
    expect(whatsappGet.mock.calls.length).toBe(readsBefore + 2);
  });

  test("clipboard indisponível mostra texto próprio de falha", async () => {
    vi.useFakeTimers();
    stubClipboard(undefined);

    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();
    acceptConsentSync();
    fireEvent.click(screen.getByRole("radio", { name: "Código" }));
    fireEvent.change(screen.getByLabelText("Seu número de WhatsApp com DDD"), {
      target: { value: "11988887777" },
    });

    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "CONNECTING" }),
      expiresAt: "2026-09-27T12:05:00.000Z",
      pairingCode: "K7M2-P9QX",
      qrcode: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByText("K7M2-P9QX");

    fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
    await flushMicrotasks();
    expect(
      screen.getByText(/não foi possível copiar/i),
    ).toBeVisible();
    expect(screen.queryByText("Código copiado")).not.toBeInTheDocument();
  });

  test("número curto mostra erro inline que explica o formato, sem chamar connect", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);
    await screen.findByRole("button", { name: "Conectar WhatsApp" });
    await acceptConsent(user);
    await user.click(screen.getByRole("radio", { name: "Código" }));

    const field = screen.getByLabelText("Seu número de WhatsApp com DDD");
    await user.type(field, "119999");
    const cta = screen.getByRole("button", { name: "Conectar WhatsApp" });
    expect(cta).toBeEnabled();
    await user.click(cta);

    expect(whatsappConnect).not.toHaveBeenCalled();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(PHONE_FORMAT_ERROR);
  });

  test("recusa VALIDATION_ERROR do servidor vira o mesmo erro inline de formato, não a mensagem genérica", async () => {
    const user = userEvent.setup();
    render(<WhatsAppConnectionPanel />);
    await screen.findByRole("button", { name: "Conectar WhatsApp" });
    await acceptConsent(user);
    await user.click(screen.getByRole("radio", { name: "Código" }));
    await user.type(
      screen.getByLabelText("Seu número de WhatsApp com DDD"),
      "00000000000",
    );

    whatsappConnect.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "A valid Brazilian phone with area code is required.",
        requestId: "req-3",
        status: 400,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    expect(whatsappConnect).toHaveBeenCalledWith({
      consentAccepted: true,
      mode: "PAIRING_CODE",
      phone: "00000000000",
    });
    expect(
      screen.getByLabelText("Seu número de WhatsApp com DDD"),
    ).toHaveAccessibleDescription(PHONE_FORMAT_ERROR);
    expect(
      screen.queryByText(/não foi possível iniciar a conexão/i),
    ).not.toBeInTheDocument();
    expectPlainCopy();
  });
});

/**
 * Termos proibidos nas telas tocadas (Goal071 §9.2): nenhum texto visível
 * nem texto alternativo/rótulo pode trazê-los, nem código de erro cru.
 */
const FORBIDDEN_TERMS = [
  "token",
  "API",
  "HTTP",
  "JID",
  "instância",
  "Evolution",
  "QRTimeout",
  "pairing",
];

function renderedCopy(): string {
  const attributes = Array.from(
    document.body.querySelectorAll("[alt], [aria-label], [title], [placeholder]"),
  ).flatMap((element) =>
    ["alt", "aria-label", "title", "placeholder"]
      .map((name) => element.getAttribute(name))
      .filter((value): value is string => Boolean(value)),
  );
  return [document.body.textContent ?? "", ...attributes].join("\n");
}

function expectPlainCopy() {
  const copy = renderedCopy();
  for (const term of FORBIDDEN_TERMS) {
    expect(copy).not.toMatch(new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "iu"));
  }
  // Código de erro cru (`VALIDATION_ERROR`, `WHATSAPP_QR_NOT_IN_PROGRESS`...).
  expect(copy).not.toMatch(/[A-Z]{2,}_[A-Z_]{2,}/);
}

function primaryButtons() {
  return document.body.querySelectorAll(".btn-primary");
}

describe("um CTA primário por estado e nenhum termo técnico", () => {
  test("o filtro de termos proibidos morde", () => {
    render(<p>Falha na API da Evolution: VALIDATION_ERROR</p>);
    expect(() => expectPlainCopy()).toThrow();
  });

  test("consentimento: um CTA primário, sem settings-tone-card e sem termo proibido", async () => {
    render(<WhatsAppConnectionPanel />);
    await screen.findByRole("button", { name: "Conectar WhatsApp" });

    expect(document.querySelector(".settings-tone-card")).toBeNull();
    expect(primaryButtons()).toHaveLength(1);
    expectPlainCopy();

    fireEvent.click(screen.getByRole("radio", { name: "Sim, também" }));
    expect(primaryButtons()).toHaveLength(1);
    expectPlainCopy();
  });

  test("QR e expirado: no máximo um CTA primário e nenhum termo proibido", async () => {
    vi.useFakeTimers();
    await startQrLinking();
    expect(primaryButtons().length).toBeLessThanOrEqual(1);
    expectPlainCopy();

    whatsappQr.mockRejectedValueOnce(
      new BffHttpError({
        code: "WHATSAPP_QR_NOT_IN_PROGRESS",
        message: "There is no WhatsApp QR pairing in progress for this business.",
        requestId: "req-4",
        status: 409,
      }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await flushMicrotasks();
    expect(screen.getByText("O QR Code expirou.")).toBeVisible();
    expect(primaryButtons()).toHaveLength(1);
    expect(primaryButtons()[0]).toHaveTextContent("Gerar novo QR Code");
    expectPlainCopy();
  });

  test("código e código expirado: no máximo um CTA primário e nenhum termo proibido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<WhatsAppConnectionPanel />);
    await flushMicrotasks();
    acceptConsentSync();
    fireEvent.click(screen.getByRole("radio", { name: "Código" }));
    fireEvent.change(screen.getByLabelText("Seu número de WhatsApp com DDD"), {
      target: { value: "11988887777" },
    });
    expect(primaryButtons()).toHaveLength(1);
    expectPlainCopy();

    whatsappConnect.mockResolvedValue({
      connection: connectionFixture({ status: "CONNECTING" }),
      expiresAt: "2026-09-27T12:02:40.000Z",
      pairingCode: "K7M2-P9QX",
      qrcode: null,
    });
    whatsappGet.mockResolvedValue(connectionFixture({ status: "CONNECTING" }));
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    await flushMicrotasks();
    screen.getByText("K7M2-P9QX");
    fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
    await flushMicrotasks();
    expect(primaryButtons().length).toBeLessThanOrEqual(1);
    expectPlainCopy();

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    await flushMicrotasks();
    expect(screen.getByText("O código expirou.")).toBeVisible();
    expect(primaryButtons()).toHaveLength(1);
    expect(primaryButtons()[0]).toHaveTextContent("Gerar novo código");
    expectPlainCopy();
  });

  test("conectado: nenhum CTA primário concorrente e nenhum termo proibido", async () => {
    whatsappGet.mockResolvedValue(
      connectionFixture({ phoneNumber: "5511987654321", status: "CONNECTED" }),
    );
    render(<WhatsAppConnectionPanel />);
    await screen.findByText("WhatsApp conectado");
    expect(primaryButtons().length).toBeLessThanOrEqual(1);
    expectPlainCopy();
  });
});
