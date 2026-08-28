import { notFound } from "next/navigation";
import { ConversationsScreen } from "@/features/conversations/ConversationsScreen";
import type { ConversationsScenario } from "@/features/conversations/types";

const states = {
  "ai-active": "ai",
  error: "error",
  human: "human",
  paused: "paused",
  resolved: "resolved",
  waiting: "waiting",
} as const satisfies Record<string, ConversationsScenario>;

export function generateStaticParams() {
  return Object.keys(states).map((state) => ({ state }));
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  if (!(state in states)) notFound();
  return (
    <ConversationsScreen scenario={states[state as keyof typeof states]} />
  );
}
