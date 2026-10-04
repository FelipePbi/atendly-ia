// @vitest-environment jsdom
/**
 * Goal091 — telas de acesso restantes iguais ao protótipo (L3, L4, L5, L8, L9).
 * Provas pelo que a pessoa encontra: texto, papel e destino dos links. Layout
 * real fica no `visual:compare` e no gate renderizado; jsdom não mede pixel.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getLegalDetails } from "@/config/legal-details";
import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";
import { createPrivacyPolicy } from "@/content/legal/privacy-policy.pt-BR";
import { createTermsOfUse } from "@/content/legal/terms-of-use.pt-BR";
import type { LegalDocumentContent } from "@/content/legal/types";

const push = vi.fn();
const refreshSession = vi.fn();
const register = vi.fn();
const forgotPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: {
      login: vi.fn(),
      register,
      forgotPassword,
      resetPassword: vi.fn(),
    },
  }),
  useProductRuntime: () => ({ refreshSession }),
}));

const { AuthScreen } = await import("@/features/auth/AuthScreen");
const { LegalDocumentLayout } = await import(
  "@/components/legal/LegalDocumentLayout"
);

beforeEach(() => {
  push.mockReset();
  refreshSession.mockReset();
  register.mockReset();
  forgotPassword.mockReset();
  window.history.pushState({}, "", "/");
});

describe("prova 1 — /cadastro com os textos do quadro L3", () => {
  test("título, descrição, dica da senha, aceite e 'Já tem conta? Entrar'", () => {
    const { container } = render(<AuthScreen scenario="signup" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Criar conta" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Configure o negócio e conecte seu WhatsApp em poucos minutos.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Mínimo de 8 caracteres, com letras e números."),
    ).toBeVisible();

    const acceptance = screen.getByRole("checkbox").closest("label");
    expect(acceptance).not.toBeNull();
    expect(acceptance?.textContent).toBe(
      "Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade.",
    );
    expect(
      within(acceptance as HTMLElement).getByRole("link", {
        name: "Termos de Uso",
      }),
    ).toHaveAttribute("href", "/termos-de-uso");
    expect(
      within(acceptance as HTMLElement).getByRole("link", {
        name: "Política de Privacidade",
      }),
    ).toHaveAttribute("href", "/politica-de-privacidade");

    const footer = container.querySelector(".auth-footer");
    expect(footer?.textContent).toBe("Já tem conta? Entrar");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("campos e validação da baseline: Nome, E-mail, senha e aceite, todos os erros juntos", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    expect(screen.getByLabelText(/^Nome/)).toBeVisible();
    expect(screen.getByLabelText(/^E-mail/)).toBeVisible();
    expect(screen.getByLabelText(/^Crie uma senha/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(screen.getByText("Digite seu nome.")).toBeVisible();
    expect(screen.getByText("Digite seu e-mail.")).toBeVisible();
    expect(screen.getByText("Digite uma senha.")).toBeVisible();
    expect(
      screen.getByText(
        "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Nome/)).toHaveFocus();
    expect(register).not.toHaveBeenCalled();
  });

  test("o corpo enviado ao BFF é o da baseline, com as versões legais vigentes", async () => {
    register.mockResolvedValueOnce({});
    refreshSession.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    await user.type(screen.getByLabelText(/^Nome/), "Camila Reis");
    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.type(screen.getByLabelText(/^Crie uma senha/), "senhaForte1");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith({
      email: "camila@studio.com",
      name: "Camila Reis",
      password: "senhaForte1",
      termsAccepted: true,
      ...CURRENT_LEGAL_VERSIONS,
    });
  });
});

describe("prova 2 — /recuperar-senha fala de link, não de código (L4 com D-082)", () => {
  test("título, descrição e CTA falam de link, sem 'código'", () => {
    const { container } = render(<AuthScreen scenario="forgot-password" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Recuperar senha" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Digite o e-mail da conta. Enviamos um link para você criar uma nova senha.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Enviar link" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Voltar para entrar/ })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(container.textContent).not.toMatch(/código/i);
  });

  test("o envio chama o mesmo endpoint e leva a /solicitacao-enviada", async () => {
    forgotPassword.mockResolvedValueOnce({ message: "ok" });
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith("/solicitacao-enviada"),
    );
    expect(forgotPassword).toHaveBeenCalledWith("camila@studio.com");
  });
});

describe("prova 3 — /solicitacao-enviada segue a hierarquia do quadro L5, sem código", () => {
  test("título, ação principal e 'Usar outro e-mail' para /recuperar-senha", () => {
    render(<AuthScreen scenario="request-sent" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Confira seu e-mail" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para entrar" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.getByRole("link", { name: /Usar outro e-mail/ }),
    ).toHaveAttribute("href", "/recuperar-senha");
  });

  test("a ação principal vem antes de 'Usar outro e-mail'", () => {
    render(<AuthScreen scenario="request-sent" />);

    const primary = screen.getByRole("link", { name: "Voltar para entrar" });
    const other = screen.getByRole("link", { name: /Usar outro e-mail/ });
    expect(
      primary.compareDocumentPosition(other) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("sem caixas de dígito, sem campo de código e sem contagem de reenvio", () => {
    const { container } = render(<AuthScreen scenario="request-sent" />);

    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Reenviar|Não chegou|0:42/);
    expect(container.textContent).not.toMatch(/código/i);
  });
});

// Títulos do conteúdo legal vigente do app, fixos de propósito: comparar a tela só
// com o próprio `document` aprovaria um título trocado pelo do quadro.
const APP_SECTION_TITLES: Readonly<Record<string, readonly string[]>> = {
  "/termos-de-uso": [
    "1. Identificação da responsável",
    "2. Definições",
    "3. A Avenly e os serviços oferecidos",
    "4. Criação e manutenção da conta",
    "5. Responsabilidades do Usuário e credenciais",
    "6. WhatsApp e Serviços de Terceiros",
    "7. Limitações das respostas geradas por IA",
    "8. Revisão de configurações e respostas",
    "9. Uso aceitável e condutas proibidas",
    "10. Contatos, mensagens e bases de destinatários",
    "11. Planos, cobrança, renovação e cancelamento",
    "12. Propriedade intelectual",
    "13. Disponibilidade, atualizações e manutenção",
    "14. Suspensão e encerramento",
    "15. Limitações de responsabilidade",
    "16. Alterações, versões e nova aceitação",
    "17. Legislação aplicável e foro",
    "18. Canal de atendimento",
  ],
  "/politica-de-privacidade": [
    "1. Controlador e canal de privacidade",
    "2. Escopo",
    "3. Categorias de dados tratados",
    "4. Finalidades do tratamento",
    "5. Bases legais",
    "6. Inteligência artificial e decisões automatizadas",
    "7. Fornecedores e operadores",
    "8. WhatsApp e Meta",
    "9. IA, hospedagem, analytics e suporte",
    "10. Transferências internacionais",
    "11. Retenção, descarte e anonimização",
    "12. Segurança",
    "13. Direitos dos titulares",
    "14. Como exercer seus direitos",
    "15. Cookies e tecnologias semelhantes",
    "16. Crianças e adolescentes",
    "17. Alterações, versão e vigência",
    "18. Contato de privacidade",
  ],
};

const legalDocuments: ReadonlyArray<{
  route: string;
  label: string;
  build: () => LegalDocumentContent;
}> = [
  {
    route: "/termos-de-uso",
    label: "Termos de Uso",
    build: () => createTermsOfUse(getLegalDetails()),
  },
  {
    route: "/politica-de-privacidade",
    label: "Política de Privacidade",
    build: () => createPrivacyPolicy(getLegalDetails()),
  },
];

function renderLegal(document: LegalDocumentContent) {
  return render(
    <LegalDocumentLayout
      document={document}
      contactEmail={getLegalDetails().supportEmail}
    />,
  );
}

describe.each(legalDocuments)(
  "prova 4 — $route com a estrutura de L8 e L9",
  ({ label, build }) => {
    test(`${label}: voltar para /cadastro, eyebrow, título, versão e datas do documento`, () => {
      const document = build();
      renderLegal(document);

      const backLinks = screen.getAllByRole("link", {
        name: "Voltar para criar conta",
      });
      expect(backLinks.length).toBeGreaterThan(0);
      for (const link of backLinks) {
        expect(link).toHaveAttribute("href", "/cadastro");
      }
      expect(screen.getByText("Documento legal")).toBeVisible();
      expect(
        screen.getByRole("heading", { level: 1, name: document.title }),
      ).toBeVisible();
      expect(screen.getByText(document.intro)).toBeVisible();
      expect(screen.getByRole("note")).toHaveTextContent("Revisão jurídica");

      for (const [term, value] of [
        ["Versão", document.version],
        ["Vigência", document.effectiveDate],
        ["Última atualização", document.lastUpdatedDate],
      ] as const) {
        const dt = screen.getByText(term, { selector: "dt" });
        expect(dt.nextElementSibling).toHaveTextContent(value);
      }
    });

    test(`${label}: sem o painel de marca da autenticação`, () => {
      const { container } = renderLegal(build());

      expect(screen.queryByText("Informação clara")).not.toBeInTheDocument();
      expect(container.querySelector("aside")).toBeNull();
      expect(
        container.querySelector(
          ".auth-layout, .auth-brand-panel, .entry-shell, .entry-panel",
        ),
      ).toBeNull();
      expect(screen.queryByText("← Voltar ao cadastro")).not.toBeInTheDocument();
    });
  },
);

describe.each(legalDocuments)(
  "prova 5 — sumário de $route",
  ({ route, label, build }) => {
    test(`${label}: um link por seção, apontando para o id da seção`, () => {
      const document = build();
      const { container } = renderLegal(document);

      const toc = screen.getByRole("navigation", { name: "Sumário" });
      const links = within(toc).getAllByRole("link");
      expect(links).toHaveLength(document.sections.length);

      document.sections.forEach((section, index) => {
        expect(links[index]).toHaveAttribute("href", `#${section.id}`);
        expect(links[index]).toHaveTextContent(
          section.title.replace(/^\d+\.\s*/, ""),
        );
        expect(container.querySelector(`section#${section.id}`)).not.toBeNull();
      });
    });

    test(`${label}: o texto e o número das seções são os do conteúdo legal`, () => {
      const document = build();
      const { container } = renderLegal(document);

      const headings = Array.from(
        container.querySelectorAll(".legal-document section[id] > h2"),
      ).map((heading) => heading.textContent);
      expect(headings).toEqual(APP_SECTION_TITLES[route]);
      expect(document.sections.map((section) => section.title)).toEqual(
        APP_SECTION_TITLES[route],
      );

      for (const section of document.sections) {
        const sectionElement = container.querySelector(
          `section#${section.id}`,
        ) as HTMLElement;
        for (const paragraph of section.paragraphs ?? []) {
          expect(
            within(sectionElement).getAllByText(paragraph).length,
          ).toBeGreaterThan(0);
        }
      }
    });
  },
);
