"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/shared/layout/AppShell";
import { Brand } from "@/shared/ui/Brand";
import { Icon } from "@/shared/icons/Icon";

export type SystemScenario =
  "offline" | "external-unavailable" | "error" | "session-expired";

export function SystemScreen({ scenario }: { scenario: SystemScenario }) {
  const [status, setStatus] = useState("Nenhuma alteração foi enviada.");
  if (scenario === "session-expired")
    return (
      <main className="system-auth">
        <section className="system-auth-card" aria-labelledby="session-title">
          <Brand href="/login" />
          <span className="system-state-mark is-info">
            <Icon name="lock" />
          </span>
          <p className="eyebrow">Acesso protegido</p>
          <h1 id="session-title">Sua sessão expirou</h1>
          <p>
            Entre novamente para continuar. Você voltará à tela anterior quando
            isso puder ser feito com segurança.
          </p>
          <div className="system-actions">
            <Link className="btn btn-primary" href="/login">
              Entrar novamente
            </Link>
            <Link className="btn btn-secondary" href="/inicio">
              Voltar ao início
            </Link>
          </div>
          <p className="system-auth-meta">
            Nenhum dado sensível da sessão anterior é exibido nesta tela.
          </p>
        </section>
      </main>
    );
  const external = scenario === "external-unavailable";
  const unexpected = scenario === "error";
  const title =
    scenario === "offline"
      ? "Conexão interrompida"
      : external
        ? "A agenda oficial não respondeu"
        : "Erro inesperado";
  const description =
    scenario === "offline"
      ? "Você pode consultar dados já carregados, mas ações que dependem de conexão estão bloqueadas."
      : external
        ? "Até a agenda responder, horários antigos não serão mostrados como disponibilidade atual."
        : "Não conseguimos concluir a última ação. Seus dados anteriores foram preservados.";
  const panelTitle =
    scenario === "offline"
      ? "Você está sem conexão"
      : external
        ? "Minha Agenda está indisponível"
        : "Algo não saiu como esperado";
  const panelDescription =
    scenario === "offline"
      ? "Consultas seguras serão tentadas novamente quando a internet voltar. Nenhuma ação remota será apresentada como concluída."
      : external
        ? "A Atendly não consegue consultar a fonte oficial agora. Horários antigos não são apresentados como disponibilidade atual."
        : "A ação não foi confirmada. Tente novamente ou volte ao Início sem interpretar esta tela como sucesso.";
  const details = external
    ? ([
        [
          "clock",
          "Última sincronização válida:",
          " não informada pela integração.",
        ],
        [
          "x",
          "Novos horários não podem ser confirmados.",
          " Aguarde a consulta da fonte oficial.",
        ],
        [
          "user",
          "Atendimento humano recomendado.",
          " Explique ao cliente que a disponibilidade precisa ser verificada.",
        ],
      ] as const)
    : unexpected
      ? ([
          ["x", "Resultado da ação:", " não confirmado."],
          [
            "shield",
            "Dados anteriores:",
            " preservados até uma resposta válida.",
          ],
          [
            "info",
            "Identificador de suporte:",
            " não disponível neste estado demonstrativo.",
          ],
        ] as const)
      : ([
          [
            "x",
            "Novos agendamentos estão bloqueados.",
            " A Atendly não consegue confirmar disponibilidade nem persistência agora.",
          ],
          [
            "info",
            "Dados visíveis podem estar desatualizados.",
            " Consulte a última informação apenas como referência.",
          ],
          [
            "refresh",
            "Retentativas são seguras.",
            " A interface não duplica uma operação ao tentar consultar novamente.",
          ],
        ] as const);
  return (
    <AppShell
      active="inicio"
      module="system"
      source={external ? "external" : "atendly"}
    >
      <div className="system-page">
        <header className="system-page-header">
          <div>
            <p className="eyebrow">Estado da operação</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <span
            className={
              unexpected || external
                ? "badge badge-danger"
                : "badge badge-attention"
            }
          >
            {external
              ? "Minha Agenda indisponível"
              : unexpected
                ? "Erro"
                : "Atenção operacional"}
          </span>
        </header>
        <section className="system-banner" role="alert">
          <Icon name="alert" />
          <div>
            <strong>
              {scenario === "offline"
                ? "Atendly está offline"
                : external
                  ? "Não conseguimos consultar a Minha Agenda"
                  : "A última ação não foi concluída"}
            </strong>
            <p>
              {scenario === "offline"
                ? "Ações que dependem da agenda, do WhatsApp ou de serviços online estão temporariamente indisponíveis."
                : external
                  ? "O atendimento automático não deve confirmar agendamentos até a conexão voltar."
                  : "Revise o resultado antes de tentar novamente."}
            </p>
          </div>
          <Link className="btn btn-secondary" href="/configuracoes">
            Ver configurações
          </Link>
        </section>
        <div className="system-layout">
          <section className="system-state-panel">
            <span
              className={
                unexpected ? "system-state-mark is-danger" : "system-state-mark"
              }
            >
              <Icon name={unexpected ? "alert" : external ? "calendar" : "x"} />
            </span>
            <h2>{panelTitle}</h2>
            <p>{panelDescription}</p>
            <ul className="system-detail-list">
              {details.map(([icon, lead, copy]) => (
                <li key={lead}>
                  <Icon name={icon} />
                  <span>
                    <strong>{lead}</strong>
                    {copy}
                  </span>
                </li>
              ))}
            </ul>
            {scenario === "offline" && (
              <div className="system-disabled-action">
                <div>
                  <strong>Criar agendamento</strong>
                  <span>Indisponível até recuperar a conexão</span>
                </div>
                <button className="btn" type="button" disabled>
                  Sem conexão
                </button>
              </div>
            )}
            <div className="system-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  setStatus(
                    "Nova tentativa concluída no exemplo; serviço ainda indisponível.",
                  )
                }
              >
                Tentar novamente
              </button>
              <Link
                className="btn btn-secondary"
                href={external ? "/conversas" : "/inicio"}
              >
                {external ? "Assumir atendimento" : "Voltar para Início"}
              </Link>
            </div>
            <p className="system-retry-status" role="status">
              {status}
            </p>
          </section>
          <aside className="system-side" aria-label="Ações alternativas">
            <article className="system-side-card">
              <h2>O que permanece acessível</h2>
              <p>
                Use a navegação para consultar informações já carregadas. Ações
                que exigem confirmação remota continuam bloqueadas.
              </p>
              <Link className="btn btn-secondary" href="/conversas">
                Abrir conversas
              </Link>
            </article>
            <article className="system-side-card">
              <h2>Precisa atender agora?</h2>
              <p>
                Quando a agenda ou o WhatsApp não puderem confirmar uma
                operação, assuma o atendimento e não prometa um horário ainda.
              </p>
            </article>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
