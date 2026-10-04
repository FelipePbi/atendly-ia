// @vitest-environment jsdom
/**
 * Goal028 WU-05: resíduo do Goal027. `external-unavailable` saiu de
 * `SystemScreen.tsx` e "agenda-indisponivel" saiu do mapa de rota — esta
 * suíte prova que os cenários sobreviventes continuam intactos e que a rota
 * removida não resolve mais para cenário nenhum.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { type SystemScenario, SystemScreen } from "@/features/system/SystemScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

function renderScenario(scenario: SystemScenario) {
  return render(
    <ShellConfigProvider>
      <SystemScreen scenario={scenario} />
    </ShellConfigProvider>,
  );
}

describe("cenários sobreviventes de SystemScreen", () => {
  test("offline renderiza seu texto e sua ação", () => {
    renderScenario("offline");

    expect(screen.getByRole("heading", { name: "Você está sem conexão" })).toBeVisible();
    expect(screen.getByText("Avenly está offline")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para Início" }),
    ).toHaveAttribute("href", "/inicio");
  });

  test("error renderiza seu texto e sua ação", () => {
    renderScenario("error");

    expect(
      screen.getByRole("heading", { name: "Algo não saiu como esperado" }),
    ).toBeVisible();
    expect(screen.getByText("A última ação não foi concluída")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Voltar para Início" }),
    ).toHaveAttribute("href", "/inicio");
  });

  test("session-expired renderiza seu texto e sua ação", () => {
    renderScenario("session-expired");

    expect(
      screen.getByRole("heading", { name: "Sua sessão expirou" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Entrar novamente" }),
    ).toHaveAttribute("href", "/login");
  });
});

describe("cenário external-unavailable removido (resíduo do Goal027)", () => {
  test("SystemScenario não aceita mais 'external-unavailable' (checado por tsc)", () => {
    // @ts-expect-error "external-unavailable" não é mais um SystemScenario válido.
    const removed: SystemScenario = "external-unavailable";
    expect(removed).toBe("external-unavailable");
  });

  test("nenhuma menção a 'Minha Agenda está indisponível' sobrevive em nenhum cenário", () => {
    for (const scenario of ["offline", "error", "session-expired"] as const) {
      const { unmount } = renderScenario(scenario);
      expect(
        screen.queryByText("Minha Agenda está indisponível"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Minha Agenda indisponível"),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("rota /sistema/[state] removida", () => {
  test("generateStaticParams não gera mais rota estática para 'agenda-indisponivel'", async () => {
    const { generateStaticParams } = await import(
      "@/app/(platform)/sistema/[state]/page"
    );
    expect(generateStaticParams().map((p) => p.state)).toEqual([
      "offline",
      "erro",
      "sessao-expirada",
    ]);
  });

  test("'agenda-indisponivel' não resolve para cenário nenhum: dispara 404", async () => {
    const SystemPage = (await import("@/app/(platform)/sistema/[state]/page"))
      .default;
    await expect(
      SystemPage({ params: Promise.resolve({ state: "agenda-indisponivel" }) }),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
