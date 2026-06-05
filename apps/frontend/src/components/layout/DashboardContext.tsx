"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiOnboarding, ApiSettings, ApiUser, ApiWhatsAppInstance } from "@/types/domain";

type MeResponse = {
  ok: boolean;
  user: ApiUser;
  onboarding: ApiOnboarding;
  settings: ApiSettings;
  whatsappInstance: ApiWhatsAppInstance | null;
  details?: {
    whatsappInstance?: ApiWhatsAppInstance | null;
  };
  error?: string;
};

type WhatsAppStatusResponse = {
  ok: boolean;
  whatsappInstance?: ApiWhatsAppInstance | null;
  settings?: ApiSettings;
  details?: {
    whatsappInstance?: ApiWhatsAppInstance | null;
    settings?: ApiSettings;
  };
  error?: string;
};

type SettingsResponse = {
  ok: boolean;
  settings?: ApiSettings;
  error?: string;
};

type DashboardContextValue = {
  user: ApiUser;
  settings: ApiSettings;
  whatsappInstance: ApiWhatsAppInstance | null;
  refreshDashboard: () => Promise<void>;
  refreshWhatsappStatus: () => Promise<ApiWhatsAppInstance | null>;
  updateAiEnabled: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  initialUser,
  initialSettings,
  initialWhatsappInstance,
  children,
}: {
  initialUser: ApiUser;
  initialSettings: ApiSettings;
  initialWhatsappInstance: ApiWhatsAppInstance | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [settings, setSettings] = useState(initialSettings);
  const [whatsappInstance, setWhatsappInstance] = useState(initialWhatsappInstance);

  const refreshDashboard = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    const data = (await response.json().catch(() => null)) as MeResponse | null;
    if (!response.ok || !data) return;

    if (!data.onboarding?.completed) {
      router.replace("/onboarding");
      return;
    }

    setUser(data.user);
    setSettings(data.settings);
    setWhatsappInstance(data.whatsappInstance ?? data.details?.whatsappInstance ?? null);
  }, [router]);

  const refreshWhatsappStatus = useCallback(async () => {
    const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }

    const data = (await response.json().catch(() => null)) as WhatsAppStatusResponse | null;
    const nextInstance = data?.whatsappInstance ?? data?.details?.whatsappInstance ?? null;
    const nextSettings = data?.settings ?? data?.details?.settings;
    if (nextSettings) {
      setSettings(nextSettings);
    }

    setWhatsappInstance(nextInstance);
    return nextInstance;
  }, [router]);

  const updateAiEnabled = useCallback(
    async (enabled: boolean) => {
      const previousSettings = settings;
      setSettings((current) => ({ ...current, aiEnabled: enabled }));

      try {
        const response = await fetch("/api/automation/ai", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ aiEnabled: enabled }),
        });

        if (response.status === 401) {
          router.replace("/login");
          return { ok: false, error: "Sessao invalida." };
        }

        const data = (await response.json().catch(() => null)) as SettingsResponse | null;
        if (!response.ok || !data?.settings) {
          setSettings(previousSettings);
          return { ok: false, error: data?.error ?? "Nao foi possivel atualizar a IA." };
        }

        setSettings(data.settings);
        return { ok: true };
      } catch {
        setSettings(previousSettings);
        return { ok: false, error: "Nao foi possivel atualizar a IA." };
      }
    },
    [router, settings]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWhatsappStatus();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [refreshWhatsappStatus]);

  const value = useMemo(
    () => ({
      user,
      settings,
      whatsappInstance,
      refreshDashboard,
      refreshWhatsappStatus,
      updateAiEnabled,
    }),
    [refreshDashboard, refreshWhatsappStatus, settings, updateAiEnabled, user, whatsappInstance]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider.");
  }

  return context;
}
