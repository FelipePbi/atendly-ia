// @vitest-environment jsdom
/**
 * Goal024/WU-04 (Goal012/§Conhecimento): Conhecimento do negócio editável.
 *
 * O que esta suíte prova, com o DTO real de `knowledgeDocumentSchema`:
 *
 * - `KnowledgeSection` lista os documentos, sempre com `BUSINESS_INFO`
 *   excluído — ele é o campo livre de `OtherInfoSection`, não um documento
 *   comum;
 * - o seletor de tipo do formulário de criação nunca oferece
 *   "Outras informações importantes": o contrato reserva esse type a
 *   `PUT /v1/knowledge/other-info` e recusa POST/PUT de documento com esse
 *   type;
 * - criar chama `knowledge.create` com o payload do formulário e insere o
 *   documento devolvido na lista, sem recarregar;
 * - editar chama `knowledge.edit` com o id do documento e publica a nova
 *   versão na lista, com aviso de que a versão anterior não foi apagada;
 * - desativar chama `knowledge.deactivate` só após confirmação e remove o
 *   documento da lista visível, com aviso de que nada foi apagado;
 * - `OtherInfoSection` é um campo de escrita só: nasce vazio (a API nunca
 *   devolve o conteúdo indexado) e confirma pela resposta do próprio `PUT`;
 * - o erro 502 `KNOWLEDGE_INDEX_UNAVAILABLE` — em criar, editar e no campo
 *   livre — mostra a mensagem de que nada foi salvo, sem inserir/alterar a
 *   lista.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type KnowledgeDocument, type Service } from "@/data";
import { KnowledgeSection } from "@/features/knowledge/KnowledgeSection";
import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";

const knowledgeList = vi.fn();
const knowledgeCreate = vi.fn();
const knowledgeEdit = vi.fn();
const knowledgeDeactivate = vi.fn();
const knowledgeSaveOtherInfo = vi.fn();
const serviceCatalogList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    knowledge: {
      create: knowledgeCreate,
      deactivate: knowledgeDeactivate,
      edit: knowledgeEdit,
      list: knowledgeList,
      saveOtherInfo: knowledgeSaveOtherInfo,
    },
    serviceCatalog: { list: serviceCatalogList },
  }),
}));

function documentFixture(overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    checksum: "chk-faq-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    id: "doc-faq",
    serviceId: null,
    source: "MANUAL",
    status: "ACTIVE",
    title: "Horário de funcionamento",
    type: "FAQ",
    updatedAt: "2026-09-01T10:00:00.000Z",
    version: "1",
    ...overrides,
  };
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: null,
    description: null,
    durationMinutes: 45,
    id: "s1",
    name: "Corte",
    needsReview: false,
    price: 80,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

function indexUnavailableError(): BffHttpError {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode: "KNOWLEDGE_INDEX_UNAVAILABLE" },
    message: "Upstream index is unavailable.",
    requestId: "req-index-1",
    status: 502,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    source: "ATENDLY",
  });
});

describe("listar", () => {
  test("lista os documentos e exclui BUSINESS_INFO, mesmo se o servidor devolvê-lo", async () => {
    knowledgeList.mockResolvedValue([
      documentFixture({ id: "doc-faq", title: "Horário", type: "FAQ" }),
      documentFixture({
        id: "doc-business-info",
        title: "Outras informações",
        type: "BUSINESS_INFO",
      }),
      documentFixture({
        id: "doc-service",
        serviceId: "s1",
        title: "Cuidados pós-corte",
        type: "CARE",
      }),
    ]);
    render(<KnowledgeSection />);

    expect(await screen.findByText("Horário")).toBeVisible();
    expect(screen.getByText("Cuidados pós-corte")).toBeVisible();
    expect(screen.getByText(/Corte$/)).toBeVisible();
    expect(screen.queryByText("Outras informações")).not.toBeInTheDocument();
  });

  test("documento geral (sem serviço) mostra 'Geral'", async () => {
    knowledgeList.mockResolvedValue([documentFixture({ serviceId: null })]);
    render(<KnowledgeSection />);

    expect(await screen.findByText(/Geral$/)).toBeVisible();
  });

  test("erro ao carregar mostra mensagem recuperável, sem inventar lista", async () => {
    knowledgeList.mockRejectedValue(new Error("falhou"));
    render(<KnowledgeSection />);

    expect(
      await screen.findByText(
        "Não foi possível carregar o conhecimento do negócio.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Horário/)).not.toBeInTheDocument();
  });
});

describe("o seletor de tipo nunca oferece BUSINESS_INFO", () => {
  test("o formulário de novo documento lista os cinco tipos criáveis, sem 'Outras informações importantes'", async () => {
    knowledgeList.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<KnowledgeSection />);

    await screen.findByText("Nenhum documento cadastrado ainda.");
    await user.click(screen.getByRole("button", { name: "Novo documento" }));

    const typeSelect = screen.getByLabelText("Tipo");
    const optionLabels = within(typeSelect)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(optionLabels).toEqual([
      "Pergunta frequente",
      "Orientação",
      "Cuidado",
      "Procedimento",
      "Política",
    ]);
    expect(optionLabels).not.toContain("Outras informações importantes");
  });
});

describe("criar", () => {
  test("envia o payload do formulário e insere o documento devolvido na lista", async () => {
    knowledgeList.mockResolvedValue([]);
    const created = documentFixture({
      id: "doc-new",
      serviceId: "s1",
      title: "Política de atraso",
      type: "TEXT_POLICY",
      version: "1",
    });
    knowledgeCreate.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<KnowledgeSection />);

    await screen.findByText("Nenhum documento cadastrado ainda.");
    await user.click(screen.getByRole("button", { name: "Novo documento" }));
    await user.selectOptions(screen.getByLabelText("Tipo"), "TEXT_POLICY");
    await user.selectOptions(screen.getByLabelText("Serviço ligado"), "s1");
    await user.type(screen.getByLabelText("Título"), "Política de atraso");
    await user.type(
      screen.getByLabelText("Conteúdo"),
      "Tolerância de 10 minutos.",
    );
    await user.click(screen.getByRole("button", { name: "Criar documento" }));

    await waitFor(() =>
      expect(knowledgeCreate).toHaveBeenCalledWith({
        chunks: [{ content: "Tolerância de 10 minutos." }],
        serviceId: "s1",
        title: "Política de atraso",
        type: "TEXT_POLICY",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Política de atraso")).toBeVisible();
    expect(screen.getByText("Documento criado.")).toBeVisible();
  });

  test("502 KNOWLEDGE_INDEX_UNAVAILABLE avisa que nada foi salvo e não insere nada na lista", async () => {
    knowledgeList.mockResolvedValue([]);
    knowledgeCreate.mockRejectedValue(indexUnavailableError());
    const user = userEvent.setup();
    render(<KnowledgeSection />);

    await screen.findByText("Nenhum documento cadastrado ainda.");
    await user.click(screen.getByRole("button", { name: "Novo documento" }));
    await user.type(screen.getByLabelText("Título"), "Política nova");
    await user.type(screen.getByLabelText("Conteúdo"), "Conteúdo qualquer.");
    await user.click(screen.getByRole("button", { name: "Criar documento" }));

    expect(
      await screen.findByText(
        "Não foi possível indexar o conteúdo agora. Nada foi salvo.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Política nova")).not.toBeInTheDocument();
  });
});

describe("editar", () => {
  test("publica a nova versão com o id do documento e avisa que a anterior não foi apagada", async () => {
    const existing = documentFixture({ id: "doc-faq", title: "Horário antigo" });
    knowledgeList.mockResolvedValue([existing]);
    // `replaceVersion` no serviço grava a versão nova com um id gerado
    // (randomUUID), diferente do documento editado: o dublê precisa refletir
    // isso para provar que a tela não duplica a linha.
    const edited = {
      ...existing,
      id: "doc-faq-v2",
      title: "Horário novo",
      version: "2",
    };
    knowledgeEdit.mockResolvedValue(edited);
    const user = userEvent.setup();
    const { container } = render(<KnowledgeSection />);

    await screen.findByText("Horário antigo");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByRole("dialog", { name: 'Editar "Horário antigo"' });
    // Honestidade de tela: o formulário nunca pré-preenche o conteúdo salvo
    // (o DTO não o devolve), e isso precisa estar escrito na tela, não só em
    // docblock.
    expect(
      screen.getByText(/O conteúdo salvo não é reexibido/),
    ).toBeVisible();

    const titleField = screen.getByLabelText("Título");
    await user.clear(titleField);
    await user.type(titleField, "Horário novo");
    await user.type(screen.getByLabelText("Conteúdo"), "Novo conteúdo.");
    await user.click(screen.getByRole("button", { name: "Publicar nova versão" }));

    await waitFor(() =>
      expect(knowledgeEdit).toHaveBeenCalledWith("doc-faq", {
        chunks: [{ content: "Novo conteúdo." }],
        serviceId: null,
        title: "Horário novo",
      }),
    );
    expect(await screen.findByText("Horário novo")).toBeVisible();
    expect(screen.queryByText("Horário antigo")).not.toBeInTheDocument();
    expect(
      screen.getByText("Nova versão publicada. A versão anterior não foi apagada."),
    ).toBeVisible();
    // O id novo não pode sobrar ao lado do antigo: uma linha, não duas.
    expect(container.querySelectorAll(".knowledge-row")).toHaveLength(1);
  });

  test("502 KNOWLEDGE_INDEX_UNAVAILABLE ao editar avisa que nada foi salvo e mantém a versão vigente", async () => {
    const existing = documentFixture({ id: "doc-faq", title: "Horário vigente" });
    knowledgeList.mockResolvedValue([existing]);
    knowledgeEdit.mockRejectedValue(indexUnavailableError());
    const user = userEvent.setup();
    render(<KnowledgeSection />);

    await screen.findByText("Horário vigente");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.type(screen.getByLabelText("Conteúdo"), "Texto qualquer.");
    await user.click(screen.getByRole("button", { name: "Publicar nova versão" }));

    expect(
      await screen.findByText(
        "Não foi possível indexar o conteúdo agora. Nada foi salvo.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Horário vigente")).toBeVisible();
  });
});

describe("desativar", () => {
  test("só desativa após confirmação e avisa que nada foi apagado", async () => {
    const existing = documentFixture({ id: "doc-faq", title: "Horário" });
    knowledgeList.mockResolvedValue([existing]);
    knowledgeDeactivate.mockResolvedValue({ ...existing, status: "INACTIVE" });
    const user = userEvent.setup();
    render(<KnowledgeSection />);

    await screen.findByText("Horário");
    await user.click(screen.getByRole("button", { name: "Desativar" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Desativar este documento?",
    });
    expect(knowledgeDeactivate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Manter ativo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(knowledgeDeactivate).not.toHaveBeenCalled();
    expect(screen.getByText("Horário")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Desativar" }));
    await user.click(
      screen.getByRole("button", { name: "Desativar documento" }),
    );

    await waitFor(() => expect(knowledgeDeactivate).toHaveBeenCalledWith("doc-faq"));
    expect(screen.queryByText("Horário")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Documento desativado: ele sai do contexto usado pela IA. Nada foi apagado.",
      ),
    ).toBeVisible();
  });
});

describe("campo livre (Outras informações importantes)", () => {
  test("nasce vazio e confirma o salvo pela resposta do PUT", async () => {
    const saved = documentFixture({
      id: "doc-other-info",
      title: "Outras informações importantes",
      type: "BUSINESS_INFO",
      updatedAt: "2026-09-15T12:00:00.000Z",
      version: "3",
    });
    knowledgeSaveOtherInfo.mockResolvedValue(saved);
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    const contentField = screen.getByLabelText("Conteúdo");
    expect(contentField).toHaveValue("");
    // Honestidade de tela: a caixa nasce vazia porque o conteúdo salvo não é
    // reexibido, e a tela precisa dizer isso, não só o docblock do componente.
    expect(
      screen.getByText(/O conteúdo salvo não é reexibido aqui/),
    ).toBeVisible();
    await user.type(contentField, "Aceitamos cartão e pix.");
    await user.click(screen.getByRole("button", { name: "Salvar informações" }));

    await waitFor(() =>
      expect(knowledgeSaveOtherInfo).toHaveBeenCalledWith(
        "Aceitamos cartão e pix.",
      ),
    );
    expect(await screen.findByText(/Salvo como versão 3 em/)).toBeVisible();
    expect(screen.getByText("Informações salvas.")).toBeVisible();
  });

  test("502 KNOWLEDGE_INDEX_UNAVAILABLE no campo livre avisa que nada foi salvo", async () => {
    knowledgeSaveOtherInfo.mockRejectedValue(indexUnavailableError());
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    await user.type(screen.getByLabelText("Conteúdo"), "Texto qualquer.");
    await user.click(screen.getByRole("button", { name: "Salvar informações" }));

    expect(
      await screen.findByText(
        "Não foi possível indexar o conteúdo agora. Nada foi salvo.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Salvo como versão/)).not.toBeInTheDocument();
  });
});
