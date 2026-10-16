"use client";

import Link from "next/link";

import { ListDetailEmpty } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { useSystemStatus } from "@/shared/runtime/systemStatus";

import {
  ConversationListColumn,
  useConversationList,
} from "./ConversationListColumn";
import { ConversationLoading } from "./ConversationLoading";
import { useConversationsWorkspace } from "./conversationsWorkspaceContext";
import { useNoWhatsappProbe } from "./inboxLenses";

/**
 * Porta de entrada de /conversas (Goal096 §a). Sem número e sem nenhuma
 * conversa a tela é o quadro C5; com o WhatsApp conectado, desconhecido, ou com
 * histórico, é a inbox com abas. Enquanto o status ou a consulta carregam, nem
 * C5 nem abas. Cada ramo declara `useShellConfig` uma vez, e só um monta.
 */
export function ConversationInbox() {
  // Dentro da casca de `/conversas`, status e sondagem são os dela.
  const workspace = useConversationsWorkspace();
  const status = useSystemStatus();
  const ownProbe = useNoWhatsappProbe(workspace ? null : status.whatsappView);
  const whatsappView = workspace?.whatsappView ?? status.whatsappView;
  const probe = workspace?.probe ?? ownProbe;

  if (whatsappView === "loading" || probe === "loading")
    return <InboxPending />;
  if (probe === "empty") return <NoWhatsappState />;
  return <InboxWithTabs />;
}

function InboxPending() {
  useShellConfig({
    active: "conversas",
    loading: true,
    module: "conversations",
    title: "Conversas",
  });

  return (
    <div className="conversation-list-page is-inbox">
      <header className="conversation-page-header">
        <h1>Conversas</h1>
      </header>
      <section
        aria-busy="true"
        aria-label="Conversas"
        className="conversation-list-surface conversation-list-state"
      >
        <ConversationLoading />
      </section>
    </div>
  );
}

function NoWhatsappState() {
  useShellConfig({
    active: "conversas",
    attention: false,
    module: "conversations",
    title: "Conversas",
    whatsappInBand: true,
  });

  return (
    <div className="conversation-list-page conversation-no-whatsapp">
      <header className="conversation-no-whatsapp-header">
        <h1>Conversas</h1>
      </header>
      <section className="conversation-no-whatsapp-body">
        <div aria-hidden="true" className="conversation-no-whatsapp-art">
          <span className="conversation-no-whatsapp-bubble is-left" />
          <span className="conversation-no-whatsapp-bubble is-right" />
          <span className="conversation-no-whatsapp-phone">
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
            </svg>
          </span>
        </div>
        <div className="conversation-no-whatsapp-copy">
          <h2>Conecte seu WhatsApp para ver suas conversas aqui.</h2>
          <p>
            Elas ficam organizadas em Comercial, Não classificadas e Pessoal, e
            a IA passa a atender seus clientes. Você continua usando o WhatsApp
            normalmente.
          </p>
        </div>
        <Link
          className="conversation-no-whatsapp-action"
          href="/configuracoes/whatsapp"
        >
          Conectar WhatsApp
        </Link>
      </section>
    </div>
  );
}

/**
 * A inbox: três abas do vault (Comercial / Não classificadas / Pessoal) mais a
 * entrada própria de ignorados, todas servidas pelo backend por `category` e
 * `ignored`, com a busca viajando por `search` junto da aba corrente. A busca
 * abre pelo botão de lupa do cabeçalho e a lente de ignorados só existe nela.
 *
 * De 1024 px em diante a lista ocupa uma coluna e o painel "Selecione uma
 * conversa" fica ao lado (D-103, D-126). O invólucro e a coluna da lista são os
 * mesmos nós nas duas faixas, e aba, termo e busca aberta moram acima da troca:
 * cruzar a largura só liga ou desliga o painel. O vazio conectado (C4) e o C5 não
 * têm painel. A coluna é a mesma que o chat mostra ao lado da conversa (Goal114).
 *
 * Declara `useShellConfig` uma vez; é o único ramo de `ConversationInbox` com abas.
 */
function InboxWithTabs() {
  const wide = useWideLayout();
  const workspace = useConversationsWorkspace();
  const ownList = useConversationList("commercial", !workspace);
  const list = workspace?.list ?? ownList;

  useShellConfig({
    active: "conversas",
    attention: list.attention,
    loading: list.loading,
    module: "conversations",
    title: "Conversas",
  });

  const split = wide && !list.connectedEmpty;

  // Na casca, a coluna é dela: aqui fica só o painel ao lado.
  if (workspace?.hosted) {
    return <ListDetailEmpty>Selecione uma conversa</ListDetailEmpty>;
  }

  return (
    <div
      className={
        split ? "list-detail conversation-list-detail" : "list-detail-flat"
      }
    >
      <div
        aria-label={split ? "Conversas" : undefined}
        className="list-detail-list conversation-list-column"
        role={split ? "complementary" : undefined}
      >
        <ConversationListColumn list={list} />
      </div>
      {split && (
        <div className="list-detail-panel conversation-detail-panel">
          <ListDetailEmpty>Selecione uma conversa</ListDetailEmpty>
        </div>
      )}
    </div>
  );
}
