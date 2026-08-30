"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BffHttpError,
  type BffServiceRegistry,
  createBffServiceRegistry,
  type Session,
} from "@/data";

type RuntimePhase =
  "authenticated" | "checking" | "error" | "onboarding" | "unauthenticated";

type ProductRuntimeValue = {
  phase: RuntimePhase;
  refreshSession: () => Promise<Session | null>;
  session: Session | null;
  setUnauthenticated: () => void;
};

const ProductRuntimeContext = createContext<ProductRuntimeValue | null>(null);

let registry: BffServiceRegistry | undefined;

export function getProductServices(): BffServiceRegistry {
  registry ??= createBffServiceRegistry();
  return registry;
}

export function ProductRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<RuntimePhase>("checking");
  const [session, setSession] = useState<Session | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = await getProductServices().auth.session();
      setSession(nextSession);
      setPhase(
        nextSession.onboardingCompleted ? "authenticated" : "onboarding",
      );
      return nextSession;
    } catch (error: unknown) {
      if (error instanceof BffHttpError && error.status === 401) {
        setSession(null);
        setPhase("unauthenticated");
        return null;
      }
      setSession(null);
      setPhase("error");
      throw error;
    }
  }, []);

  const setUnauthenticated = useCallback(() => {
    setSession(null);
    setPhase("unauthenticated");
  }, []);

  useEffect(() => {
    if (isPreviewPath(pathname)) return;
    const timer = window.setTimeout(() => {
      void refreshSession().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, refreshSession]);

  useEffect(() => {
    if (phase === "checking" || phase === "error" || isPublicDocument(pathname))
      return;

    if (isAuthPath(pathname)) {
      if (phase === "authenticated") router.replace("/inicio");
      if (phase === "onboarding") router.replace("/onboarding");
      return;
    }

    if (isOnboardingPath(pathname)) {
      if (phase === "unauthenticated") router.replace("/login");
      if (phase === "authenticated") router.replace("/inicio");
      return;
    }

    if (isPreviewPath(pathname)) return;
    if (phase === "unauthenticated") router.replace("/login");
    if (phase === "onboarding") router.replace("/onboarding");
  }, [pathname, phase, router]);

  const value = useMemo<ProductRuntimeValue>(
    () => ({ phase, refreshSession, session, setUnauthenticated }),
    [phase, refreshSession, session, setUnauthenticated],
  );

  if (isPreviewPath(pathname) || isPublicDocument(pathname)) {
    return (
      <ProductRuntimeContext.Provider value={value}>
        {children}
      </ProductRuntimeContext.Provider>
    );
  }

  const protectedPath = !isAuthPath(pathname);
  const waitingForRedirect =
    (isAuthPath(pathname) &&
      (phase === "authenticated" || phase === "onboarding")) ||
    (isOnboardingPath(pathname) &&
      (phase === "authenticated" || phase === "unauthenticated")) ||
    (protectedPath &&
      !isOnboardingPath(pathname) &&
      (phase === "onboarding" || phase === "unauthenticated"));

  if (protectedPath && (phase === "checking" || waitingForRedirect)) {
    return <RuntimeLoading />;
  }

  if (protectedPath && phase === "error") {
    return (
      <RuntimeError
        onRetry={() => void refreshSession().catch(() => undefined)}
      />
    );
  }

  return (
    <ProductRuntimeContext.Provider value={value}>
      {children}
    </ProductRuntimeContext.Provider>
  );
}

export function useProductRuntime(): ProductRuntimeValue {
  const value = useContext(ProductRuntimeContext);
  if (!value) {
    throw new Error(
      "useProductRuntime must be used inside ProductRuntimeProvider.",
    );
  }
  return value;
}

function RuntimeLoading() {
  return (
    <main className="onboarding-shell" aria-busy="true" aria-live="polite">
      <section className="onboarding-main">
        <div className="analysis-panel">
          <span className="spinner" aria-hidden="true" />
          <h1>Verificando seu acesso</h1>
          <p>Carregando sua conta e o ambiente do negócio.</p>
        </div>
      </section>
    </main>
  );
}

function RuntimeError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-main">
        <div className="analysis-panel" role="alert">
          <h1>Não foi possível verificar seu acesso</h1>
          <p>Confira sua conexão e tente novamente.</p>
          <button className="btn btn-primary" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      </section>
    </main>
  );
}

function isAuthPath(pathname: string): boolean {
  return [
    "/cadastro",
    "/link-expirado",
    "/login",
    "/nova-senha",
    "/recuperar-senha",
    "/solicitacao-enviada",
  ].includes(pathname);
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

function isPreviewPath(pathname: string): boolean {
  return pathname === "/_preview" || pathname.startsWith("/_preview/");
}

function isPublicDocument(pathname: string): boolean {
  return (
    pathname === "/politica-de-privacidade" || pathname === "/termos-de-uso"
  );
}
