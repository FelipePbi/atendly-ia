// @vitest-environment jsdom

import type { AnchorHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationDraftProvider } from "./RegistrationDraftProvider";
import { RegisterForm, TERMS_ERROR_MESSAGE } from "./RegisterForm";
import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a
      href={href}
      onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

function renderForm() {
  return render(
    <RegistrationDraftProvider>
      <RegisterForm />
    </RegistrationDraftProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RegisterForm legal acceptance", () => {
  it("starts unchecked and exposes an accessible checkbox name", () => {
    renderForm();

    const checkbox = screen.getByRole("checkbox", {
      name: /Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade/i,
    });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect(checkbox.hasAttribute("required")).toBe(true);
  });

  it("blocks submission, announces the exact error and focuses the checkbox", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    const checkbox = screen.getByRole("checkbox");
    expect((await screen.findByRole("alert")).textContent).toBe(TERMS_ERROR_MESSAGE);
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(checkbox);
  });

  it("renders independent legal links and clicking them does not toggle acceptance", () => {
    renderForm();
    const checkbox = screen.getByRole("checkbox");
    const terms = screen.getByRole("link", { name: "Termos de Uso" });
    const privacy = screen.getByRole("link", { name: "Política de Privacidade" });

    expect(terms.getAttribute("href")).toBe("/termos-de-uso");
    expect(privacy.getAttribute("href")).toBe("/politica-de-privacidade");
    fireEvent.click(terms);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(privacy);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it("supports keyboard focus and Space activation", async () => {
    const user = userEvent.setup();
    renderForm();
    const checkbox = screen.getByRole("checkbox");

    checkbox.focus();
    await user.keyboard(" ");

    expect(document.activeElement).toBe(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it("submits only current versions and no client timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "safe-password");
    await user.type(screen.getByLabelText("Confirmar senha"), "safe-password");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      email: "owner@example.com",
      termsAccepted: true,
      ...CURRENT_LEGAL_VERSIONS,
    });
    expect(payload).not.toHaveProperty("acceptedAt");
    expect(router.replace).toHaveBeenCalledWith("/onboarding");
  });
});
