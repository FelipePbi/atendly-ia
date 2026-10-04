"use client";

import { useEffect, useMemo, useState } from "react";

import type { Conversation, ConversationQuery } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import type { StatusView } from "@/shared/runtime/systemStatus";

import { conversationState, needsAttention } from "./conversationState";
import { businessDaysAgo, requestError } from "./format";

/**
 * As três abas do vault mais a entrada própria de ignorados. Nenhuma delas é
 * filtro em memória: cada uma vira `category`/`ignored` na query do BFF, e a
 * busca viaja junto da aba corrente.
 */
export type InboxLens = "commercial" | "ignored" | "personal" | "unclassified";

export const inboxTabs = [
  { id: "commercial", label: "Comercial" },
  { id: "unclassified", label: "Não classificadas" },
  { id: "personal", label: "Pessoal" },
] as const satisfies ReadonlyArray<{ id: InboxLens; label: string }>;

export const lensLabels: Record<InboxLens, string> = {
  commercial: "Comercial",
  ignored: "Ignorados",
  personal: "Pessoal",
  unclassified: "Não classificadas",
};

/** Teto explícito: a tela mostra até isto e diz que é um recorte, nunca um total. */
export const inboxLimit = 50;

export const refreshIntervalMs = 8_000;
export const searchDebounceMs = 300;

export function lensQuery(lens: InboxLens, search: string): ConversationQuery {
  const trimmed = search.trim();
  return {
    // Contato ignorado continua aparecendo nas abas por categoria (regra do
    // vault); a entrada de ignorados é o recorte de quem está marcado.
    ...(lens === "ignored"
      ? { ignored: true }
      : {
          category:
            lens === "commercial"
              ? ("COMMERCIAL" as const)
              : lens === "personal"
                ? ("PERSONAL" as const)
                : ("UNCLASSIFIED" as const),
        }),
    limit: inboxLimit,
    ...(trimmed ? { search: trimmed } : {}),
  };
}

/**
 * Prioridade de quem espera: na aba Comercial, conversa em `Aguardando você`
 * sobe para o topo. Dentro de cada grupo a ordem do backend (mais recente
 * primeiro) é preservada.
 */
export function prioritizeWaiting(
  lens: InboxLens,
  conversations: Conversation[],
): Conversation[] {
  if (lens !== "commercial") return conversations;
  const waiting: Conversation[] = [];
  const rest: Conversation[] = [];
  for (const conversation of conversations) {
    if (conversationState(conversation) === "waiting-you")
      waiting.push(conversation);
    else rest.push(conversation);
  }
  return [...waiting, ...rest];
}

export type InboxGroup = {
  conversations: Conversation[];
  key: "all" | "earlier" | "today" | "waiting";
  /** Texto do título do grupo; some da tela quando o quadro não o desenha. */
  label: string;
  labelHidden: boolean;
};

/**
 * Os grupos da lista. Só a aba Comercial agrupa: `Aguardando você` no topo,
 * `Hoje` e as anteriores, com o dia no fuso do negócio. As outras abas são uma
 * lista só, sem título. As anteriores só ganham título à vista quando nada de
 * hoje as antecede — depois de `Hoje` o quadro as continua sem título.
 */
export function groupInbox(
  lens: InboxLens,
  conversations: Conversation[],
  timezone: string,
): InboxGroup[] {
  if (lens !== "commercial") {
    return conversations.length > 0
      ? [{ conversations, key: "all", label: "", labelHidden: true }]
      : [];
  }
  const waiting: Conversation[] = [];
  const today: Conversation[] = [];
  const earlier: Conversation[] = [];
  for (const conversation of conversations) {
    if (conversationState(conversation) === "waiting-you")
      waiting.push(conversation);
    else if (businessDaysAgo(conversation.updatedAt, timezone) <= 0)
      today.push(conversation);
    else earlier.push(conversation);
  }
  const groups: InboxGroup[] = [];
  if (waiting.length > 0) {
    groups.push({
      conversations: waiting,
      key: "waiting",
      label: "Aguardando você",
      labelHidden: false,
    });
  }
  if (today.length > 0) {
    groups.push({
      conversations: today,
      key: "today",
      label: "Hoje",
      labelHidden: false,
    });
  }
  if (earlier.length > 0) {
    groups.push({
      conversations: earlier,
      key: "earlier",
      label: "Anteriores",
      labelHidden: today.length > 0 || waiting.length === 0,
    });
  }
  return groups;
}

/**
 * Contador de atenção da aba Comercial. Na aba Comercial sem busca ele sai da
 * própria lista (`own`); nas outras abas e com a busca ativa vem de uma leitura
 * de `category=COMMERCIAL` com o mesmo teto e o mesmo intervalo de atualização.
 * `null` enquanto essa leitura não respondeu, ou quando falhou: sem número, em
 * vez de um zero que ninguém calculou.
 */
export function useCommercialAttention(
  own: Conversation[] | null,
  ownReady: boolean,
): number | null {
  const [count, setCount] = useState<number | null>(null);
  const [remembered, setRemembered] = useState<number | null>(null);
  const enabled = own === null;
  const ownCount =
    own !== null && ownReady
      ? own.filter((item) => needsAttention(conversationState(item))).length
      : null;
  if (ownCount !== null && ownCount !== remembered) setRemembered(ownCount);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const items = await getProductServices().conversations.list(
          lensQuery("commercial", ""),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setCount(
          items.filter((item) => needsAttention(conversationState(item)))
            .length,
        );
      } catch {
        /* sem leitura, sem contador */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), refreshIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled]);

  return (enabled ? count : ownCount) ?? remembered;
}

export type InboxQueryResult = {
  attention: boolean;
  conversations: Conversation[];
  error: string | null;
  /** Primeira carga desta aba: a lista ainda não existe. */
  loading: boolean;
  reload: () => void;
  /** Há uma busca em voo — distinto de "sem resultado" e de aba vazia. */
  searching: boolean;
};

/**
 * Carrega a aba corrente pelo backend e mantém a lista viva por polling.
 *
 * O resultado guarda a chave da consulta que o produziu (`aba|busca|tentativa`).
 * Carregando é, então, "ainda não há resultado para a chave corrente" — não um
 * `setLoading(true)` dentro do efeito, que dispararia render em cascata. A
 * atualização de fundo nunca devolve a tela ao estado de carregamento nem apaga
 * a lista que a profissional está lendo.
 */
export function useInboxConversations(
  lens: InboxLens,
  search: string,
): InboxQueryResult {
  const [result, setResult] = useState<{
    items: Conversation[];
    key: string;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebounced(search, searchDebounceMs);
  const key = `${lens}|${debounced.trim()}|${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const query = lensQuery(lens, debounced);

    const load = async (background: boolean) => {
      try {
        const items = await getProductServices().conversations.list(
          query,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ items, key });
        setFailure(null);
      } catch (caught: unknown) {
        if (controller.signal.aborted || background) return;
        setFailure({
          key,
          message: requestError(
            caught,
            "Não foi possível carregar as conversas.",
          ),
        });
      }
    };

    void load(false);
    const timer = window.setInterval(() => void load(true), refreshIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [debounced, key, lens]);

  const error = failure?.key === key ? failure.message : null;
  const loading = !error && result?.key !== key;
  const ordered = useMemo(
    () => prioritizeWaiting(lens, result?.key === key ? result.items : []),
    [key, lens, result],
  );

  return {
    attention: ordered.some((item) => needsAttention(conversationState(item))),
    conversations: ordered,
    error,
    loading,
    reload: () => setAttempt((value) => value + 1),
    searching: loading && (debounced.trim() !== "" || search.trim() !== ""),
  };
}

export type NoWhatsappProbe = "empty" | "idle" | "loading" | "present";

/**
 * Regra do estado sem WhatsApp (Goal096 §a): só com o WhatsApp `off` pergunta
 * ao BFF se existe alguma conversa — sem `category`, `ignored` nem busca, com
 * `limit: 1`. Lista vazia é `empty`; conversa ou falha da consulta é `present`,
 * e a tela segue com as abas. A consulta é refeita quando `whatsappView` muda.
 */
export function useNoWhatsappProbe(whatsappView: StatusView): NoWhatsappProbe {
  const [seen, setSeen] = useState(whatsappView);
  const [outcome, setOutcome] = useState<"empty" | "present" | null>(null);
  if (seen !== whatsappView) {
    setSeen(whatsappView);
    setOutcome(null);
  }
  const enabled = whatsappView === "off";

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getProductServices()
      .conversations.list({ limit: 1 }, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setOutcome(items.length === 0 ? "empty" : "present");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setOutcome("present");
      });
    return () => controller.abort();
  }, [enabled]);

  if (!enabled) return "idle";
  return outcome ?? "loading";
}

/** Debounce da digitação: a busca é do backend, não do teclado. */
function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}
