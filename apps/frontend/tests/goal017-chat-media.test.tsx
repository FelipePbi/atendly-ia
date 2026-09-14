// @vitest-environment jsdom
/**
 * Goal017 (WU-04) — chat: autoria e mídia.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - autoria `CUSTOMER`, `AI` e `OWNER` é distinguível por texto e por forma
 *   (classe do balão), e o que a IA escreveu se apresenta como escrito por
 *   ela, nunca com nome de pessoa nem "Atendly";
 * - áudio apresenta os quatro `transcriptStatus` de forma distinta, e
 *   `FAILED` nunca mostra texto de transcrição, mesmo que o dado trouxesse um;
 * - áudio com bytes na origem pode ser ouvido: o player nasce do mesmo proxy
 *   sob demanda (`getMedia`), e ler a transcrição não substitui ouvir;
 * - imagem, documento e vídeo só buscam bytes sob demanda, pelo proxy
 *   (`getMedia`) — nenhuma URL de mídia aparece na árvore, só o blob local;
 * - `mediaAvailable: false` nunca oferece "Ver mídia"; `tooLarge` aparece
 *   como metadado;
 * - as três recusas de mídia (`MESSAGE_ATTACHMENT_NOT_FOUND`,
 *   `MEDIA_TOO_LARGE`, `MEDIA_UNAVAILABLE`) têm copy própria, nunca erro
 *   genérico.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Conversation, type Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

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
  URL.createObjectURL = vi.fn(() => "blob:mock-media-url");
  URL.revokeObjectURL = vi.fn();
});

describe("autoria discreta e honesta por source", () => {
  test("CUSTOMER aparece com o nome da pessoa, à esquerda", async () => {
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
    expect(within(bubble as HTMLElement).getByText("Marina Duarte")).toBeVisible();
    expect(bubble).not.toHaveClass("is-outgoing");
    expect(bubble).toHaveClass("is-customer");
  });

  test("AI se apresenta como escrita pela IA, nunca com nome de pessoa", async () => {
    await renderThread([
      messageFixture({ body: "Posso ajudar em algo?", id: "msg-ai" }),
    ]);

    expect(screen.getByText("Studio Marina · IA")).toBeVisible();
    expect(screen.getByText(/resposta automática/)).toBeVisible();
    const bubble = screen
      .getByText("Posso ajudar em algo?")
      .closest(".message-group");
    expect(bubble).toHaveClass("is-ai");
    expect(bubble).toHaveClass("is-outgoing");
  });

  test("OWNER se apresenta como Você, distinto da IA", async () => {
    await renderThread([
      messageFixture({
        body: "Já te atendo",
        id: "msg-owner",
        source: "OWNER",
      }),
    ]);

    expect(screen.getByText("Você")).toBeVisible();
    expect(screen.getByText(/atendimento humano/)).toBeVisible();
    const bubble = screen.getByText("Já te atendo").closest(".message-group");
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

describe("imagem, documento e vídeo sob demanda pelo proxy", () => {
  test("mediaAvailable oferece Ver mídia, e o proxy devolve o conteúdo como blob local", async () => {
    getMedia.mockResolvedValue({
      blob: new Blob(["fake-bytes"], { type: "image/png" }),
      contentType: "image/png",
      fileName: "foto.png",
    });
    await renderThread([
      messageFixture({
        attachment: attachmentFixture({
          fileName: "foto.png",
          kind: "IMAGE",
          mediaAvailable: true,
        }),
        kind: "IMAGE",
      }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Ver mídia/ }));

    await waitFor(() => expect(getMedia).toHaveBeenCalledWith(
      "conv-1",
      "msg-1",
      expect.anything(),
    ));
    const image = await screen.findByRole("img", {
      name: "Imagem enviada na conversa",
    });
    expect(image).toHaveAttribute("src", "blob:mock-media-url");
    expect(image.getAttribute("src")).not.toMatch(/whatsapp|minio|http/i);
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
      getMedia.mockRejectedValue(
        new BffHttpError({
          code: "UPSTREAM_ERROR",
          details: { upstreamCode },
          message: "upstream refused",
          requestId: "req-1",
          status: 502,
        }),
      );
      await renderThread([
        messageFixture({
          attachment: attachmentFixture({ kind: "IMAGE" }),
          kind: "IMAGE",
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
  function audioMessage(attachment: Partial<NonNullable<Message["attachment"]>>) {
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
      kind: "AUDIO",
      source: "CUSTOMER",
    });
  }

  test("mediaAvailable oferece ouvir, e o player sai do blob do proxy", async () => {
    getMedia.mockResolvedValue({
      blob: new Blob(["fake-audio"], { type: "audio/ogg" }),
      contentType: "audio/ogg",
      fileName: "audio.ogg",
    });
    await renderThread([audioMessage({ mediaAvailable: true })]);
    const user = userEvent.setup();

    expect(getMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ouvir áudio" }));

    await waitFor(() =>
      expect(document.querySelector("audio")).not.toBeNull(),
    );
    const player = document.querySelector("audio") as HTMLAudioElement;
    expect(getMedia).toHaveBeenCalledWith(
      "conv-1",
      "msg-1",
      expect.any(AbortSignal),
    );
    expect(player.getAttribute("src")).toBe("blob:mock-media-url");
    expect(player).toHaveAttribute("controls");
    // A transcrição continua junto: ler e ouvir respondem perguntas distintas.
    expect(
      screen.getByText("Cliente perguntou sobre o horário."),
    ).toBeVisible();
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
    getMedia.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "MEDIA_UNAVAILABLE" },
        message: "upstream refused",
        requestId: "req-audio",
        status: 404,
      }),
    );
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
});
