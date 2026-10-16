"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BffHttpError,
  type BffServiceRegistry,
  createBffServiceRegistry,
  onUnauthorized,
  type Session,
} from "@/data";
import {
  coverSplash,
  scheduleSplashTimeout,
  useSplash,
} from "@/shared/motion/splash";
import { BrandLoader, BrandMark } from "@/shared/ui/Brand";

import { claimSessionMemory } from "./sessionMemory";

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

/** Intervalo mínimo entre duas conferências da sessão ao voltar para a aba. */
const SESSION_RECHECK_MS = 60_000;

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
      // Outra pessoa ou outro negócio nunca vê o que a sessão anterior leu (D-167).
      claimSessionMemory(`${nextSession.user.id}:${nextSession.tenant.id}`);
      // A mesma sessão de antes não troca de objeto: a tela não re-renderiza
      // inteira só porque a sessão foi conferida.
      setSession((current) =>
        current && JSON.stringify(current) === JSON.stringify(nextSession)
          ? current
          : nextSession,
      );
      setPhase(
        nextSession.onboardingCompleted ? "authenticated" : "onboarding",
      );
      return nextSession;
    } catch (error: unknown) {
      if (error instanceof BffHttpError && error.status === 401) {
        claimSessionMemory(null);
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
    claimSessionMemory(null);
    setSession(null);
    setPhase("unauthenticated");
  }, []);

  // A sessão é lida uma vez ao abrir o app, não a cada mudança de URL
  // (2026-10-16: antes cada clique gerava um GET /v1/auth/session). Login,
  // logout e onboarding a releem pelo próprio fluxo. Depois disso ela é
  // conferida de novo só quando a pessoa volta para a aba (no máximo uma vez
  // por minuto) e quando alguma chamada volta 401.
  const lastCheck = useRef(0);
  const checkSession = useCallback(() => {
    lastCheck.current = Date.now();
    void refreshSession().catch(() => undefined);
  }, [refreshSession]);

  useEffect(() => {
    const timer = window.setTimeout(checkSession, 0);
    return () => window.clearTimeout(timer);
  }, [checkSession]);

  useEffect(() => {
    function onReturn() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck.current < SESSION_RECHECK_MS) return;
      checkSession();
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [checkSession]);

  useEffect(() => onUnauthorized(checkSession), [checkSession]);

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

    if (phase === "unauthenticated") router.replace("/login");
    if (phase === "onboarding") router.replace("/onboarding");
  }, [pathname, phase, router]);

  const value = useMemo<ProductRuntimeValue>(
    () => ({ phase, refreshSession, session, setUnauthenticated }),
    [phase, refreshSession, session, setUnauthenticated],
  );

  const publicDocument = isPublicDocument(pathname);
  const protectedPath = !publicDocument && !isAuthPath(pathname);
  const waitingForRedirect =
    !publicDocument &&
    ((isAuthPath(pathname) &&
      (phase === "authenticated" || phase === "onboarding")) ||
      (isOnboardingPath(pathname) &&
        (phase === "authenticated" || phase === "unauthenticated")) ||
      (protectedPath &&
        !isOnboardingPath(pathname) &&
        (phase === "onboarding" || phase === "unauthenticated")));
  const checkingAccess =
    protectedPath && (phase === "checking" || waitingForRedirect);
  // Primeiro carregamento de uma tela logada (D-168, revisão de 2026-10-12):
  // o splash cobre a verificação da sessão E a primeira leitura da tela, que
  // monta por baixo dele; sai quando ela terminou (a casca arma a saída no
  // primeiro `useShellConfig` da tela e a segura enquanto ela declara
  // `loading`), e a tela se apresenta. O prazo máximo começa aqui.
  const splash = useSplash();
  const screenMounted =
    protectedPath && !isOnboardingPath(pathname) && phase === "authenticated";
  useEffect(() => {
    if (checkingAccess) coverSplash();
  }, [checkingAccess]);
  useEffect(() => {
    if (screenMounted) scheduleSplashTimeout();
  }, [screenMounted]);
  const splashShown =
    checkingAccess || (screenMounted && (splash.covering || splash.leaving));

  if (publicDocument) {
    return (
      <ProductRuntimeContext.Provider value={value}>
        {children}
      </ProductRuntimeContext.Provider>
    );
  }

  if (protectedPath && phase === "error") {
    return (
      <RuntimeError
        onRetry={() => void refreshSession().catch(() => undefined)}
      />
    );
  }

  // O splash fica sempre na mesma posição da árvore: é o mesmo elemento da
  // verificação da sessão até a saída, para a respiração do símbolo não
  // recomeçar no meio.
  return (
    <ProductRuntimeContext.Provider value={value}>
      {checkingAccess ? null : children}
      {splashShown && <RuntimeLoading leaving={splash.leaving} />}
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

function RuntimeLoading({ leaving = false }: { leaving?: boolean }) {
  return <BrandLoader label="Verificando seu acesso" leaving={leaving} />;
}

function RuntimeError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-main">
        <div className="analysis-panel" role="alert">
          <span className="analysis-panel-mark">
            <BrandMark />
          </span>
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

function isPublicDocument(pathname: string): boolean {
  return (
    pathname === "/politica-de-privacidade" || pathname === "/termos-de-uso"
  );
}
