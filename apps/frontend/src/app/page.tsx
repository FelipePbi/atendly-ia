import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export default async function Home() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  if (!session.onboarding.completed) {
    redirect("/onboarding");
  }

  redirect("/chat");
}
