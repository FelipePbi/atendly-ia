import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppShell } from "@/components/layout/AppShell";
import { authOptions } from "@/lib/auth";
import { instanceDto, settingsDto, userDto } from "@/lib/dto";
import { onboardingComplete } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      settings: true,
      whatsappInstance: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (!onboardingComplete(user.profile, user.settings)) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      initialUser={userDto(user)}
      initialSettings={settingsDto(user.settings)}
      initialWhatsappInstance={instanceDto(user.whatsappInstance)}
    >
      {children}
    </AppShell>
  );
}
