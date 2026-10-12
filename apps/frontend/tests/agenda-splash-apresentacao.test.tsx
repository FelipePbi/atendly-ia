// @vitest-environment jsdom
/**
 * Depois do splash da Avenly, nada de esqueleto (pedido do usuário,
 * 2026-10-12, revisão de D-168). Ao recarregar a Agenda (F5) o usuário via o
 * splash da marca e, logo depois, o esqueleto da grade por ~1 s. A regra:
 *
 * - o splash cobre a verificação da sessão E a primeira leitura da tela: a
 *   tela monta por baixo dele, e enquanto ele cobre nenhum esqueleto é
 *   confirmado (`useDeferredLoading`);
 * - o splash sai quando a tela libera o `loading` declarado à casca (ou no
 *   prazo máximo, para uma leitura que falha nunca o prender), em 160 ms;
 * - a tela de baixo se apresenta: a raiz recebe `is-presenting` por ~700 ms
 *   e os blocos marcados (`data-present` 1, 2, 3) entram escalonados;
 * - com `prefers-reduced-motion` a apresentação não liga (atributo, não cor);
 * - é só no primeiro carregamento: uma troca depois não repete.
 *
 * jsdom não anima: os tempos e as curvas são conferidos no CSS, com os tokens.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type * as DataModule from "@/data";
import type { Appointment, CalendarState, Session } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import {
  armSplash,
  coverSplash,
  resetSplashForTests,
  SPLASH_HOLD_TIMEOUT_MS,
  SPLASH_LEAVE_MS,
  SPLASH_PRESENT_MS,
  SPLASH_SETTLE_MS,
  useSplashPresenting,
} from "@/shared/motion/splash";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { ProductRuntimeProvider } from "@/shared/runtime/ProductRuntime";
import { forget } from "@/shared/runtime/sessionMemory";

const session = vi.fn();
const getCalendar = vi.fn();
const getAppointment = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/agenda",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// A casca de verdade pede status, notificações e sessão; aqui só importa que
// a tela esteja dentro de `PlatformShellFrame`, que segura o splash.
vi.mock("@/shared/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

vi.mock("@/data", async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  return {
    ...actual,
    createBffServiceRegistry: () => ({
      auth: { session },
      calendar: {
        getAppointment,
        getCalendar,
        listAppointmentEvents,
        listAppointmentNotifications,
        listAppointments,
        listAvailabilityExceptions,
        listTimeBlocks,
      },
      serviceCatalog: { list: listCatalog },
      settings: { get: getSettings, getAgendaViewPreference },
    }),
  };
});

const stylesDir = path.join(__dirname, "../src/shared/styles");
const motionCss = readFileSync(
  path.join(stylesDir, "avenly-motion.css"),
  "utf8",
);
const baseCss = readFileSync(path.join(stylesDir, "avenly.css"), "utf8");

function sessionFixture(): Session {
  return {
    businessProfile: null,
    onboardingCompleted: true,
    tenant: { id: "t-1", name: "Studio Camila" },
    user: { email: "camila@example.com", id: "u-1", name: "Camila" },
  } as unknown as Session;
}

function calendarFixture(): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function appointment(id: string, date: string, name: string): Appointment {
  return {
    createdAt: `${date}T10:00:00.000Z`,
    customer: { id: `c-${id}`, name, phone: null },
    customerId: `c-${id}`,
    date,
    durationMinutes: 60,
    endTime: "11:00",
    id,
    notes: null,
    presenceConfirmedAt: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte",
        price: 90,
        priceType: "FIXED",
        serviceId: "s-1",
      },
    ],
    source: "MANUAL",
    startAt: `${date}T13:00:00.000Z`,
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
  } as unknown as Appointment;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }));
}

/** Uma tela logada como a casca a vê: declara `loading` e mostra esqueleto com atraso. */
function Screen({ loading }: { loading: boolean }) {
  useShellConfig({ active: "agenda", loading, module: "agenda", title: "Agenda" });
  const skeleton = useDeferredLoading(loading);
  const presenting = useSplashPresenting();
  return (
    <div
      className={presenting ? "is-presenting" : undefined}
      data-presenting={presenting ? "true" : undefined}
      data-testid="screen"
    >
      {skeleton ? (
        <div className="skeleton" data-testid="skeleton" />
      ) : loading ? (
        "Lendo"
      ) : (
        "Conteúdo"
      )}
    </div>
  );
}

function renderRuntime(loading: boolean) {
  return render(
    <ProductRuntimeProvider>
      <PlatformLayout>
        <Screen loading={loading} />
      </PlatformLayout>
    </ProductRuntimeProvider>,
  );
}

function splash(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-splash]");
}

async function tick(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
  window.innerWidth = 1366;
  window.localStorage.clear();
  stubMatchMedia(false);
  forget();
  resetSplashForTests();
  session.mockReset().mockResolvedValue(sessionFixture());
  getCalendar.mockReset().mockResolvedValue(calendarFixture());
  getAppointment.mockReset().mockImplementation(never);
  listAppointmentEvents.mockReset().mockImplementation(never);
  listAppointmentNotifications.mockReset().mockImplementation(never);
  listAppointments.mockReset().mockResolvedValue([]);
  listAvailabilityExceptions.mockReset().mockResolvedValue([]);
  listTimeBlocks.mockReset().mockResolvedValue([]);
  getAgendaViewPreference.mockReset().mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "DAY",
  });
  getSettings.mockReset().mockResolvedValue({ availability: { rules: [] } });
  listCatalog.mockReset().mockResolvedValue({ items: [] });
});

afterEach(() => {
  resetSplashForTests();
  vi.useRealTimers();
});

describe("o splash da marca cobre a primeira leitura da tela", () => {
  test("verificando a sessão, só o splash; com a sessão, a tela monta por baixo e nenhum esqueleto aparece enquanto ele cobre", async () => {
    const access = deferred<Session>();
    session.mockReturnValue(access.promise);
    const view = renderRuntime(true);

    expect(splash()).toHaveAttribute("data-splash", "covering");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verificando seu acesso",
    );
    expect(screen.queryByTestId("screen")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      access.resolve(sessionFixture());
      await Promise.resolve();
    });
    await tick();

    // A tela está no DOM, sob o splash, lendo — e o atraso de ~150 ms do
    // esqueleto passa sem que ele seja confirmado.
    expect(screen.getByTestId("screen")).toHaveTextContent("Lendo");
    expect(splash()).toHaveAttribute("data-splash", "covering");
    await tick(SPLASH_SETTLE_MS + 300);
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();
    expect(splash()).toHaveAttribute("data-splash", "covering");

    // A leitura terminou: o splash sai e a tela se apresenta.
    view.rerender(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <Screen loading={false} />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick();
    expect(screen.getByTestId("screen")).toHaveTextContent("Conteúdo");
    expect(splash()).toHaveAttribute("data-splash", "leaving");
    expect(splash()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("screen")).toHaveAttribute(
      "data-presenting",
      "true",
    );
    expect(screen.getByTestId("screen")).toHaveClass("is-presenting");

    await tick(SPLASH_LEAVE_MS);
    expect(splash()).toBeNull();
    await tick(SPLASH_PRESENT_MS);
    expect(screen.getByTestId("screen")).not.toHaveAttribute(
      "data-presenting",
    );
    expect(screen.getByTestId("screen")).not.toHaveClass("is-presenting");
  });

  test("uma tela que não declara leitura é mostrada logo depois da sessão", async () => {
    renderRuntime(false);
    await tick(1);
    await tick(SPLASH_SETTLE_MS);
    expect(screen.getByTestId("screen")).toHaveTextContent("Conteúdo");
    expect(splash()).toHaveAttribute("data-splash", "leaving");
    await tick(SPLASH_LEAVE_MS);
    expect(splash()).toBeNull();
  });

  test("uma leitura que nunca termina não prende o splash além do prazo máximo", async () => {
    renderRuntime(true);
    await tick(1);
    await tick(SPLASH_HOLD_TIMEOUT_MS - 100);
    expect(splash()).toHaveAttribute("data-splash", "covering");
    await tick(200);
    expect(splash()).toHaveAttribute("data-splash", "leaving");
  });

  test("com prefers-reduced-motion a tela aparece sem a apresentação", async () => {
    stubMatchMedia(true);
    renderRuntime(false);
    await tick(1);
    await tick(SPLASH_SETTLE_MS);
    expect(splash()).toHaveAttribute("data-splash", "leaving");
    expect(screen.getByTestId("screen")).not.toHaveAttribute(
      "data-presenting",
    );
    expect(screen.getByTestId("screen")).not.toHaveClass("is-presenting");
  });

  test("a página que chega depois da sessão (streaming) ainda encontra o splash: ele só se arma quando a tela se declara à casca", async () => {
    const view = render(
      <ProductRuntimeProvider>
        <PlatformLayout>{null}</PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick(1);
    // Sessão liberada, nenhuma tela ainda: o instante de assentamento passa
    // e o splash continua cobrindo.
    await tick(SPLASH_SETTLE_MS + 200);
    expect(splash()).toHaveAttribute("data-splash", "covering");

    view.rerender(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <Screen loading />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick(SPLASH_SETTLE_MS + 300);
    expect(screen.getByTestId("screen")).toHaveTextContent("Lendo");
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(splash()).toHaveAttribute("data-splash", "covering");

    view.rerender(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <Screen loading={false} />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick();
    expect(splash()).toHaveAttribute("data-splash", "leaving");
    expect(screen.getByTestId("screen")).toHaveClass("is-presenting");
  });

  test("F5 no detalhe do agendamento (celular): o splash espera o agendamento, e o corpo entra sem esqueleto", async () => {
    const read = deferred<Appointment>();
    getAppointment.mockReturnValue(read.promise);
    render(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <AppointmentDetail appointmentId="a-1" />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick(1);
    await tick(SPLASH_SETTLE_MS + 300);
    expect(splash()).toHaveAttribute("data-splash", "covering");
    expect(document.querySelector(".skeleton")).toBeNull();

    await act(async () => {
      read.resolve(appointment("a-1", "2026-10-12", "Ana Paula"));
      await Promise.resolve();
    });
    await tick();
    expect(
      screen.getByRole("heading", { name: "Ana Paula" }),
    ).toBeInTheDocument();
    expect(splash()).toHaveAttribute("data-splash", "leaving");
    expect(document.querySelector(".skeleton")).toBeNull();
    // Histórico e lembrete ainda lendo: linha reservada, sem brilho.
    await tick(300);
    expect(document.querySelector(".skeleton")).toBeNull();
  });

  test("é um evento por documento: depois da saída, uma nova leitura não cobre nem apresenta de novo", async () => {
    const view = renderRuntime(false);
    await tick(1);
    await tick(SPLASH_SETTLE_MS + SPLASH_LEAVE_MS + SPLASH_PRESENT_MS);
    expect(splash()).toBeNull();

    view.rerender(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <Screen loading />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick(300);
    expect(splash()).toBeNull();
    expect(screen.getByTestId("screen")).not.toHaveAttribute(
      "data-presenting",
    );
    // Fora do splash, o esqueleto de uma leitura longa continua valendo.
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });
});

describe("a Agenda se apresenta depois do splash", () => {
  test("a raiz recebe is-presenting e os blocos levam a ordem: barra (1), painel (3); a grade vem do próprio bloco do Dia", async () => {
    coverSplash();
    render(
      <ProductRuntimeProvider>
        <PlatformLayout>
          <AgendaBoard />
        </PlatformLayout>
      </ProductRuntimeProvider>,
    );
    await tick(1);
    // Sob o splash: a Agenda lê e nunca mostra o esqueleto da grade.
    await tick(300);
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();

    await screen.findByRole("region", { name: /Agenda de/ });
    armSplash();
    await tick(SPLASH_SETTLE_MS);
    const page = document.querySelector(".agenda-page");
    expect(page).toHaveClass("is-presenting");
    expect(page).toHaveAttribute("data-presenting", "true");
    expect(
      document.querySelector('.agenda-command-bar[data-present="1"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('.agenda-day-detail[data-present="3"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(".agenda-day-layout > .agenda-day-panel"),
    ).not.toBeNull();

    await tick(SPLASH_LEAVE_MS + SPLASH_PRESENT_MS);
    expect(page).not.toHaveClass("is-presenting");
    expect(page).not.toHaveAttribute("data-presenting");
  });
});

describe("CSS da apresentação e da saída do splash", () => {
  test("os blocos entram com os tokens, escalonados por ordem, e a barra só esmaece", () => {
    expect(motionCss).toMatch(
      /\.is-presenting \[data-present\][\s\S]*?\{\s*--present-tier: 1;\s*animation: motion-rise-in var\(--at-duration-moderate\) var\(--at-ease-standard\)\s*both;\s*animation-delay: calc\(\(var\(--present-tier\) - 1\) \* var\(--at-duration-instant\)\);/,
    );
    expect(motionCss).toMatch(
      /\.is-presenting \[data-present="1"\] \{\s*animation-name: motion-fade-in;/,
    );
    expect(motionCss).toMatch(/\.is-presenting \[data-present="2"\],[\s\S]*?--present-tier: 2;/);
    expect(motionCss).toMatch(/\.is-presenting \[data-present="3"\],[\s\S]*?--present-tier: 3;/);
  });

  test("com prefers-reduced-motion a apresentação é desligada no CSS também", () => {
    const reduced = motionCss.slice(
      motionCss.indexOf("@media (prefers-reduced-motion: reduce) {"),
    );
    expect(reduced).toMatch(
      /\.is-presenting \[data-present\],[\s\S]*?\{\s*animation: none;/,
    );
  });

  test("o splash cobre a tela e sai em 160 ms pelos tokens", () => {
    expect(baseCss).toMatch(
      /\.brand-loader-screen \{[^}]*position: fixed;[^}]*inset: 0;/,
    );
    expect(baseCss).toMatch(
      /\.brand-loader-screen\.is-leaving \{\s*pointer-events: none;\s*animation: motion-fade-out var\(--at-duration-fast\) var\(--at-ease-exit\) both;/,
    );
  });
});
