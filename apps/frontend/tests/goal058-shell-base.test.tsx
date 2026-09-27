// @vitest-environment jsdom
/**
 * Goal058 (WU-01): a grade da casca (sidebar de 248px, trilho abaixo de
 * 1100px, cabeçalho móvel e barra inferior abaixo de 768px) agora mora uma
 * única vez em `.app-frame` — a classe que `AppShell` já aplicava em toda
 * casca, junto de `${styleModule}-shell`. Antes, `conversations` e
 * `directory` não tinham CSS de casca nenhuma (removida sem querer em commits
 * antigos) porque cada módulo duplicava a própria declaração. A lista de
 * módulos vem de `SHELL_MODULES`, exportada pelo próprio `AppShell`, para o
 * teste nunca divergir do tipo `ShellModule` de verdade.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AppShell, SHELL_MODULES, type ShellModule } from "@/shared/layout/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
        openConditionsCount: 0,
        unreadCount: 0,
      }),
    },
    status: {
      get: vi.fn().mockResolvedValue({
        accountDeletion: { dueAt: null, status: "NONE" },
        ai: {
          desiredEnabled: true,
          effectiveEnabled: true,
          reconciled: "CONVERGED",
          state: "ACTIVE",
        },
        degraded: false,
        whatsapp: {
          checkedAt: "2026-09-27T12:00:00.000Z",
          phoneNumber: "5511999990000",
          status: "CONNECTED",
        },
      }),
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

/** Mesma regra que `AppShellChrome` usa para nomear `${styleModule}-shell`. */
function styleModuleFor(module: ShellModule): string {
  return module === "system" || module === "migration" ? "settings" : module;
}

describe.each(SHELL_MODULES)("casca do módulo %s", (module) => {
  test("recebe a classe base .app-frame junto da classe do módulo", async () => {
    render(
      <AppShell active="inicio" module={module} title="Teste">
        <p>Conteúdo</p>
      </AppShell>,
    );

    const content = await screen.findByText("Conteúdo");
    const shell = content.closest(".app-frame");

    expect(shell).not.toBeNull();
    expect(shell).toHaveClass("app-frame");
    expect(shell).toHaveClass(`${styleModuleFor(module)}-shell`);
  });
});
