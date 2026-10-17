"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AppearancePreference } from "@/data";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";

import {
  ACCENT_OPTIONS,
  applyAppearance,
  DARK_QUERY,
  DEFAULT_APPEARANCE,
  MODE_OPTIONS,
  readStoredAppearance,
  type ResolvedTheme,
  resolveTheme,
  sameAppearance,
  storeAppearance,
  systemPrefersDark,
} from "./appearance";

type AppearanceContextValue = {
  appearance: AppearancePreference;
  /** A escolha não foi salva na conta e voltou para a anterior. */
  failed: boolean;
  saving: boolean;
  setAppearance: (next: AppearancePreference) => Promise<void>;
  theme: ResolvedTheme;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Mantém a aparência da conta (D-181) no `<html>`: começa pela cópia local
 * (a mesma que o script do `<head>` já aplicou), confere com a conta quando
 * há sessão e acompanha o sistema no modo Automático.
 *
 * Trocar aplica na hora, guarda a cópia local e grava na conta; se a conta
 * recusar, volta para a anterior e avisa — a tela nunca mostra salvo o que
 * não foi salvo.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { phase, session } = useProductRuntime();
  const [appearance, setState] = useState<AppearancePreference>(() =>
    typeof window === "undefined" ? DEFAULT_APPEARANCE : readStoredAppearance(),
  );
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window === "undefined" ? false : systemPrefersDark(),
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef(appearance);
  const version = useRef(0);

  // O React do desenvolvimento remonta e limpa os atributos do <html> que o
  // script pôs; reaplicar antes da pintura é inofensivo em produção.
  useLayoutEffect(() => {
    applyAppearance(current.current);
  }, []);

  const adopt = useCallback((next: AppearancePreference, animate: boolean) => {
    current.current = next;
    setState(next);
    storeAppearance(next);
    applyAppearance(next, { animate });
  }, []);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
      if (current.current.mode === "SYSTEM")
        applyAppearance(current.current, {
          animate: true,
          prefersDark: event.matches,
        });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // A conta manda: outro aparelho pode ter mudado a escolha.
  const userId = session?.user.id ?? null;
  const signedIn = phase === "authenticated" || phase === "onboarding";
  useEffect(() => {
    if (!signedIn || !userId) return;
    const controller = new AbortController();
    const asked = version.current;
    getProductServices()
      .settings.getAppearance(controller.signal)
      .then((stored) => {
        if (version.current !== asked) return;
        if (!sameAppearance(stored, current.current)) adopt(stored, true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [adopt, signedIn, userId]);

  const setAppearance = useCallback(
    async (next: AppearancePreference) => {
      const previous = current.current;
      if (sameAppearance(previous, next)) return;
      const mine = ++version.current;
      setFailed(false);
      setSaving(true);
      adopt(next, true);
      try {
        await getProductServices().settings.updateAppearance(next);
      } catch {
        if (version.current !== mine) return;
        adopt(previous, true);
        setFailed(true);
      } finally {
        if (version.current === mine) setSaving(false);
      }
    },
    [adopt],
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      failed,
      saving,
      setAppearance,
      theme: resolveTheme(appearance.mode, prefersDark),
    }),
    [appearance, failed, prefersDark, saving, setAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value)
    throw new Error("useAppearance must be used inside AppearanceProvider.");
  return value;
}

/** Claro ou escuro em uso; fora do provider (testes), o padrão claro. */
export function useResolvedTheme(): ResolvedTheme {
  return useContext(AppearanceContext)?.theme ?? "light";
}

/** "Rosé · Escuro", para a linha da lista de Configurações. */
export function useAppearanceSummary(): string {
  const appearance =
    useContext(AppearanceContext)?.appearance ?? DEFAULT_APPEARANCE;
  const accent = ACCENT_OPTIONS.find((o) => o.id === appearance.accent);
  const mode = MODE_OPTIONS.find((o) => o.id === appearance.mode);
  return `${accent?.label ?? ""} · ${mode?.label ?? ""}`;
}
