import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { onboardingComplete } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

export default async function Home() {
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

  if (!user || !onboardingComplete(user.profile, user.settings)) {
    redirect("/onboarding");
  }

  redirect("/chat");
}
