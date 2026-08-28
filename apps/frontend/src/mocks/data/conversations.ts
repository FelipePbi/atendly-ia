import type { ConversationSummary } from "@/features/conversations/types";

export const mockConversations: ConversationSummary[] = [
  {
    id: "cliente-demo",
    name: "Cliente de demonstração",
    initials: "CD",
    preview: "Prefiro falar com uma pessoa.",
    time: "Agora",
    state: "waiting",
    unread: 2,
  },
  {
    id: "contato-sem-nome",
    name: "Contato sem nome",
    initials: "?",
    preview: "Quais horários estão disponíveis?",
    time: "12 min",
    state: "ai",
    unread: 0,
  },
  {
    id: "cliente-pausado",
    name: "Cliente de demonstração",
    initials: "CD",
    preview: "Tudo certo, obrigada.",
    time: "1 h",
    state: "paused",
    unread: 0,
  },
  {
    id: "cliente-resolvido",
    name: "Cliente de demonstração",
    initials: "CD",
    preview: "Conversa encerrada no exemplo.",
    time: "Ontem",
    state: "resolved",
    unread: 0,
  },
];
