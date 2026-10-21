"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type AiMessageDelivery,
  type AiTone,
  BffHttpError,
  RETURN_WINBACK_DAY_OPTIONS,
  type ReturnCandidate,
  type ReturnCandidateList,
  type ReturnKind,
  type ReturnPlan,
  type ReturnSettings,
} from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import {
  messageBubbles,
  resolveMessageDelivery,
} from "@/shared/messages/messageParts";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { ChatPhone, MessageBubbles } from "@/shared/ui/ChatPhone";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import {
  candidateDetail,
  countLabel,
  exclusionCount,
  exclusionSummary,
  habitLabel,
  intervalSourceLabel,
  shortDate,
  windowLabel,
} from "./returnCopy";
import { composeReturnParts, type ReturnFacts } from "./returnMessage";
import { ReturnMessageEditor } from "./ReturnMessageEditor";

type Week = "this" | "next";
type Step = 1 | 2 | 3 | 4;

const STEPS: ReadonlyArray<{ step: Step; label: string; title: string }> = [
  { step: 1, label: "Tipo", title: "Quem você quer chamar?" },
  { step: 2, label: "Clientes", title: "Quem recebe" },
  { step: 3, label: "Mensagem", title: "A mensagem" },
  { step: 4, label: "Aprovar", title: "Revisar e aprovar" },
];

const KINDS: ReadonlyArray<{
  kind: ReturnKind;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  {
    kind: "RENEWAL",
    label: "Renovação",
    hint: "No prazo de refazer o serviço",
    icon: "refresh",
  },
  {
    kind: "WINBACK",
    label: "Resgate",
    hint: "Não vem há um tempo",
    icon: "chat",
  },
];

/**
 * Quantas clientes cabem numa página da lista sem a tela rolar: a altura
 * que sobra depois da barra, das etapas, do cabeçalho da lista, do
 * paginador e do rodapé, dividida pela altura de uma linha; duas colunas a
 * partir de 1100 px. Entre 3 e 8 linhas, para a página nunca ficar vazia
 * nem comprida demais.
 */
export function candidatesPerPage(width: number, height: number): number {
  const columns = width >= 1100 ? 2 : 1;
  const row = width >= 600 ? 84 : 100;
  const reserved = width >= 600 ? 360 : 330;
  const rows = Math.min(8, Math.max(3, Math.floor((height - reserved) / row)));
  return rows * columns;
}

function subscribeViewport(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function useViewport(): string {
  return useSyncExternalStore(
    subscribeViewport,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "390x844",
  );
}

/** Altura do paginador mais o espaço acima dele. */
const PAGER_SPACE = 50;

/**
 * Depois de a lista aparecer, a conta de `candidatesPerPage` é trocada pela
 * medida de verdade: o espaço entre o topo da lista e o rodapé fixo,
 * descontado o que fica abaixo dela (paginador, quem ficou de fora), dividido
 * pela linha mais alta. Sem layout (jsdom, servidor), vale a estimativa.
 */
function measuredPageSize(
  listElement: HTMLElement,
  footer: HTMLElement,
  total: number,
  hasPager: boolean,
): number | null {
  const items = [...listElement.children] as HTMLElement[];
  const row = Math.max(
    0,
    ...items.map((item) => item.getBoundingClientRect().height),
  );
  if (row === 0) return null;
  const style = getComputedStyle(listElement);
  const gap = Number.parseFloat(style.rowGap) || 0;
  const columns =
    style.display === "grid"
      ? style.gridTemplateColumns.split(" ").filter(Boolean).length
      : 1;
  const section = listElement.parentElement;
  const body = section?.parentElement;
  const listBox = listElement.getBoundingClientRect();
  const footerBox = footer.getBoundingClientRect();
  const footerTop = Math.min(
    footerBox.top,
    window.innerHeight - footerBox.height,
  );
  const below =
    (section ? section.getBoundingClientRect().bottom - listBox.bottom : 0) +
    (body ? Number.parseFloat(getComputedStyle(body).paddingBottom) || 0 : 0);
  const fits = (space: number) =>
    Math.max(2, Math.floor((space + gap) / (row + gap))) * Math.max(1, columns);
  const available = footerTop - listBox.top - below;
  const size = fits(available);
  // Sem paginador na tela, ele só aparece se nem todas couberem: aí ele
  // ocupa o lugar de uma linha.
  return hasPager || size >= total ? size : fits(available - PAGER_SPACE);
}

/**
 * Chamar clientes, dentro do Retorno (D-206, D-210), em quatro etapas
 * (D-212): o tipo (Renovação ou Resgate, com o que cada um faz e o
 * período), as clientes (a lista vem toda marcada, paginada para a tela não
 * rolar), a mensagem que vai sair e a revisão com o ritmo antes de aprovar.
 * A aprovação sai aos poucos, no ritmo da configuração; quem não cabe até a
 * própria data é avisado antes, com a escolha de aumentar o limite do dia
 * ou deixar de fora. Aprovada, a tela leva direto ao andamento dela.
 */
export function ReturnCallScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [tone, setTone] = useState<AiTone>("BALANCED");
  // Como a IA envia (D-208) e o nome do negócio, para a prévia e o celular.
  const [delivery, setDelivery] = useState<AiMessageDelivery>("PARTS");
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [phoneFor, setPhoneFor] = useState<ReturnCandidate | null>(null);
  const [kind, setKind] = useState<ReturnKind>("RENEWAL");
  const [week, setWeek] = useState<Week>("this");
  const [days, setDays] = useState<number | null>(null);
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  // Lista e erro guardados com o filtro a que pertencem: trocar de tipo ou
  // de período não mostra a lista anterior enquanto a nova não chega.
  const [loaded, setLoaded] = useState<{
    key: string;
    list: ReturnCandidateList | null;
    error: string | null;
  } | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ReturnPlan | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const movedStep = useRef(false);
  const viewport = useViewport();
  const [fit, setFit] = useState<{
    key: string;
    size: number;
    passes: number;
  } | null>(null);
  const closeEditor = useCallback(() => setEditing(false), []);

  useEffect(() => {
    const controller = new AbortController();
    // Estilo da IA só para a prévia: sem ele, vale o Equilibrado.
    getProductServices()
      .settings.get(controller.signal)
      .then((state) => {
        setTone(state.ai.tone ?? "BALANCED");
        setDelivery(resolveMessageDelivery(state.ai.messageDelivery));
        setBusinessName(state.business?.name?.trim() || null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customerReturn.settings(controller.signal)
      .then((value) => {
        setSettings(value);
        setSettingsError(null);
        setDays((current) => current ?? value.winbackDays);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSettingsError("Não foi possível carregar o retorno de clientes.");
      });
    return () => controller.abort();
  }, [reload]);

  const winbackDays = days ?? settings?.winbackDays ?? null;
  // O filtro de cada rotina: a semana na Renovação, os dias no Resgate.
  const filter =
    kind === "RENEWAL"
      ? week
      : winbackDays === null
        ? null
        : String(winbackDays);
  const listKey = `${kind}:${filter}:${reload}`;
  const list = loaded?.key === listKey ? loaded.list : null;
  const error =
    (loaded?.key === listKey ? loaded.error : null) ?? settingsError;
  // A lista é lida já na primeira etapa: ao continuar, ela costuma estar
  // pronta.
  useEffect(() => {
    if (filter === null) return;
    const controller = new AbortController();
    const key = `${kind}:${filter}:${reload}`;
    getProductServices()
      .customerReturn.candidates(
        kind === "RENEWAL"
          ? { kind, week: filter as Week }
          : { kind, days: Number(filter) },
        controller.signal,
      )
      .then((value) => {
        setLoaded({ key, list: value, error: null });
        setUnchecked(new Set());
        setPage(0);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key,
          list: null,
          error:
            caught instanceof BffHttpError && caught.status === 404
              ? "Configure sua agenda antes de chamar clientes de volta."
              : "Não foi possível carregar a lista de clientes.",
        });
      });
    return () => controller.abort();
  }, [kind, filter, reload]);

  useShellConfig({
    active: "retorno",
    attention: Boolean(error && !list),
    loading: !settings && !settingsError,
    module: "directory",
    pushed: true,
    title: "Chamar clientes",
  });

  // Cada etapa nova leva o foco ao título dela (leitor de tela e teclado).
  useEffect(() => {
    if (!movedStep.current) return;
    headingRef.current?.focus();
  }, [step]);

  function goTo(next: Step) {
    movedStep.current = true;
    setStep(next);
  }

  const candidates = useMemo(() => list?.candidates ?? [], [list]);
  const selected = candidates.filter(
    (candidate) => !unchecked.has(candidate.customerId),
  );
  const [viewportWidth, viewportHeight] = viewport.split("x").map(Number);
  // A largura da lista também entra na chave: ela muda sem a janela mudar
  // (a barra de rolagem que some, a largura da etapa que termina de
  // assentar), e linhas mais largas ficam mais baixas.
  const [listWidth, setListWidth] = useState(0);
  const hasRows = step === 2 && candidates.length > 0;
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!hasRows || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setListWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasRows, list]);
  const fitKey = `${listKey}:${viewport}:${listWidth}`;
  const pageSize =
    fit?.key === fitKey
      ? fit.size
      : candidatesPerPage(viewportWidth, viewportHeight);
  const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize));
  // Mede por lista e por tamanho de tela, no máximo duas vezes: a primeira
  // medida sai da estimativa, que pode passar da tela (e a barra de rolagem
  // estreita as linhas); a segunda confere com a página já do tamanho
  // certo. Mudar de página não mede de novo, para o número de clientes por
  // página não oscilar.
  useLayoutEffect(() => {
    if (step !== 2) return;
    const sameKey = fit?.key === fitKey;
    if (sameKey && fit.passes >= 2) return;
    if (!listRef.current || !footerRef.current) return;
    const size = measuredPageSize(
      listRef.current,
      footerRef.current,
      candidates.length,
      pageCount > 1,
    );
    if (size === null) return;
    const first = Math.min(page, pageCount - 1) * pageSize;
    setFit({ key: fitKey, size, passes: sameKey ? fit.passes + 1 : 1 });
    setPage(Math.floor(first / size));
  }, [candidates.length, fit, fitKey, page, pageCount, pageSize, step]);
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = candidates.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const showLoader = useDeferredLoading(!list && !error);
  const template =
    kind === "RENEWAL"
      ? (settings?.renewalMessage ?? null)
      : (settings?.winbackMessage ?? null);
  const incentive =
    kind === "WINBACK" ? (settings?.winbackIncentive ?? null) : null;
  const periodLabel =
    kind === "RENEWAL"
      ? list?.weekStart && list.weekEnd
        ? `${week === "this" ? "Esta semana" : "Próxima semana"} · ${shortDate(list.weekStart)} a ${shortDate(list.weekEnd)}`
        : week === "this"
          ? "Esta semana"
          : "Próxima semana"
      : `${list?.days ?? winbackDays} dias ou mais sem vir`;

  function toggle(customerId: string) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function toggleAll() {
    setUnchecked(
      selected.length === candidates.length
        ? new Set(candidates.map((candidate) => candidate.customerId))
        : new Set(),
    );
  }

  const request = useCallback(
    (customerIds: string[], dailyLimit?: number) => ({
      kind,
      ...(kind === "RENEWAL" ? { week } : { days: winbackDays ?? undefined }),
      customerIds,
      ...(dailyLimit ? { dailyLimit } : {}),
    }),
    [kind, week, winbackDays],
  );

  async function approve(
    customerIds: string[],
    options: { dailyLimit?: number; skipPlan?: boolean } = {},
  ) {
    if (customerIds.length === 0) return;
    setBusy(true);
    try {
      const services = getProductServices().customerReturn;
      if (!options.skipPlan) {
        const simulated = await services.plan(
          request(customerIds, options.dailyLimit),
        );
        if (simulated.notFitting.length > 0) {
          setPlan(simulated);
          return;
        }
      }
      const campaign = await services.approve(
        request(customerIds, options.dailyLimit),
      );
      setPlan(null);
      showToast(
        `Aprovado: ${countLabel(campaign.counts.total, "mensagem sai", "mensagens saem")} aos poucos.`,
      );
      router.push(
        `/retorno/aprovacoes/detalhes?id=${encodeURIComponent(campaign.id)}`,
      );
    } catch {
      showToast("Não foi possível aprovar. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  const closePlan = useCallback(() => {
    if (!busy) setPlan(null);
  }, [busy]);

  const preview = useMemo(
    () =>
      previewBubbles({
        candidate: selected[0] ?? candidates[0] ?? null,
        delivery,
        incentive,
        kind,
        template,
        today: list?.today ?? null,
        tone,
      }),
    [selected, candidates, delivery, incentive, kind, template, list, tone],
  );
  const phoneBubbles = useMemo(
    () =>
      phoneFor
        ? previewBubbles({
            candidate: phoneFor,
            delivery,
            incentive,
            kind,
            template,
            today: list?.today ?? null,
            tone,
          })
        : [],
    [phoneFor, delivery, incentive, kind, template, list, tone],
  );
  const closePhone = useCallback(() => setPhoneFor(null), []);
  const current = STEPS[step - 1];
  const canContinue =
    step === 1 ? true : step === 2 ? selected.length > 0 : true;

  return (
    <div className={clsx("return-page return-flow", `is-step-${step}`)}>
      <PushedBar
        backHref="/retorno"
        backLabel="Voltar para o retorno"
        title="Chamar clientes"
      />
      <div className="return-steps">
        <ol aria-label="Etapas" className="return-steps-list">
          {STEPS.map((item) => (
            <li
              aria-current={item.step === step ? "step" : undefined}
              className={clsx(
                "return-step",
                item.step === step && "is-current",
                item.step < step && "is-done",
              )}
              key={item.step}
            >
              <span aria-hidden="true" className="return-step-bar" />
              <span className="return-step-label">
                <span className="sr-only">Etapa {item.step} de 4: </span>
                {item.label}
              </span>
            </li>
          ))}
        </ol>
        {/* No celular os nomes não cabem embaixo das barras: só o da atual. */}
        <p aria-hidden="true" className="return-steps-caption">
          Etapa {step} de 4 · {current.label}
        </p>
      </div>

      <div className="return-flow-body">
        <div className="return-flow-head">
          <h2 className="return-flow-title" ref={headingRef} tabIndex={-1}>
            {current.title}
          </h2>
          {/* Vale para a lista inteira, não só para a página à vista. */}
          {step === 2 && list && candidates.length > 0 && (
            <button
              className="return-link-button"
              onClick={toggleAll}
              type="button"
            >
              {selected.length === candidates.length
                ? "Desmarcar todas"
                : "Marcar todas"}
            </button>
          )}
        </div>

        {step === 1 && (
          <KindStep
            days={winbackDays}
            kind={kind}
            onDays={setDays}
            onKind={setKind}
            onWeek={setWeek}
            week={week}
          />
        )}

        {step === 2 && (
          <>
            {!list && !error && showLoader && (
              <BrandLoader inline label="Carregando a lista" />
            )}
            {!list && error && (
              <StatePanel
                actionLabel="Tentar novamente"
                description={error}
                icon="alert"
                onAction={() => setReload((value) => value + 1)}
                title="Lista indisponível"
                tone="error"
              />
            )}
            {list && (
              <section aria-label="Clientes" className="return-list">
                <p className="return-list-summary">
                  <span className="return-list-period">{periodLabel}</span>
                  {candidates.length > 0 && (
                    <span className="return-list-count">
                      {" "}
                      · {selected.length} de {candidates.length} marcadas
                    </span>
                  )}
                </p>
                {candidates.length === 0 ? (
                  <p className="return-empty">
                    {kind === "RENEWAL"
                      ? week === "this"
                        ? "Ninguém vence nesta semana sem horário marcado."
                        : "Ninguém vence na próxima semana sem horário marcado."
                      : "Ninguém está há tanto tempo sem vir."}
                  </p>
                ) : (
                  <ul className="return-candidates" ref={listRef}>
                    {pageItems.map((candidate) => (
                      <CandidateRow
                        candidate={candidate}
                        checked={!unchecked.has(candidate.customerId)}
                        key={candidate.customerId}
                        onPreview={() => setPhoneFor(candidate)}
                        onToggle={() => toggle(candidate.customerId)}
                        today={list.today}
                      />
                    ))}
                  </ul>
                )}
                {pageCount > 1 && (
                  <Pager
                    count={pageCount}
                    onChange={setPage}
                    page={currentPage}
                  />
                )}
                {/* Uma linha que abre o porquê: o motivo não toma o lugar
                    de uma cliente na página. */}
                {exclusionSummary(list.excluded) && (
                  <details className="return-excluded">
                    <summary>
                      {countLabel(
                        exclusionCount(list.excluded),
                        "cliente ficou de fora",
                        "clientes ficaram de fora",
                      )}
                      <Icon name="chevron-down" />
                    </summary>
                    <p>{exclusionSummary(list.excluded)}</p>
                  </details>
                )}
              </section>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <section className="return-message" aria-label="Mensagem">
              <div className="return-message-head">
                <span className="return-message-title">
                  Assim chega para{" "}
                  {firstName(selected[0]?.name ?? candidates[0]?.name) ??
                    "a cliente"}
                </span>
                <button
                  className="return-link-button"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  Editar mensagem
                </button>
              </div>
              <MessageBubbles
                bubbleClassName="return-message-bubble"
                bubbles={preview}
                label={`${preview.length} mensagens, nesta ordem`}
              />
              <p className="return-message-note">
                {kind === "RENEWAL"
                  ? "Cada cliente recebe o próprio nome, serviço e dois horários livres da sua agenda no momento do envio, perto dos dias e horários de costume dela."
                  : "Cada cliente recebe o próprio nome. Quando ela responder, a IA oferece horários perto dos de costume dela."}
              </p>
            </section>
            {kind === "WINBACK" && (
              <div className="return-incentive">
                <span className="return-incentive-label">Incentivo</span>
                <button
                  className="return-link-button"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  {incentive ? "Editar" : "Adicionar"}
                </button>
                <span className="return-incentive-text">
                  {incentive
                    ? `“${incentive}”`
                    : "Sem incentivo: a mensagem é só de reaproximação."}
                </span>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <section aria-label="Resumo" className="return-review">
            <dl className="return-review-list">
              <div>
                <dt>Tipo</dt>
                <dd>{kind === "RENEWAL" ? "Renovação" : "Resgate"}</dd>
              </div>
              <div>
                <dt>Quem</dt>
                <dd>{periodLabel}</dd>
              </div>
              <div>
                <dt>Clientes</dt>
                <dd>{countLabel(selected.length, "cliente", "clientes")}</dd>
              </div>
              {kind === "WINBACK" && (
                <div>
                  <dt>Incentivo</dt>
                  <dd>{incentive ?? "Sem incentivo"}</dd>
                </div>
              )}
              {settings && (
                <div>
                  <dt>Ritmo</dt>
                  <dd>
                    Até {settings.dailyLimit} por dia,{" "}
                    {windowLabel(
                      settings.windowDays,
                      settings.windowStart,
                      settings.windowEnd,
                    )}
                    .{" "}
                    <Link
                      className="return-inline-link"
                      href="/retorno/configuracoes"
                    >
                      Ajustar
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            <p className="return-message-note">
              Nada sai de uma vez: as mensagens saem aos poucos, no ritmo acima,
              e a IA continua a conversa quando a cliente responder.
            </p>
          </section>
        )}
      </div>

      <div className="return-flow-footer" ref={footerRef}>
        <div className="return-flow-actions">
          {step > 1 && (
            <button
              className="btn btn-secondary return-flow-back"
              disabled={busy}
              onClick={() => goTo((step - 1) as Step)}
              type="button"
            >
              Voltar
            </button>
          )}
          {step < 4 ? (
            <button
              className="btn btn-primary return-flow-next"
              disabled={!canContinue || (step === 2 && !list)}
              onClick={() => goTo((step + 1) as Step)}
              type="button"
            >
              {step === 2 && list && candidates.length > 0 && !canContinue
                ? "Marque quem vai receber"
                : "Continuar"}
            </button>
          ) : (
            <button
              className="btn btn-primary return-flow-next"
              disabled={busy || selected.length === 0}
              onClick={() =>
                void approve(selected.map((candidate) => candidate.customerId))
              }
              type="button"
            >
              {busy
                ? "Aprovando..."
                : `Aprovar ${countLabel(selected.length, "cliente", "clientes")}`}
            </button>
          )}
        </div>
      </div>

      <Dialog
        eyebrow="Exemplo"
        onClose={closePhone}
        open={phoneFor !== null}
        title={`Como a IA chama ${firstName(phoneFor?.name) ?? "a cliente"}`}
      >
        <div className="return-phone">
          <ChatPhone
            bubbles={phoneBubbles}
            businessName={businessName ?? "Seu negócio"}
            time={settings?.windowStart ?? "10:00"}
          />
          <p className="return-message-note">
            {kind === "RENEWAL"
              ? "Os dois horários são um exemplo nos dias e horários de costume dela; no envio, saem livres da sua agenda."
              : "Quando ela responder, a IA oferece horários perto dos de costume dela."}{" "}
            {delivery === "PARTS"
              ? "Chega em várias mensagens curtas, como em Configurações › IA."
              : "Chega numa mensagem só, como em Configurações › IA."}
          </p>
        </div>
      </Dialog>

      {settings && editing && (
        <ReturnMessageEditor
          kind={kind}
          onClose={closeEditor}
          onSaved={(saved) => {
            setSettings(saved);
            setEditing(false);
          }}
          open={editing}
          delivery={delivery}
          settings={settings}
          tone={tone}
        />
      )}

      <Dialog
        onClose={closePlan}
        open={plan !== null}
        title="Nem todas cabem antes da data"
      >
        {plan && (
          <NotFittingChoice
            busy={busy}
            onCancel={() => setPlan(null)}
            onLeaveOut={() =>
              void approve(
                selected
                  .map((candidate) => candidate.customerId)
                  .filter((id) => !plan.notFitting.includes(id)),
                { skipPlan: true },
              )
            }
            onRaise={(limit) =>
              void approve(
                selected.map((candidate) => candidate.customerId),
                { dailyLimit: limit, skipPlan: true },
              )
            }
            plan={plan}
          />
        )}
      </Dialog>
    </div>
  );
}

/**
 * Primeira etapa: o tipo, o que ele faz e o período. A explicação muda com
 * a escolha, para a profissional saber o que cada um faz antes de ver a
 * lista.
 */
function KindStep({
  days,
  kind,
  onDays,
  onKind,
  onWeek,
  week,
}: {
  days: number | null;
  kind: ReturnKind;
  onDays: (value: number) => void;
  onKind: (value: ReturnKind) => void;
  onWeek: (value: Week) => void;
  week: Week;
}) {
  const name = useId();
  const explanationId = useId();
  return (
    <>
      <fieldset className="return-kinds">
        <legend className="sr-only">Tipo</legend>
        {KINDS.map((option) => (
          <label
            className={clsx(
              "return-kind",
              kind === option.kind && "is-checked",
            )}
            key={option.kind}
          >
            <input
              aria-describedby={
                kind === option.kind ? explanationId : undefined
              }
              checked={kind === option.kind}
              className="return-kind-input"
              name={name}
              onChange={() => onKind(option.kind)}
              type="radio"
              value={option.kind}
            />
            <span aria-hidden="true" className="return-kind-icon">
              <Icon name={option.icon} />
            </span>
            <span className="return-kind-copy">
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div aria-live="polite" className="return-explain" id={explanationId}>
        {kind === "RENEWAL" ? (
          <dl className="return-explain-list">
            <div>
              <dt>Para que serve</dt>
              <dd>
                Lembrar quem está na hora de refazer um serviço, como a
                manutenção dos cílios, antes que passe do ponto.
              </dd>
            </div>
            <div>
              <dt>Quem entra</dt>
              <dd>
                Quem vence na semana escolhida, pelo prazo do serviço ou pela
                média da própria cliente, e não tem horário marcado.
              </dd>
            </div>
            <div>
              <dt>A mensagem</dt>
              <dd>
                Leva o nome dela, o serviço e dois horários livres perto dos
                dias e horários de costume.
              </dd>
            </div>
          </dl>
        ) : (
          <dl className="return-explain-list">
            <div>
              <dt>Para que serve</dt>
              <dd>
                Reaproximar quem sumiu, com uma mensagem leve, de saudade, sem
                pressão.
              </dd>
            </div>
            <div>
              <dt>Quem entra</dt>
              <dd>
                Quem não vem há {days ?? "N"} dias ou mais e não tem horário
                marcado.
              </dd>
            </div>
            <div>
              <dt>A mensagem</dt>
              <dd>
                Só de reaproximação, ou com o incentivo que você definir. Quando
                ela responder, a IA oferece horários.
              </dd>
            </div>
          </dl>
        )}
      </div>

      {kind === "RENEWAL" ? (
        <div aria-label="Semana" className="return-period" role="group">
          <span aria-hidden="true" className="return-period-label">
            Semana
          </span>
          <div className="return-chips">
            {(
              [
                ["this", "Esta semana"],
                ["next", "Próxima semana"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={week === value}
                className={clsx("return-chip", week === value && "is-active")}
                key={value}
                onClick={() => onWeek(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div aria-label="Sem vir há" className="return-period" role="group">
          <span aria-hidden="true" className="return-period-label">
            Sem vir há
          </span>
          <div className="return-chips">
            {RETURN_WINBACK_DAY_OPTIONS.map((value) => (
              <button
                aria-pressed={days === value}
                className={clsx("return-chip", days === value && "is-active")}
                key={value}
                onClick={() => onDays(value)}
                type="button"
              >
                {value} dias
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Pager({
  count,
  onChange,
  page,
}: {
  count: number;
  onChange: (page: number) => void;
  page: number;
}) {
  return (
    <nav aria-label="Páginas da lista" className="return-pager">
      <button
        aria-label="Página anterior"
        className="return-pager-button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        type="button"
      >
        <Icon name="chevron-left" />
      </button>
      <span aria-live="polite" className="return-pager-status">
        Página {page + 1} de {count}
      </span>
      <button
        aria-label="Próxima página"
        className="return-pager-button"
        disabled={page >= count - 1}
        onClick={() => onChange(page + 1)}
        type="button"
      >
        <Icon name="chevron-right" />
      </button>
    </nav>
  );
}

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/u)[0];
  return first || null;
}

function CandidateRow({
  candidate,
  checked,
  onPreview,
  onToggle,
  today,
}: {
  candidate: ReturnCandidate;
  checked: boolean;
  onPreview: () => void;
  onToggle: () => void;
  today: string;
}) {
  const habit = habitLabel(candidate.habit);
  const interval = intervalSourceLabel(candidate);
  const name = candidate.name?.trim() || "Cliente sem nome";
  return (
    <li className="return-candidate-item">
      <label className={clsx("return-candidate", checked && "is-checked")}>
        <input
          checked={checked}
          className="return-candidate-input"
          onChange={onToggle}
          type="checkbox"
        />
        <span aria-hidden="true" className="return-candidate-box">
          {checked && <Icon name="check" />}
        </span>
        <span className="return-candidate-copy">
          <strong>{name}</strong>
          <span className="return-candidate-detail">
            {candidateDetail(candidate, today)}
          </span>
          <span className="return-candidate-meta">
            Último atendimento em {shortDate(candidate.lastVisitDate)}
            {interval ? ` · ${interval}` : ""}
          </span>
          {habit && <span className="return-candidate-habit">{habit}</span>}
        </span>
      </label>
      {/* Fora do rótulo: abrir o exemplo não marca nem desmarca a cliente. */}
      <button
        aria-label={`Ver a mensagem para ${name}`}
        className="return-candidate-preview"
        onClick={onPreview}
        type="button"
      >
        <Icon name="eye" />
        <span className="return-candidate-preview-label">Ver mensagem</span>
      </button>
    </li>
  );
}

function NotFittingChoice({
  busy,
  onCancel,
  onLeaveOut,
  onRaise,
  plan,
}: {
  busy: boolean;
  onCancel: () => void;
  onLeaveOut: () => void;
  onRaise: (limit: number) => void;
  plan: ReturnPlan;
}) {
  const count = plan.notFitting.length;
  return (
    <div className="return-fit">
      <p>
        {countLabel(count, "cliente não cabe", "clientes não cabem")} no limite
        de {plan.dailyLimit} por dia antes da data{" "}
        {count === 1 ? "dela" : "delas"}. Ninguém recebe no próprio dia do
        vencimento.
      </p>
      <div className="return-fit-actions">
        {plan.minimumDailyLimit !== null && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onRaise(plan.minimumDailyLimit as number)}
            type="button"
          >
            Aumentar para {plan.minimumDailyLimit} por dia
          </button>
        )}
        {count < plan.total && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onLeaveOut}
            type="button"
          >
            Deixar {count === 1 ? "essa" : `essas ${count}`} de fora
          </button>
        )}
        <button
          className="btn btn-tertiary"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

/**
 * Prévia de uma cliente, um balão por mensagem (D-208), pelo mesmo código
 * de composição do envio. Os dois horários da Renovação saem da agenda só no
 * envio; aqui eles são um exemplo nos dias e na faixa de costume dela, e a
 * nota da tela diz isso.
 */
export function previewBubbles(input: {
  candidate: ReturnCandidate | null;
  delivery: AiMessageDelivery;
  incentive: string | null;
  kind: ReturnKind;
  template: string | null;
  today: string | null;
  tone: AiTone;
}): string[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const candidate = input.candidate;
  const facts: ReturnFacts = {
    kind: input.kind,
    followUp: false,
    customerName: candidate?.name ?? null,
    serviceName: candidate?.serviceName ?? null,
    today,
    expectedDate:
      input.kind === "RENEWAL" ? (candidate?.expectedDate ?? null) : null,
    intervalDays: candidate?.intervalDays ?? null,
    daysSinceLastVisit: candidate?.daysSinceLastVisit ?? null,
    offeredSlots:
      input.kind === "RENEWAL" && candidate
        ? exampleSlots(candidate, today)
        : [],
    incentive: input.incentive,
    messageTemplate: input.template,
  };
  return messageBubbles(
    composeReturnParts({ style: input.tone, facts, delivery: input.delivery }),
    input.delivery,
  );
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function exampleSlots(
  candidate: ReturnCandidate,
  today: string,
): Array<{ date: string; time: string }> {
  const start = addDays(today, 1);
  const anchor =
    candidate.expectedDate && candidate.expectedDate > start
      ? candidate.expectedDate
      : start;
  const habit = candidate.habit;
  const time = habit ? middleTime(habit.bandStart, habit.bandEnd) : "10:00";
  const slots: Array<{ date: string; time: string }> = [];
  for (let offset = 0; offset < 14 && slots.length < 2; offset += 1) {
    const date = addDays(anchor, offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (
      !habit ||
      habit.weekdays.length === 0 ||
      habit.weekdays.includes(weekday)
    ) {
      slots.push({ date, time });
    }
  }
  return slots;
}

function middleTime(start: string, end: string): string {
  const toMinutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const middle = Math.round((toMinutes(start) + toMinutes(end)) / 60) * 30;
  const hours = Math.floor(middle / 60);
  return `${String(hours).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}`;
}
