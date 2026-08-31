import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductConversationsScreen conversationId={id} />;
}
