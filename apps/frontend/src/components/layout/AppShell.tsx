"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { DashboardProvider } from "@/components/layout/DashboardContext";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import type { ApiSettings, ApiUser, ApiWhatsAppInstance } from "@/types/domain";

export function AppShell({
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <DashboardProvider
      initialUser={initialUser}
      initialSettings={initialSettings}
      initialWhatsappInstance={initialWhatsappInstance}
    >
      <div className="grid min-h-dvh bg-background lg:grid-cols-[256px_minmax(0,1fr)]">
        <AppSidebar className="hidden lg:block" />
        <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <div className="flex min-h-dvh min-w-0 flex-col">
          <AppHeader onMenuClick={() => setMobileMenuOpen(true)} />
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </DashboardProvider>
  );
}
