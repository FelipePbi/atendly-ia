// @vitest-environment jsdom
/**
 * Goal017 (WU-04) — chat: autoria e mídia.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - autoria `CUSTOMER`, `AI` e `OWNER` é distinguível por texto e por forma
 *   (classe do balão), e o que a IA escreveu se apresenta como escrito por
 *   ela, nunca com nome de pessoa nem "Avenly";
 * - áudio apresenta os quatro `transcriptStatus` de forma distinta, e
 *   `FAILED` nunca mostra texto de transcrição, mesmo que o dado trouxesse um;
 * - áudio com bytes na origem pode ser ouvido: o player nasce do mesmo proxy
 *   sob demanda (`getMedia`), e ler a transcrição não substitui ouvir;
 * - imagem e figurinha aparecem sozinhas pelo proxy (`getMedia`), imagem
 *   como miniatura que amplia ao clicar; documento e vídeo só buscam bytes
 *   sob demanda — nenhuma URL de mídia aparece na árvore, só o blob local
 *   (desde 2026-10-16; antes a imagem também esperava "Ver mídia");
 * - áudio toca no primeiro toque, pausa, muda de posição e de velocidade, e
 *   só um toca por vez;
 * - `mediaAvailable: false` nunca busca nada: imagem diz "Mídia
 *   indisponível", documento não oferece "Ver mídia"; `tooLarge` aparece
 *   como metadado;
 * - as três recusas de mídia (`MESSAGE_ATTACHMENT_NOT_FOUND`,
 *   `MEDIA_TOO_LARGE`, `MEDIA_UNAVAILABLE`) têm copy própria, nunca erro
 *   genérico.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Conversation, type Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { clearMediaCache } from "@/features/conversations/mediaCache";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const sendMessage = vi.fn();
const getMedia = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      getMedia,
      list: listConversations,
      listMessages,
      sendMessage,
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
    },
  }),
}));

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "HUMAN",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "Olá!",
    createdAt: "2026-09-14T12:00:00.000Z",
    direction: "OUTBOUND",
    id: "msg-1",
    source: "AI",
    ...overrides,
  };
}

function attachmentFixture(
  overrides: Partial<NonNullable<Message["attachment"]>> = {},
): NonNullable<Message["attachment"]> {
  return {
    durationSeconds: null,
    fileName: "arquivo.bin",
    kind: "IMAGE",
    mediaAvailable: true,
    mimetype: "image/png",
    sizeBytes: 2048,
    tooLarge: false,
    transcript: null,
    transcriptError: null,
    transcriptStatus: null,
    ...overrides,
  };
}

async function renderThread(messages: Message[]) {
  getConversation.mockResolvedValue(conversationFixture());
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue([]);
  const result = render(
    <ShellConfigProvider>
      <ConversationThread conversationId="conv-1" />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Histórico da conversa com Marina Duarte");
  return result;
}

beforeEach(() => {
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockReset();
  sendMessage.mockReset();
  getMedia.mockReset();
  clearMediaCache();
  URL.createObjectURL = vi.fn(() => "blob:mock-media-url");
  URL.revokeObjectURL = vi.fn();
});

describe("autoria discreta e honesta por source", () => {
  test("CUSTOMER mostra só a hora, sem nome nem rótulo (Goal077 §6.10)", async () => {
    await renderThread([
      messageFixture({
        body: "Oi, tudo bem?",
        direction: "INBOUND",
        id: "msg-customer",
        source: "CUSTOMER",
      }),
    ]);

    const bubble = screen.getByText("Oi, tudo bem?").closest(".message-group");
    expect(bubble).not.toBeNull();
    expect(
      within(bubble as HTMLElement).queryByText("Marina Duarte"),
    ).toBeNull();
    const meta = (bubble as HTMLElement).querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(bubble).not.toHaveClass("is-outgoing");
    expect(bubble).toHaveClass("is-customer");
  });

  test("AI se apresenta como 'IA · hora' abaixo da bolha, nunca com nome de pessoa ou do negócio (Goal077 §6.10)", async () => {
    await renderThread([
      messageFixture({ body: "Posso ajudar em algo?", id: "msg-ai" }),
    ]);

    const bubble = screen
      .getByText("Posso ajudar em algo?")
      .closest(".message-group");
    const meta = (bubble as HTMLElement).querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^IA · \d{2}:\d{2}$/);
    expect(screen.queryByText(/Studio Marina/)).toBeNull();
    expect(screen.queryByText(/resposta automática/)).toBeNull();
    expect(bubble).toHaveClass("is-ai");
    expect(bubble).toHaveClass("is-outgoing");
  });

  test("OWNER se apresenta como 'Você · hora', distinto da IA (Goal077 §6.10)", async () => {
    await renderThread([
      messageFixture({
        body: "Já te atendo",
        id: "msg-owner",
        source: "OWNER",
      }),
    ]);

    const bubble = screen.getByText("Já te atendo").closest(".message-group");
    const meta = (bubble as HTMLElement).querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^Você · \d{2}:\d{2}$/);
    expect(screen.queryByText(/atendimento humano/)).toBeNull();
    expect(bubble).toHaveClass("is-owner");
    expect(bubble).not.toHaveClass("is-ai");
  });

  test("os três balões têm classes de forma distintas entre si", async () => {
    await renderThread([
      messageFixture({
        body: "Do cliente",
        direction: "INBOUND",
        id: "msg-c",
        source: "CUSTOMER",
      }),
      messageFixture({ body: "Da IA", id: "msg-a" }),
      messageFixture({ body: "Do humano", id: "msg-o", source: "OWNER" }),
    ]);

    const customer = screen.getByText("Do cliente").closest(".message-group");
    const ai = screen.getByText("Da IA").closest(".message-group");
    const owner = screen.getByText("Do humano").closest(".message-group");
    expect(customer?.className).not.toBe(ai?.className);
    expect(ai?.className).not.toBe(owner?.className);
    expect(customer?.className).not.toBe(owner?.className);
  });
});

describe("áudio: transcriptStatus nos quatro estados", () => {
  test("DONE mostra a transcrição, marcada como transcrição", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          kind: "AUDIO",
          transcript: "Cliente perguntou sobre o horário.",
          transcriptStatus: "DONE",
        }),
        kind: "AUDIO",
      }),
    ]);

    expect(screen.getByText("Transcrição")).toBeVisible();
    expect(
      screen.getByText("Cliente perguntou sobre o horário."),
    ).toBeVisible();
  });

  test("PENDING diz que está transcrevendo, sem texto", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          kind: "AUDIO",
          transcriptStatus: "PENDING",
        }),
        kind: "AUDIO",
      }),
    ]);

    expect(screen.getByText("Transcrevendo áudio…")).toBeVisible();
  });

  test("FAILED nunca exibe texto no lugar da transcrição", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          kind: "AUDIO",
          transcript: "texto que não deveria aparecer",
          transcriptError: "provedor de transcrição indisponível",
          transcriptStatus: "FAILED",
        }),
        kind: "AUDIO",
      }),
    ]);

    expect(
      screen.getByText(/Não foi possível transcrever este áudio/),
    ).toBeVisible();
    expect(
      screen.getByText(/provedor de transcrição indisponível/),
    ).toBeVisible();
    expect(
      screen.queryByText("texto que não deveria aparecer"),
    ).toBeNull();
  });

  test("SKIPPED explica que a política não permitiu transcrever", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          kind: "AUDIO",
          transcriptStatus: "SKIPPED",
        }),
        kind: "AUDIO",
      }),
    ]);

    expect(
      screen.getByText("Transcrição não disponível para esta conversa."),
    ).toBeVisible();
  });

  test("os quatro estados usam textos diferentes entre si", async () => {
    const texts = new Set<string>();
    for (const status of ["DONE", "PENDING", "FAILED", "SKIPPED"] as const) {
      const { unmount } = await renderThread([
        messageFixture({
          attachment: attachmentFixture({
            kind: "AUDIO",
            transcript: status === "DONE" ? "transcrito" : null,
            transcriptError: status === "FAILED" ? "falhou" : null,
            transcriptStatus: status,
          }),
          kind: "AUDIO",
        }),
      ]);
      const node = document.querySelector(".message-transcript");
      texts.add(node?.textContent ?? "");
      unmount();
    }
    expect(texts.size).toBe(4);
  });
});

function imageBytes() {
  return {
    blob: new Blob(["fake-bytes"], { type: "image/jpeg" }),
    contentType: "image/jpeg",
    fileName: null,
  };
}

function refusal(upstreamCode: string) {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode },
    message: "upstream refused",
    requestId: "req-1",
    status: 502,
  });
}

function imageMessage(
  attachment: Partial<NonNullable<Message["attachment"]>> = {},
  overrides: Partial<Message> = {},
) {
  return messageFixture({
    attachment: attachmentFixture({
      fileName: null,
      kind: "IMAGE",
      mimetype: "image/jpeg",
      ...attachment,
    }),
    body: "",
    direction: "INBOUND",
    kind: "IMAGE",
    source: "CUSTOMER",
    ...overrides,
  });
}

function stickerMessage(id: string, mediaAvailable = true) {
  return messageFixture({
    attachment: attachmentFixture({
      fileName: null,
      kind: "STICKER",
      mediaAvailable,
      mimetype: "image/webp",
    }),
    body: "",
    direction: "INBOUND",
    id,
    kind: "STICKER",
    source: "CUSTOMER",
  });
}

describe("imagem: miniatura no balão, ampliada ao clicar", () => {
  test("aparece sozinha pelo proxy, como blob local, e amplia ao clicar", async () => {
    getMedia.mockResolvedValue(imageBytes());
    await renderThread([imageMessage()]);
    const user = userEvent.setup();

    const thumb = await screen.findByRole("button", { name: "Ampliar imagem" });
    expect(getMedia).toHaveBeenCalledWith("conv-1", "msg-1", undefined);
    const image = within(thumb).getByRole("img", { name: "Imagem da conversa" });
    expect(image).toHaveAttribute("src", "blob:mock-media-url");
    expect(image.getAttribute("src")).not.toMatch(/whatsapp|minio|http/i);

    await user.click(thumb);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("img", {
        name: "Imagem da conversa em tamanho maior",
      }),
    ).toHaveAttribute("src", "blob:mock-media-url");
  });

  test("enquanto carrega, o lugar da imagem diz que carrega, sem texto na tela", async () => {
    getMedia.mockReturnValue(new Promise(() => undefined));
    await renderThread([imageMessage()]);

    const status = await screen.findByText("Carregando imagem…");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveClass("sr-only");
    expect(status.parentElement).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Ampliar imagem" })).toBeNull();
  });

  test("a legenda vem depois da imagem, como no WhatsApp", async () => {
    getMedia.mockResolvedValue(imageBytes());
    await renderThread([imageMessage({}, { body: "Olha como ficou" })]);

    const thumb = await screen.findByRole("button", { name: "Ampliar imagem" });
    const caption = screen.getByText("Olha como ficou");
    expect(
      thumb.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("sem mídia na origem diz Mídia indisponível e não busca nada", async () => {
    await renderThread([imageMessage({ mediaAvailable: false })]);

    expect(screen.getByText("Mídia indisponível")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ampliar imagem" })).toBeNull();
    expect(getMedia).not.toHaveBeenCalled();
  });

  test.each(["MESSAGE_ATTACHMENT_NOT_FOUND", "MEDIA_TOO_LARGE", "MEDIA_UNAVAILABLE"])(
    "a recusa %s vira Mídia indisponível, nunca erro técnico",
    async (upstreamCode) => {
      getMedia.mockRejectedValue(refusal(upstreamCode));
      await renderThread([imageMessage()]);

      expect(await screen.findByText("Mídia indisponível")).toBeVisible();
      expect(screen.queryByText(/upstream refused/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    },
  );

  test("falha de rede oferece tentar de novo, que busca outra vez", async () => {
    getMedia
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "NETWORK_ERROR",
          message: "Não foi possível acessar a Avenly.",
          requestId: "req-net",
          status: 0,
        }),
      )
      .mockResolvedValueOnce(imageBytes());
    await renderThread([imageMessage()]);
    const user = userEvent.setup();

    expect(
      await screen.findByText("Não foi possível carregar a imagem."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(
      await screen.findByRole("button", { name: "Ampliar imagem" }),
    ).toBeVisible();
    expect(getMedia).toHaveBeenCalledTimes(2);
  });

  test("voltar à conversa mostra a imagem na hora, sem baixar de novo", async () => {
    getMedia.mockResolvedValue(imageBytes());
    const first = await renderThread([imageMessage()]);
    await screen.findByRole("button", { name: "Ampliar imagem" });
    first.unmount();

    await renderThread([imageMessage()]);

    expect(screen.getByRole("button", { name: "Ampliar imagem" })).toBeVisible();
    expect(getMedia).toHaveBeenCalledTimes(1);
  });
});

describe("figurinha: aparece sozinha, fora do balão", () => {
  test("estática ou animada, vira imagem do blob local sem balão", async () => {
    getMedia.mockResolvedValue({
      blob: new Blob(["webp"], { type: "image/webp" }),
      contentType: "image/webp",
      fileName: null,
    });
    await renderThread([stickerMessage("st-1")]);

    const sticker = await screen.findByRole("img", { name: "Figurinha" });
    expect(sticker).toHaveAttribute("src", "blob:mock-media-url");
    expect(sticker.closest(".message-group")).toHaveClass("is-sticker");
  });

  test("sem mídia na origem diz que a figurinha está indisponível, sem buscar", async () => {
    await renderThread([stickerMessage("st-1", false)]);

    expect(screen.getByText("Figurinha indisponível")).toBeVisible();
    expect(getMedia).not.toHaveBeenCalled();
  });

  test("imagem e figurinha prontas passam no axe", async () => {
    getMedia.mockResolvedValue(imageBytes());
    const { container } = await renderThread([
      imageMessage(),
      stickerMessage("st-1"),
    ]);
    await screen.findByRole("img", { name: "Figurinha" });
    await screen.findByRole("button", { name: "Ampliar imagem" });

    await expectNoA11yViolations(container);
  });
});

describe("documento e vídeo continuam sob demanda", () => {
  test("documento não busca nada sozinho; Ver mídia busca pelo proxy", async () => {
    getMedia.mockResolvedValue({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      contentType: "application/pdf",
      fileName: "orcamento.pdf",
    });
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          fileName: "orcamento.pdf",
          kind: "DOCUMENT",
          mimetype: "application/pdf",
        }),
        kind: "DOCUMENT",
      }),
    ]);
    const user = userEvent.setup();

    expect(screen.getByText("orcamento.pdf")).toBeVisible();
    expect(getMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Ver mídia/ }));

    await waitFor(() =>
      expect(getMedia).toHaveBeenCalledWith(
        "conv-1",
        "msg-1",
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("link", { name: "Abrir documento" }),
    ).toHaveAttribute("href", "blob:mock-media-url");
  });

  test("mediaAvailable false não oferece Ver mídia", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          fileName: "documento.pdf",
          kind: "DOCUMENT",
          mediaAvailable: false,
        }),
        kind: "DOCUMENT",
      }),
    ]);

    expect(screen.getByText("documento.pdf")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Ver mídia/ }),
    ).toBeNull();
  });

  test("tooLarge aparece como metadado, com nome e tamanho", async () => {
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          fileName: "video-grande.mp4",
          kind: "VIDEO",
          mediaAvailable: false,
          sizeBytes: 90 * 1024 * 1024,
          tooLarge: true,
        }),
        kind: "VIDEO",
      }),
    ]);

    expect(screen.getByText("video-grande.mp4")).toBeVisible();
    expect(screen.getByText("90.0 MB")).toBeVisible();
    expect(
      screen.getByText(/os bytes não estão disponíveis/),
    ).toBeVisible();
  });

  test.each([
    [
      "MESSAGE_ATTACHMENT_NOT_FOUND",
      "Esta mídia não está mais disponível.",
    ],
    [
      "MEDIA_TOO_LARGE",
      "Este arquivo é maior do que o suportado para baixar agora.",
    ],
    [
      "MEDIA_UNAVAILABLE",
      "A mídia não está disponível na origem no momento.",
    ],
  ])(
    "a recusa %s tem copy própria, nunca erro genérico",
    async (upstreamCode, copy) => {
      getMedia.mockRejectedValue(refusal(upstreamCode));
      await renderThread([
        messageFixture({
          attachment: attachmentFixture({ kind: "DOCUMENT" }),
          kind: "DOCUMENT",
        }),
      ]);
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /Ver mídia/ }));

      expect(await screen.findByText(copy)).toBeVisible();
      expect(screen.queryByText(/upstream refused/)).toBeNull();
    },
  );
});

describe("áudio: ouvir o original, não só ler a transcrição", () => {
  function audioMessage(
    attachment: Partial<NonNullable<Message["attachment"]>>,
    id = "msg-1",
  ) {
    return messageFixture({
      attachment: attachmentFixture({
        durationSeconds: 12,
        fileName: "audio.ogg",
        kind: "AUDIO",
        mimetype: "audio/ogg",
        transcript: "Cliente perguntou sobre o horário.",
        transcriptStatus: "DONE",
        ...attachment,
      }),
      direction: "INBOUND",
      id,
      kind: "AUDIO",
      source: "CUSTOMER",
    });
  }

  function audioBytes() {
    return {
      blob: new Blob(["fake-audio"], { type: "audio/ogg" }),
      contentType: "audio/ogg",
      fileName: "audio.ogg",
    };
  }

  // jsdom não toca mídia: play/pause mudam `paused` e disparam o evento, como
  // o navegador faz.
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: false });
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      });
    pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: true });
        this.dispatchEvent(new Event("pause"));
      });
  });
  afterEach(() => {
    play.mockRestore();
    pause.mockRestore();
  });

  test("o primeiro toque busca pelo proxy e já toca; o botão vira Pausar", async () => {
    getMedia.mockResolvedValue(audioBytes());
    await renderThread([audioMessage({ mediaAvailable: true })]);
    const user = userEvent.setup();

    expect(getMedia).not.toHaveBeenCalled();
    expect(screen.getByText("0:12")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ouvir áudio" }));

    const pauseButton = await screen.findByRole("button", {
      name: "Pausar áudio",
    });
    expect(getMedia).toHaveBeenCalledWith(
      "conv-1",
      "msg-1",
      expect.any(AbortSignal),
    );
    const player = document.querySelector("audio") as HTMLAudioElement;
    expect(player.getAttribute("src")).toBe("blob:mock-media-url");
    expect(play).toHaveBeenCalledTimes(1);

    await user.click(pauseButton);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ouvir áudio" })).toBeVisible();
    // A transcrição continua junto: ler e ouvir respondem perguntas distintas.
    expect(
      screen.getByText("Cliente perguntou sobre o horário."),
    ).toBeVisible();
  });

  test("a posição muda pelo controle deslizante, com o tempo dito em texto", async () => {
    getMedia.mockResolvedValue(audioBytes());
    await renderThread([audioMessage({ mediaAvailable: true })]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Ouvir áudio" }));
    const seek = await screen.findByRole("slider", { name: "Posição do áudio" });
    fireEvent.change(seek, { target: { value: "6" } });

    const player = document.querySelector("audio") as HTMLAudioElement;
    expect(player.currentTime).toBe(6);
    expect(seek).toHaveAttribute("aria-valuetext", "0:06 de 0:12");
  });

  test("a velocidade alterna entre 1×, 1,5× e 2×", async () => {
    getMedia.mockResolvedValue(audioBytes());
    await renderThread([audioMessage({ mediaAvailable: true })]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Ouvir áudio" }));
    const rate = await screen.findByRole("button", { name: /^Velocidade 1×/ });
    const player = document.querySelector("audio") as HTMLAudioElement;

    await user.click(rate);
    expect(rate).toHaveTextContent("1,5×");
    expect(player.playbackRate).toBe(1.5);
    await user.click(rate);
    expect(player.playbackRate).toBe(2);
    await user.click(rate);
    expect(player.playbackRate).toBe(1);
  });

  test("só um áudio toca por vez", async () => {
    getMedia.mockResolvedValue(audioBytes());
    await renderThread([
      audioMessage({ mediaAvailable: true }, "a-1"),
      audioMessage({ mediaAvailable: true }, "a-2"),
    ]);
    const user = userEvent.setup();
    const [first, second] = screen.getAllByRole("button", { name: "Ouvir áudio" });

    await user.click(first);
    await screen.findByRole("button", { name: "Pausar áudio" });
    await user.click(second);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Pausar áudio" })).toHaveLength(1),
    );
    expect(pause).toHaveBeenCalledTimes(1);
  });

  test("sem bytes na origem não oferece player, e diz por quê", async () => {
    await renderThread([audioMessage({ mediaAvailable: false })]);

    expect(screen.queryByRole("button", { name: "Ouvir áudio" })).toBeNull();
    expect(
      screen.getByText("O áudio não está mais disponível na origem para ouvir."),
    ).toBeVisible();
    expect(document.querySelector("audio")).toBeNull();
    expect(getMedia).not.toHaveBeenCalled();
  });

  test("recusa da rota de mídia vira copy própria, e o áudio não some da tela", async () => {
    getMedia.mockRejectedValue(refusal("MEDIA_UNAVAILABLE"));
    await renderThread([audioMessage({ mediaAvailable: true })]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Ouvir áudio" }));

    expect(
      await screen.findByText(
        "A mídia não está disponível na origem no momento.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Cliente perguntou sobre o horário."),
    ).toBeVisible();
  });

  test("player pronto passa no axe e responde ao teclado", async () => {
    getMedia.mockResolvedValue(audioBytes());
    const { container } = await renderThread([
      audioMessage({ mediaAvailable: true }),
    ]);
    const user = userEvent.setup();

    screen.getByRole("button", { name: "Ouvir áudio" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Pausar áudio" });

    await expectNoA11yViolations(container);
  });
});
