"use client";

import clsx from "clsx";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Conversation } from "@/data";
import { ListDetailEmpty } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { runViewTransition } from "@/shared/motion/viewTransition";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";

import {
  ConversationListColumn,
  lensForConversation,
  useConversationList,
} from "./ConversationListColumn";
import {
  type ThreadSnapshot,
  useConversationsWorkspace,
  WorkspaceContext,
} from "./conversationsWorkspaceContext";
import { ConversationThread } from "./ConversationThread";
import { useNoWhatsappProbe } from "./inboxLenses";

function threadIdOf(pathname: string): string | null {
  const prefix = "/conversas/";
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length).split("/")[0];
  return id ? decodeURIComponent(id) : null;
}

/**
 * Casca de `/conversas`, montada pelo layout da rota (pedido de 2026-10-16,
 * o mesmo ajuste de Clientes): a lista mora aqui e não em cada tela, então
 * abrir ou trocar de conversa não remonta nem busca a lista de novo — aba,
 * busca, rolagem e o que já carregou ficam.
 *
 * O chat também é desenhado aqui, numa posição fixa da árvore. De 1024 px em
 * diante, trocar de conversa busca a nova antes de mostrar: a anterior fica
 * no painel (esmaecida só se demorar) e a troca é um crossfade da View
 * Transition `conversation-swap`, sem esqueleto e sem o painel piscar. Abaixo
 * disso o chat é tela empurrada e abre na hora, com o carregamento de sempre.
 */
export function ConversationsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = useWideLayout();
  const onInbox = pathname === "/conversas";
  const targetId = threadIdOf(pathname);

  // No celular, abrir direto uma conversa não busca a lista; ela começa a ser
  // buscada quando aparece e daí em diante fica guardada.
  const wanted = onInbox || wide;
  const [active, setActive] = useState(wanted);
  if (wanted && !active) setActive(true);
  const list = useConversationList("commercial", active);

  const { whatsappView } = useSystemStatus();
  const probe = useNoWhatsappProbe(whatsappView);
  const inboxTabs =
    whatsappView !== "loading" && probe !== "loading" && probe !== "empty";
  const split = wide && (targetId ? true : inboxTabs && !list.connectedEmpty);

  const cache = useRef(new Map<string, ThreadSnapshot>());
  const remember = useCallback(
    (snapshot: Omit<ThreadSnapshot, "fetchedAt">) => {
      cache.current.set(snapshot.conversation.id, {
        ...snapshot,
        fetchedAt: Date.now(),
      });
    },
    [],
  );

  // A conversa no painel e o que a casca já tinha lido dela.
  const [shown, setShown] = useState<{
    id: string;
    initial?: ThreadSnapshot;
  } | null>(null);
  const [lensHint, setLensHint] = useState<Conversation | null>(null);
  // De volta à inbox, o painel esquece a conversa.
  if (!targetId && shown) setShown(null);
  const shownId = targetId ? (shown?.id ?? null) : null;

  useEffect(() => {
    if (!targetId || targetId === shownId) return;
    const controller = new AbortController();
    const show = () => {
      if (controller.signal.aborted) return;
      const initial = cache.current.get(targetId);
      const next = { id: targetId, initial };
      // Ao lado da lista, toda troca é crossfade: do "Selecione uma conversa"
      // para a primeira e de uma conversa para a outra.
      if (wide) {
        void runViewTransition(() => setShown(next), {
          types: ["conversation-swap"],
        });
      } else {
        setShown(next);
      }
      if (initial) setLensHint(initial.conversation);
    };
    if (!wide || cache.current.has(targetId)) {
      void Promise.resolve().then(show);
      return () => controller.abort();
    }
    const services = getProductServices().conversations;
    void Promise.all([
      services.get(targetId, controller.signal),
      services.listMessages(targetId, controller.signal),
      // Eventos são complementares (Goal070 §4): sem eles, o chat abre igual.
      (async () => {
        try {
          return await services.listEvents(targetId, controller.signal);
        } catch {
          return [];
        }
      })(),
    ])
      .then(([conversation, messages, events]) => {
        if (controller.signal.aborted) return;
        remember({ conversation, events, messages });
        show();
      })
      // O chat mostra o próprio erro, com "Tentar novamente".
      .catch(show);
    return () => controller.abort();
  }, [remember, shownId, targetId, wide]);

  // Conversa aberta por link direto: a lista ao lado passa para a aba dela.
  // Aberta pela própria lista, ela já está ali e a aba fica como estava.
  if (lensHint && !list.loading) {
    if (
      !list.term &&
      !list.conversations.some((item) => item.id === lensHint.id)
    ) {
      list.setLens(lensForConversation(lensHint));
    }
    setLensHint(null);
  }

  const pending = Boolean(targetId && targetId !== shownId);
  const refreshing = split && pending && shownId !== null;
  const thread = shown ? (
    <ConversationThread
      conversationId={shown.id}
      initial={shown.initial}
      key={shown.id}
    />
  ) : targetId ? (
    <ThreadPending />
  ) : null;

  return (
    <WorkspaceContext.Provider
      value={{ hosted: split, list, probe, remember, whatsappView }}
    >
      <div
        className={
          split
            ? "list-detail conversation-list-detail"
            : "conversation-workspace"
        }
      >
        {split ? (
          <div
            aria-label="Conversas"
            className="list-detail-list conversation-list-column"
            role="complementary"
          >
            <ConversationListColumn
              list={list}
              selectedId={targetId ?? undefined}
            />
          </div>
        ) : null}
        <div
          aria-busy={refreshing || undefined}
          className={
            split
              ? clsx(
                  "list-detail-panel conversation-detail-panel",
                  refreshing && "is-refreshing",
                )
              : "conversation-workspace-panel"
          }
        >
          {targetId ? thread : children}
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

/**
 * Entre o clique na primeira conversa e ela chegar, o painel continua como a
 * inbox o deixou; a casca segue declarada, sem esqueleto.
 */
function ThreadPending() {
  const workspace = useConversationsWorkspace();
  useShellConfig({
    active: "conversas",
    loading: true,
    mainClassName: workspace?.hosted ? "conversation-detail-main" : undefined,
    module: "conversations",
    title: "Conversas",
  });
  return workspace?.hosted ? (
    <ListDetailEmpty>Selecione uma conversa</ListDetailEmpty>
  ) : null;
}
