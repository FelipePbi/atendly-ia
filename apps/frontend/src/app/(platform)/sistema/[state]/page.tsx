import { notFound } from "next/navigation";
import {
  SystemScreen,
  type SystemScenario,
} from "@/features/system/SystemScreen";
const states: Record<string, SystemScenario> = {
  offline: "offline",
  "agenda-indisponivel": "external-unavailable",
  erro: "error",
  "sessao-expirada": "session-expired",
};
export function generateStaticParams() {
  return Object.keys(states).map((state) => ({ state }));
}
export default async function SystemPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const scenario = states[state];
  if (!scenario) notFound();
  return <SystemScreen scenario={scenario} />;
}
