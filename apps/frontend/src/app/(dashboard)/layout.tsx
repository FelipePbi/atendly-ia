import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentSession } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.onboarding.completed) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      initialUser={session.user}
      initialSettings={session.settings}
      initialWhatsappInstance={session.whatsappInstance}
    >
      {children}
    </AppShell>
  );
}
