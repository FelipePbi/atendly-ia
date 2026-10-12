"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { Badge } from "@/shared/ui/Badge";
import { Brand } from "@/shared/ui/Brand";
import { PageHeader } from "@/shared/ui/PageHeader";

export type SystemScenario = "offline" | "error" | "session-expired";

export function SystemScreen({ scenario }: { scenario: SystemScenario }) {
  useShellConfig({
    active: "inicio",
    chrome: scenario !== "session-expired",
    module: "system",
    title: scenarioTitle(scenario),
  });

  if (scenario === "session-expired") return <SessionExpired />;

  const unexpected = scenario === "error";
  const title = scenarioTitle(scenario);
  const description =
    scenario === "offline"
      ? "Você pode consultar dados já carregados, mas ações que dependem de conexão estão bloqueadas."
      : "Não conseguimos concluir a última ação. Seus dados anteriores foram preservados.";
  const panelTitle =
    scenario === "offline"
      ? "Você está sem conexão"
      : "Algo não saiu como esperado";
  const panelDescription =
    scenario === "offline"
      ? "Consultas seguras serão tentadas novamente quando a internet voltar. Nenhuma ação remota será apresentada como concluída."
      : "A ação não foi confirmada. Tente novamente ou volte ao Início sem interpretar esta tela como sucesso.";
  const details = unexpected
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
          " A Avenly não consegue confirmar disponibilidade nem persistência agora.",
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
    <div className="system-page">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Badge
            tone={unexpected ? "danger" : "warning"}
            label={unexpected ? "Erro" : "Atenção operacional"}
          />
        }
      />
      <section className="system-banner" role="alert">
        <Icon name="alert" />
        <div>
          <strong>
            {scenario === "offline"
              ? "Avenly está offline"
              : "A última ação não foi concluída"}
          </strong>
          <p>
            {scenario === "offline"
              ? "Ações que dependem da agenda, do WhatsApp ou de serviços online estão temporariamente indisponíveis."
              : "Revise o resultado antes de tentar novamente."}
          </p>
        </div>
        <Link className="btn btn-secondary" href="/configuracoes">
          Ver configurações
        </Link>
      </section>
      <div className="system-layout">
        <SystemPanel
          description={panelDescription}
          details={details}
          scenario={scenario}
          title={panelTitle}
          unexpected={unexpected}
        />
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
              Quando a agenda ou o WhatsApp não puderem confirmar uma operação,
              assuma o atendimento e não prometa um horário ainda.
            </p>
          </article>
        </aside>
      </div>
    </div>
  );
}

function SystemPanel({
  description,
  details,
  scenario,
  title,
  unexpected,
}: {
  description: string;
  details: readonly (readonly [IconName, string, string])[];
  scenario: SystemScenario;
  title: string;
  unexpected: boolean;
}) {
  const [status, setStatus] = useState("Nenhuma alteração foi enviada.");
  return (
    <section className="system-state-panel">
      <span
        className={
          unexpected ? "system-state-mark is-danger" : "system-state-mark"
        }
      >
        <Icon name={unexpected ? "alert" : "x"} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
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
        <Link className="btn btn-secondary" href="/inicio">
          Voltar para Início
        </Link>
      </div>
      <p className="system-retry-status" role="status">
        {status}
      </p>
    </section>
  );
}

function SessionExpired() {
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
}

function scenarioTitle(scenario: SystemScenario): string {
  if (scenario === "session-expired") return "Sessão expirada";
  if (scenario === "offline") return "Conexão interrompida";
  return "Erro inesperado";
}
