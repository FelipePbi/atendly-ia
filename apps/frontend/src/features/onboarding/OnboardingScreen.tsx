"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { Icon } from "@/shared/icons/Icon";
import { Brand } from "@/shared/ui/Brand";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

import { ProductOnboardingScreen } from "./ProductOnboardingScreen";
import {
  onboardingOrder,
  type OnboardingScenario,
  onboardingScenarios,
} from "./scenarios";

function Summary({
  rows = [
    ["Serviço", "Serviço de demonstração"],
    ["Duração", "60 minutos"],
    ["Preço", "R$ 120,00"],
    ["Fonte oficial", "Agenda Atendly"],
  ],
}: {
  rows?: readonly (readonly [string, string])[];
}) {
  return (
    <div className="service-summary">
      {rows.map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ImportRow({
  badge,
  badgeClass,
  copy,
  icon,
  title,
}: {
  badge: string;
  badgeClass?: string;
  copy: string;
  icon: "alert" | "check";
  title: string;
}) {
  return (
    <div className="import-row">
      <Icon name={icon} />
      <div className="import-row-main">
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
      <span className={clsx("badge", badgeClass)}>{badge}</span>
    </div>
  );
}

function Body({
  kind,
  scenario,
  selection,
  setSelection,
}: {
  kind: string;
  scenario: OnboardingScenario;
  selection: number;
  setSelection: (value: number) => void;
}) {
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [copied, setCopied] = useState(false);
  if (kind === "business")
    return (
      <>
        <label className="field">
          <span className="label">Nome do negócio</span>
          <input
            className="input"
            placeholder="Ex.: Studio Aurora"
            autoComplete="organization"
            required
          />
        </label>
        <label className="field">
          <span className="label">Tipo de serviço</span>
          <span className="input-wrap">
            <select className="select" defaultValue="" required>
              <option value="">Selecione</option>
              <option>Beleza e estética</option>
              <option>Barbearia</option>
              <option>Bem-estar</option>
              <option>Treinamento</option>
              <option>Consultas</option>
              <option>Outro serviço com agendamento</option>
            </select>
            <Icon className="select-icon" name="chevron-down" />
          </span>
        </label>
      </>
    );
  if (["source", "method", "tone"].includes(kind)) {
    const options =
      kind === "source"
        ? [
            [
              "calendar",
              "Agenda Atendly",
              "A Atendly controla serviços, horários e agendamentos.",
            ],
            [
              "refresh",
              "Minha Agenda",
              "Minha Agenda continua controlando seus agendamentos.",
            ],
          ]
        : kind === "method"
          ? [
              [
                "plus",
                "Começar do zero",
                "Cadastre seu primeiro serviço e seus horários habituais.",
              ],
              [
                "refresh",
                "Importar uma vez",
                "Copie dados da Minha Agenda. Depois, Agenda Atendly vira a fonte oficial.",
              ],
            ]
          : [
              [
                "shield",
                "Profissional e objetiva",
                "Mensagens diretas, claras e cordiais.",
              ],
              [
                "chat",
                "Leve e próxima",
                "Conversa acolhedora e informal na medida certa.",
              ],
            ];
    return (
      <>
        <div
          className="choice-grid"
          role="radiogroup"
          aria-label="Escolha uma opção"
        >
          {options.map(([icon, title, copy], index) => (
            <button
              className={clsx(
                "choice-card source-card",
                selection === index && "is-selected",
              )}
              type="button"
              role="radio"
              aria-checked={selection === index}
              tabIndex={
                selection < 0
                  ? index === 0
                    ? 0
                    : -1
                  : selection === index
                    ? 0
                    : -1
              }
              onClick={() => setSelection(index)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : event.key === "Home"
                        ? -index
                        : event.key === "End"
                          ? options.length - 1 - index
                          : 0;
                if (!direction) return;
                event.preventDefault();
                const nextIndex =
                  (index + direction + options.length) % options.length;
                setSelection(nextIndex);
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="radio"]',
                  );
                buttons?.[nextIndex]?.focus();
              }}
              key={title}
            >
              <span className="choice-check">
                <Icon name="check" />
              </span>
              <Icon name={icon as "calendar"} />
              <h2>{title}</h2>
              <p>{copy}</p>
            </button>
          ))}
        </div>
        {kind === "method" && (
          <div className="onboarding-note is-important">
            <Icon name="alert" />
            <span>
              <strong>Importar não mantém sincronização.</strong> É uma cópia
              única para iniciar a Agenda Atendly.
            </span>
          </div>
        )}
      </>
    );
  }
  if (kind === "service-name")
    return (
      <label className="field">
        <span className="label">Nome do serviço</span>
        <input
          className="input"
          placeholder="Ex.: Corte feminino"
          required
          autoFocus
        />
      </label>
    );
  if (kind === "service-duration")
    return (
      <label className="field">
        <span className="label">Duração do serviço</span>
        <span className="input-wrap">
          <select className="select" defaultValue="" required>
            <option value="">Selecione</option>
            <option>30 minutos</option>
            <option>45 minutos</option>
            <option>1 hora</option>
            <option>1 hora e 30 minutos</option>
            <option>2 horas</option>
          </select>
          <Icon name="chevron-down" className="select-icon" />
        </span>
      </label>
    );
  if (kind === "service-price")
    return (
      <>
        <label className="field">
          <span className="label">Preço</span>
          <CurrencyInput className="input" placeholder="R$ 0,00" required />
        </label>
        <div className="switch-row">
          <div className="switch-copy">
            <strong>Valor sob consulta</strong>
            <span>O preço não será informado automaticamente.</span>
          </div>
          <label className="switch">
            <input type="checkbox" aria-label="Usar valor sob consulta" />
            <span className="switch-track" />
          </label>
        </div>
      </>
    );
  if (kind === "days")
    return (
      <>
        <div className="day-grid" role="group" aria-label="Dias de atendimento">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
            (day, index) => (
              <button
                className="day-button"
                type="button"
                aria-pressed={days.includes(index)}
                onClick={() =>
                  setDays((current) =>
                    current.includes(index)
                      ? current.filter((item) => item !== index)
                      : [...current, index],
                  )
                }
                key={day}
              >
                {day}
              </button>
            ),
          )}
        </div>
      </>
    );
  if (kind === "hours")
    return (
      <div className="time-grid">
        <label className="field">
          <span className="label">Começa às</span>
          <input className="input" type="time" defaultValue="09:00" required />
        </label>
        <label className="field">
          <span className="label">Termina às</span>
          <input className="input" type="time" defaultValue="18:00" required />
        </label>
      </div>
    );
  if (["confirm", "ready", "confirm-import"].includes(kind))
    return scenario === "agenda-atendly-pronta" ? (
      <Summary
        rows={[
          ["Fonte oficial", "Agenda Atendly"],
          ["Serviço inicial", "Cadastrado"],
          ["Horário habitual", "Configurado"],
        ]}
      />
    ) : scenario === "importar-confirmar" ? (
      <>
        <Summary
          rows={[
            ["Origem", "Minha Agenda"],
            ["Destino", "Agenda Atendly"],
            ["Tipo", "Importação única"],
            ["Sincronização futura", "Não incluída"],
          ]}
        />
        <div className="onboarding-note is-important">
          <Icon name="alert" />
          <span>
            Os dados originais não serão apagados. A Agenda Atendly só será
            considerada pronta após resultado bem-sucedido.
          </span>
        </div>
      </>
    ) : scenario === "agenda-atendly-confirmar" ? (
      <>
        <Summary
          rows={[
            ["Fonte oficial", "Agenda Atendly"],
            ["Controle de horários", "Pela Atendly"],
            ["Novos agendamentos", "Salvos na Atendly"],
          ]}
        />
        <div className="onboarding-note">
          <Icon name="info" />
          <span>
            Trocar a fonte depois exige um fluxo assistido. Não será uma mudança
            instantânea.
          </span>
        </div>
      </>
    ) : (
      <Summary />
    );
  if (scenario === "importar-conectar")
    return (
      <>
        <div className="import-definition">
          <div className="definition-block">
            <strong>Minha Agenda</strong>
            <p>Origem dos dados existentes.</p>
          </div>
          <span className="definition-arrow" aria-hidden="true">
            →
          </span>
          <div className="definition-block is-current">
            <strong>Agenda Atendly</strong>
            <p>Nova fonte oficial depois da importação concluída.</p>
          </div>
        </div>
        <div className="onboarding-note is-important">
          <Icon name="alert" />
          <span>
            <strong>Não é integração contínua.</strong> Alterações futuras não
            serão sincronizadas entre as agendas.
          </span>
        </div>
        <div className="onboarding-note">
          <Icon name="info" />
          <span>
            O método exato de conexão depende da capacidade disponível na
            integração e não é definido neste protótipo.
          </span>
        </div>
      </>
    );
  if (scenario === "minha-agenda-conectar")
    return (
      <>
        <div className="analysis-panel">
          <Icon
            name="shield"
            style={{
              width: 28,
              height: 28,
              margin: "0 auto 18px",
              color: "var(--accent)",
            }}
          />
          <h2>Conexão protegida</h2>
          <p>
            Este protótipo não presume login, código, senha ou outro método
            ainda não definido.
          </p>
        </div>
        <div className="onboarding-note">
          <Icon name="info" />
          <span>Nenhum dado será alterado durante a conexão.</span>
        </div>
      </>
    );
  if (scenario === "minha-agenda-autenticando")
    return (
      <div className="analysis-panel" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h2>Autenticando conexão</h2>
        <p>Nenhum agendamento está sendo alterado.</p>
      </div>
    );
  if (scenario === "importar-progresso")
    return (
      <>
        <div className="progress-stack">
          <div className="progress-status">
            <strong>Copiando dados com segurança…</strong>
            <span>Origem preservada</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progresso da importação"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={23}
          >
            <div className="progress-bar" style={{ width: "23%" }} />
          </div>
        </div>
        <div className="onboarding-note">
          <Icon name="shield" />
          <span>
            Nenhum dado importado será usado até a operação terminar com
            sucesso.
          </span>
        </div>
      </>
    );
  if (scenario === "importar-previa")
    return (
      <div className="import-list">
        <ImportRow
          icon="check"
          title="Serviços"
          copy="Dados encontrados e preparados para revisão"
          badge="Pronto"
          badgeClass="badge-success"
        />
        <ImportRow
          icon="check"
          title="Clientes"
          copy="Dados encontrados e preparados para revisão"
          badge="Pronto"
          badgeClass="badge-success"
        />
        <ImportRow
          icon="check"
          title="Agendamentos futuros"
          copy="Dados encontrados e preparados para revisão"
          badge="Pronto"
          badgeClass="badge-success"
        />
        <ImportRow
          icon="alert"
          title="Disponibilidade"
          copy="Requer revisão antes da cópia"
          badge="Revisar"
          badgeClass="badge-attention"
        />
      </div>
    );
  if (scenario === "importar-sucesso")
    return (
      <Summary
        rows={[
          ["Fonte oficial", "Agenda Atendly"],
          ["Minha Agenda", "Dados originais preservados"],
          ["Sincronização futura", "Não ativa"],
        ]}
      />
    );
  if (scenario === "importar-erro")
    return (
      <div className="onboarding-note is-important">
        <Icon name="shield" />
        <span>Os dados na Minha Agenda permanecem como estavam.</span>
      </div>
    );
  if (scenario === "importar-parcial")
    return (
      <div className="import-list result-list">
        <ImportRow
          icon="check"
          title="Dados compatíveis"
          copy="Preparados com sucesso"
          badge="Pronto"
          badgeClass="badge-success"
        />
        <ImportRow
          icon="alert"
          title="Registros incompletos"
          copy="Precisam ser corrigidos antes da ativação"
          badge="Revisar"
          badgeClass="badge-attention"
        />
      </div>
    );
  if (scenario === "minha-agenda-conectada")
    return (
      <Summary
        rows={[
          ["Estado", "Conectado"],
          ["Fonte oficial", "Minha Agenda"],
          ["Última consulta", "Concluída nesta sessão"],
        ]}
      />
    );
  if (scenario === "minha-agenda-verificar")
    return (
      <>
        <div className="data-check-grid">
          {[
            [
              "Serviços",
              "Nomes, duração e valores retornados.",
              "servicos",
              "Consultado",
            ],
            [
              "Clientes",
              "Identificação disponível na origem.",
              "clientes",
              "Consultado",
            ],
            [
              "Agendamentos",
              "Compromissos retornados pela integração.",
              "agendamentos",
              "Consultado",
            ],
            [
              "Disponibilidade",
              "Resultado conforme capacidade da integração.",
              "disponibilidade",
              "Dependente",
            ],
          ].map(([title, copy, slug, badge], index) => (
            <Link
              className="data-check-card"
              href={`/onboarding/minha-agenda-${slug}`}
              key={title}
            >
              <div className="data-check-card-top">
                <strong>{title}</strong>
                <span className={clsx("badge", index < 3 && "badge-success")}>
                  {badge}
                </span>
              </div>
              <p>{copy}</p>
            </Link>
          ))}
        </div>
        <div className="connection-meta">
          <span>Última consulta</span>
          <strong>Concluída nesta sessão</strong>
        </div>
      </>
    );
  if (["external-intro", "external-connect"].includes(kind)) {
    const steps =
      kind === "external-intro"
        ? [
            [
              "Minha Agenda permanece oficial",
              "Horários e confirmações dependem dela.",
            ],
            [
              "Atendly respeita os dados encontrados",
              "Nenhum serviço, preço ou horário será inventado.",
            ],
            [
              "Ações dependem da integração",
              "Controles não suportados não serão apresentados como disponíveis.",
            ],
          ]
        : [
            [
              "Autorize a conexão",
              "O método exato depende da integração disponível.",
            ],
            [
              "Confira os dados",
              "Serviços, clientes, agenda e disponibilidade.",
            ],
            ["Valide a fonte oficial", "Nenhum horário será inventado."],
          ];
    return (
      <ol className="integration-steps">
        {steps.map(([title, copy], index) => (
          <li className="integration-step" key={title}>
            <span>{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>{copy}</small>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  if (scenario === "importar-analisar")
    return (
      <div className="analysis-panel" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h3>Preparando uma prévia</h3>
        <p>Nenhum dado foi alterado. Aguarde a análise terminar.</p>
      </div>
    );
  if (["analysis", "progress"].includes(kind))
    return (
      <div className="analysis-panel" aria-busy="true">
        <span className="spinner" />
        <h2>
          {kind === "progress"
            ? "Copiando itens validados"
            : "Consultando dados disponíveis"}
        </h2>
        <p>Nenhum resultado parcial será tratado como confirmação.</p>
        <div className="progress-track" style={{ marginTop: 20 }}>
          <div
            className="progress-bar"
            style={{ width: kind === "progress" ? "68%" : "42%" }}
          />
        </div>
      </div>
    );
  if (
    [
      "minha-agenda-servicos",
      "minha-agenda-clientes",
      "minha-agenda-agendamentos",
    ].includes(scenario)
  ) {
    const rows =
      scenario === "minha-agenda-servicos"
        ? [
            [
              "Nome do serviço",
              "Usado para identificar o atendimento",
              "Retornado pela origem",
            ],
            ["Duração", "Usada para consultar horários", "Quando suportada"],
            ["Preço", "Nunca será inventado pela Atendly", "Quando informado"],
          ]
        : scenario === "minha-agenda-clientes"
          ? [
              ["Nome", "Identificação do cliente", "Quando retornado"],
              ["Contato", "Associação com o atendimento", "Quando retornado"],
              [
                "Histórico relacionado",
                "Contexto disponível na origem",
                "Dependente da integração",
              ],
            ]
          : [
              [
                "Data e horário",
                "Agenda oficial consultada",
                "Retornado pela origem",
              ],
              [
                "Cliente e serviço",
                "Contexto do compromisso",
                "Quando retornados",
              ],
              [
                "Operações permitidas",
                "Alterar, remarcar ou cancelar",
                "Dependente da integração",
              ],
            ];
    return (
      <>
        <div className="data-detail">
          {rows.map(([title, copy, value]) => (
            <div className="data-detail-row" key={title}>
              <div>
                <strong>{title}</strong>
                <span>{copy}</span>
              </div>
              <span>{value}</span>
            </div>
          ))}
        </div>
        {scenario === "minha-agenda-servicos" && (
          <div className="onboarding-note">
            <Icon name="info" />
            <span>
              Edição pela Atendly depende das operações realmente suportadas.
            </span>
          </div>
        )}
      </>
    );
  }
  if (scenario === "minha-agenda-disponibilidade")
    return (
      <>
        <Summary
          rows={[
            ["Fonte consultada", "Minha Agenda"],
            ["Controles locais", "Não disponíveis"],
            ["Resultado", "Dependente da integração"],
          ]}
        />
        <div className="onboarding-note is-important">
          <Icon name="alert" />
          <span>
            Se a disponibilidade não puder ser consultada com segurança, a
            integração não será considerada válida para agendamentos
            automáticos.
          </span>
        </div>
      </>
    );
  if (scenario === "minha-agenda-valida")
    return (
      <Summary
        rows={[
          ["Fonte oficial", "Minha Agenda"],
          ["Estado", "Integração válida"],
          ["Última consulta", "Concluída nesta sessão"],
          ["Controles locais", "Somente quando suportados"],
        ]}
      />
    );
  if (scenario === "minha-agenda-incompleta")
    return (
      <>
        <div className="import-list">
          <ImportRow
            icon="check"
            title="Dados consultados"
            copy="Itens disponíveis permanecem preservados"
            badge="Disponível"
            badgeClass="badge-success"
          />
          <ImportRow
            icon="alert"
            title="Informações necessárias"
            copy="Não retornadas pela integração"
            badge="Incompleto"
            badgeClass="badge-attention"
          />
        </div>
        <div className="onboarding-note is-important">
          <Icon name="alert" />
          <span>
            A Atendly não criará disponibilidade, serviço, preço ou confirmação
            ausente.
          </span>
        </div>
      </>
    );
  if (scenario === "minha-agenda-falha")
    return (
      <div className="onboarding-note is-important">
        <Icon name="shield" />
        <span>
          Atendimento automático por agenda externa não está disponível até uma
          conexão válida.
        </span>
      </div>
    );
  if (scenario === "minha-agenda-indisponivel")
    return (
      <div className="onboarding-note is-important">
        <Icon name="alert" />
        <span>
          Não confirme horários enquanto a fonte oficial não puder responder.
        </span>
      </div>
    );
  if (["preview", "verify", "data", "connected"].includes(kind))
    return (
      <div className="import-list">
        <div className="import-row">
          <Icon name="briefcase" />
          <div className="import-row-main">
            <strong>Serviços</strong>
            <span>1 item disponível no exemplo</span>
          </div>
          <span className="badge badge-success">Pronto</span>
        </div>
        <div className="import-row">
          <Icon name="users" />
          <div className="import-row-main">
            <strong>Clientes</strong>
            <span>Dados identificados pela conexão</span>
          </div>
          <span className="badge">Consultar</span>
        </div>
        <div className="import-row">
          <Icon name="calendar" />
          <div className="import-row-main">
            <strong>Agendamentos</strong>
            <span>Fonte oficial preservada</span>
          </div>
          <span className="badge badge-success">Pronto</span>
        </div>
      </div>
    );
  if (["success", "partial", "error"].includes(kind)) return null;
  if (kind === "whatsapp")
    return (
      <div className="choice-grid">
        <section className="card">
          <h2>Computador</h2>
          <div
            className="state-icon"
            style={{ width: 160, height: 160, marginTop: 18 }}
          >
            <Icon name="refresh" />
          </div>
          <p className="small muted">Escaneie o QR Code pelo WhatsApp.</p>
        </section>
        <section className="card">
          <h2>Celular</h2>
          <div
            className="linking-code mono"
            style={{ fontSize: 28, marginBlock: 24 }}
          >
            ABCD-EFGH
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText("ABCD-EFGH");
              setCopied(true);
            }}
          >
            {copied ? "Código copiado" : "Copiar código"}
          </button>
        </section>
      </div>
    );
  if (kind === "validation")
    return (
      <div className="import-list">
        <div className="import-row">
          <Icon name="check" />
          <div className="import-row-main">
            <strong>Fonte oficial</strong>
            <span>Agenda validada</span>
          </div>
          <span className="badge badge-success">Pronto</span>
        </div>
        <div className="import-row">
          <Icon name="check" />
          <div className="import-row-main">
            <strong>WhatsApp</strong>
            <span>Conectado</span>
          </div>
          <span className="badge badge-success">Pronto</span>
        </div>
        <div className="import-row">
          <Icon name="check" />
          <div className="import-row-main">
            <strong>Atendente virtual</strong>
            <span>Tom definido</span>
          </div>
          <span className="badge badge-success">Pronto</span>
        </div>
      </div>
    );
  return <Summary />;
}

const nextByKind: Record<string, string> = {
  business: "fonte-da-agenda",
  source: "agenda-atendly-confirmar",
  confirm: "agenda-atendly-metodo",
  method: "servico-nome",
  "service-name": "servico-duracao",
  "service-duration": "servico-preco",
  "service-price": "dias-de-atendimento",
  days: "horarios",
  hours: "agenda-atendly-pronta",
  ready: "tom-da-ia",
  tone: "whatsapp",
  whatsapp: "validacao",
  validation: "/inicio",
  "external-intro": "minha-agenda-conectar",
  "external-connect": "minha-agenda-autenticando",
  analysis: "importar-previa",
  preview: "importar-confirmar",
  "confirm-import": "importar-progresso",
  progress: "importar-sucesso",
  verify: "minha-agenda-valida",
  connected: "minha-agenda-verificar",
  data: "minha-agenda-verificar",
  success: "/inicio",
  partial: "minha-agenda-verificar",
  error: "fonte-da-agenda",
};

export function OnboardingScreen(props: {
  scenario: OnboardingScenario;
  preview?: boolean;
}) {
  return props.preview ? (
    <PrototypeOnboardingScreen scenario={props.scenario} />
  ) : (
    <ProductOnboardingScreen scenario={props.scenario} />
  );
}

function PrototypeOnboardingScreen({
  scenario,
}: {
  scenario: OnboardingScenario;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(-1);
  const [eyebrow, title, description, kind] = onboardingScenarios[scenario];
  const position = onboardingOrder.indexOf(scenario);
  const coarseStep = Math.min(
    5,
    Math.max(
      1,
      scenario.startsWith("dados")
        ? 1
        : scenario.includes("fonte") || scenario.includes("metodo")
          ? 2
          : scenario.includes("tom")
            ? 3
            : scenario === "whatsapp"
              ? 4
              : 5,
    ),
  );
  const progressMeta: Record<string, [string, string, number]> = {
    "dados-do-negocio": ["Etapa 1 de 8", "Seu negócio", 12.5],
    "fonte-da-agenda": ["Etapa 2 de 8", "Agenda", 25],
    "agenda-atendly-confirmar": ["Etapa 3 de 8", "Agenda Atendly", 37.5],
    "agenda-atendly-metodo": ["Etapa 4 de 8", "Configuração", 50],
    "servico-nome": ["Etapa 5 de 8", "Serviço", 62.5],
    "servico-duracao": ["Etapa 5 de 8", "Serviço · duração", 62.5],
    "servico-preco": ["Etapa 5 de 8", "Serviço · preço", 62.5],
    "dias-de-atendimento": ["Etapa 6 de 8", "Dias", 75],
    horarios: ["Etapa 7 de 8", "Horário", 87.5],
    "agenda-atendly-pronta": ["Etapa 8 de 8", "Agenda pronta", 100],
    "minha-agenda-introducao": ["Minha Agenda · 1 de 5", "Introdução", 20],
    "minha-agenda-conectar": ["Minha Agenda · 2 de 5", "Conexão", 40],
    "minha-agenda-autenticando": ["Minha Agenda · 2 de 5", "Autenticando", 40],
    "minha-agenda-conectada": ["Minha Agenda · 3 de 5", "Conectada", 60],
    "minha-agenda-verificar": ["Minha Agenda · 4 de 5", "Verificação", 80],
    "minha-agenda-valida": ["Minha Agenda · 5 de 5", "Válida", 100],
    "importar-conectar": ["Importação · 1 de 6", "Conectar", 16.7],
    "importar-analisar": ["Importação · 2 de 6", "Análise", 33.3],
    "importar-previa": ["Importação · 3 de 6", "Prévia", 50],
    "importar-confirmar": ["Importação · 4 de 6", "Confirmar", 66.7],
    "importar-progresso": ["Importação · 5 de 6", "Copiando", 83.3],
    "importar-sucesso": ["Importação · 6 de 6", "Concluída", 100],
    "importar-parcial": ["Importação · resultado", "Atenção", 100],
    "importar-erro": ["Importação · resultado", "Falha", 100],
    "minha-agenda-servicos": ["Verificação", "Serviços", 80],
    "minha-agenda-clientes": ["Verificação", "Clientes", 80],
    "minha-agenda-agendamentos": ["Verificação", "Agendamentos", 80],
    "minha-agenda-disponibilidade": ["Verificação", "Disponibilidade", 80],
    "minha-agenda-incompleta": ["Minha Agenda · verificação", "Atenção", 80],
    "minha-agenda-falha": ["Minha Agenda · conexão", "Falha", 40],
    "minha-agenda-indisponivel": [
      "Minha Agenda · consulta",
      "Indisponível",
      60,
    ],
  };
  const progress = progressMeta[scenario] ?? [
    `Etapa ${coarseStep} de 5`,
    `${coarseStep * 20}%`,
    coarseStep * 20,
  ];
  const previous = position > 0 ? onboardingOrder[position - 1] : undefined;
  const backOverrides: Partial<Record<OnboardingScenario, OnboardingScenario>> =
    {
      "fonte-da-agenda": "dados-do-negocio",
      "agenda-atendly-confirmar": "fonte-da-agenda",
      "agenda-atendly-metodo": "agenda-atendly-confirmar",
      "minha-agenda-introducao": "fonte-da-agenda",
    };
  const backStep = backOverrides[scenario] ?? previous;
  const configuredNext =
    nextByKind[kind] ??
    (position < onboardingOrder.length - 1
      ? onboardingOrder[position + 1]
      : "/inicio");
  const next =
    kind === "source" && selection === 1
      ? "minha-agenda-introducao"
      : kind === "method" && selection === 1
        ? "importar-conectar"
        : configuredNext;
  const target = next.startsWith("/") ? next : `/onboarding/${next}`;
  const cta =
    kind === "validation" || kind === "success"
      ? "Ir para o início"
      : kind === "error"
        ? "Escolher outra agenda"
        : kind === "progress" || kind === "analysis"
          ? "Ver resultado"
          : "Continuar";
  const requiresChoice = kind === "source" || kind === "method";
  const bannerCopy: Partial<Record<OnboardingScenario, string>> = {
    "minha-agenda-introducao":
      "Minha Agenda continuará controlando seus agendamentos",
    "minha-agenda-conectar":
      "Minha Agenda continuará controlando seus agendamentos",
    "minha-agenda-autenticando": "Minha Agenda continua sendo a fonte oficial",
    "minha-agenda-conectada": "Minha Agenda continua sendo a fonte oficial",
    "minha-agenda-verificar": "Minha Agenda continua sendo a fonte oficial",
    "minha-agenda-servicos":
      "Serviços permanecem controlados pela Minha Agenda",
    "minha-agenda-clientes": "Minha Agenda continua sendo a fonte oficial",
    "minha-agenda-agendamentos":
      "Agendamentos continuam controlados pela Minha Agenda",
    "minha-agenda-disponibilidade":
      "Disponibilidade continua definida pela Minha Agenda",
    "minha-agenda-valida":
      "Minha Agenda continuará controlando seus agendamentos",
    "minha-agenda-incompleta": "Minha Agenda continua sendo a fonte oficial",
    "minha-agenda-falha": "Minha Agenda permanece sem alterações",
    "minha-agenda-indisponivel": "Minha Agenda continua sendo a fonte oficial",
  };
  const resultState: Partial<
    Record<OnboardingScenario, "success" | "partial" | "error">
  > = {
    "importar-sucesso": "success",
    "importar-parcial": "partial",
    "importar-erro": "error",
    "agenda-atendly-pronta": "success",
    "minha-agenda-conectada": "success",
    "minha-agenda-valida": "success",
    "minha-agenda-incompleta": "partial",
    "minha-agenda-falha": "error",
    "minha-agenda-indisponivel": "error",
  };
  const actionConfig: Partial<
    Record<
      OnboardingScenario,
      {
        back: string;
        backLabel: string;
        primary?: string;
        primaryLabel?: string;
      }
    >
  > = {
    "agenda-atendly-confirmar": {
      back: "fonte-da-agenda",
      backLabel: "Voltar",
      primary: "agenda-atendly-metodo",
      primaryLabel: "Configurar Agenda Atendly",
    },
    "servico-nome": {
      back: "agenda-atendly-metodo",
      backLabel: "Voltar",
      primary: "servico-duracao",
      primaryLabel: "Definir duração",
    },
    "servico-duracao": {
      back: "servico-nome",
      backLabel: "Voltar",
      primary: "servico-preco",
      primaryLabel: "Definir preço",
    },
    "servico-preco": {
      back: "servico-duracao",
      backLabel: "Voltar",
      primary: "dias-de-atendimento",
      primaryLabel: "Definir dias",
    },
    horarios: {
      back: "dias-de-atendimento",
      backLabel: "Voltar",
      primary: "agenda-atendly-pronta",
      primaryLabel: "Salvar configuração",
    },
    "dias-de-atendimento": {
      back: "servico-preco",
      backLabel: "Voltar",
      primary: "horarios",
      primaryLabel: "Definir horário",
    },
    "agenda-atendly-pronta": {
      back: "horarios",
      backLabel: "Revisar",
      primary: "/inicio",
      primaryLabel: "Voltar à visão geral",
    },
    "importar-conectar": {
      back: "agenda-atendly-metodo",
      backLabel: "Voltar",
      primary: "importar-analisar",
      primaryLabel: "Iniciar conexão segura",
    },
    "importar-analisar": {
      back: "importar-conectar",
      backLabel: "Cancelar",
      primary: "importar-previa",
      primaryLabel: "Ver prévia",
    },
    "importar-previa": {
      back: "importar-conectar",
      backLabel: "Voltar",
      primary: "importar-confirmar",
      primaryLabel: "Revisar importação",
    },
    "importar-confirmar": {
      back: "importar-previa",
      backLabel: "Voltar",
      primary: "importar-progresso",
      primaryLabel: "Iniciar importação",
    },
    "importar-sucesso": {
      back: "importar-previa",
      backLabel: "Ver prévia",
      primary: "/inicio",
      primaryLabel: "Voltar à visão geral",
    },
    "importar-parcial": {
      back: "agenda-atendly-metodo",
      backLabel: "Escolher outro caminho",
      primary: "importar-previa",
      primaryLabel: "Revisar pendências",
    },
    "importar-erro": {
      back: "agenda-atendly-metodo",
      backLabel: "Começar do zero",
      primary: "importar-conectar",
      primaryLabel: "Tentar conectar novamente",
    },
    "importar-progresso": {
      back: "",
      backLabel: "",
      primary: "importar-sucesso",
      primaryLabel: "Ver resultado",
    },
    "minha-agenda-conectar": {
      back: "minha-agenda-introducao",
      backLabel: "Voltar",
      primary: "minha-agenda-autenticando",
      primaryLabel: "Iniciar conexão",
    },
    "minha-agenda-autenticando": {
      back: "",
      backLabel: "",
      primary: "minha-agenda-conectada",
      primaryLabel: "Revisar conexão",
    },
    "minha-agenda-conectada": {
      back: "minha-agenda-conectar",
      backLabel: "Voltar",
      primary: "minha-agenda-verificar",
      primaryLabel: "Verificar dados",
    },
    "minha-agenda-verificar": {
      back: "minha-agenda-conectada",
      backLabel: "Voltar",
      primary: "minha-agenda-valida",
      primaryLabel: "Validar integração",
    },
    "minha-agenda-servicos": {
      back: "minha-agenda-verificar",
      backLabel: "Voltar à verificação",
    },
    "minha-agenda-clientes": {
      back: "minha-agenda-verificar",
      backLabel: "Voltar à verificação",
    },
    "minha-agenda-agendamentos": {
      back: "minha-agenda-verificar",
      backLabel: "Voltar à verificação",
    },
    "minha-agenda-disponibilidade": {
      back: "minha-agenda-verificar",
      backLabel: "Voltar à verificação",
    },
    "minha-agenda-valida": {
      back: "minha-agenda-verificar",
      backLabel: "Revisar dados",
      primary: "/inicio",
      primaryLabel: "Voltar à visão geral",
    },
    "minha-agenda-incompleta": {
      back: "fonte-da-agenda",
      backLabel: "Escolher outra agenda",
      primary: "minha-agenda-verificar",
      primaryLabel: "Verificar novamente",
    },
    "minha-agenda-falha": {
      back: "fonte-da-agenda",
      backLabel: "Escolher outra agenda",
      primary: "minha-agenda-conectar",
      primaryLabel: "Tentar conectar novamente",
    },
    "minha-agenda-indisponivel": {
      back: "fonte-da-agenda",
      backLabel: "Escolher outra agenda",
      primary: "minha-agenda-conectada",
      primaryLabel: "Tentar consultar novamente",
    },
  };
  const actions = actionConfig[scenario];
  const content = useMemo<ReactNode>(
    () => (
      <Body
        kind={kind}
        scenario={scenario}
        selection={selection}
        setSelection={setSelection}
      />
    ),
    [kind, scenario, selection],
  );
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    router.push(target);
  }
  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Brand href="/onboarding/dados-do-negocio" />
        <div className="step-progress" aria-label={`Etapa ${coarseStep} de 5`}>
          <div className="step-progress-row">
            <span>{progress[0]}</span>
            <span>{progress[1]}</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-bar"
              style={{ width: `${progress[2]}%` }}
            />
          </div>
        </div>
        {scenario === "importar-progresso" ||
        scenario === "minha-agenda-autenticando" ? (
          <span />
        ) : (
          <Link className="onboarding-exit" href="/login">
            Sair
          </Link>
        )}
      </header>
      <form className="onboarding-main" onSubmit={handleSubmit}>
        <div className="onboarding-content">
          {bannerCopy[scenario] && (
            <div className="external-source-banner">
              <Icon name="calendar" />
              {bannerCopy[scenario]}
            </div>
          )}
          {resultState[scenario] && (
            <div
              className={clsx(
                "result-icon",
                resultState[scenario] === "partial" && "is-partial",
                resultState[scenario] === "error" && "is-error",
              )}
            >
              <Icon
                name={resultState[scenario] === "success" ? "check" : "alert"}
              />
            </div>
          )}
          <header className="onboarding-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          <div
            className={clsx(
              [
                "business",
                "service-name",
                "service-duration",
                "service-price",
                "days",
                "hours",
              ].includes(kind)
                ? "onboarding-form"
                : "onboarding-step-body",
            )}
          >
            {content}
            <div
              className={clsx(
                "onboarding-actions",
                !(actions?.back ?? backStep) && "is-single",
              )}
            >
              {(actions?.back ?? backStep) && (
                <Link
                  className="btn btn-secondary"
                  href={
                    (actions?.back ?? backStep)?.startsWith("/")
                      ? (actions?.back ?? backStep)!
                      : `/onboarding/${actions?.back ?? backStep}`
                  }
                >
                  {actions?.backLabel ?? "Voltar"}
                </Link>
              )}
              {actions ? (
                actions.primary &&
                (scenario === "importar-progresso" ||
                scenario === "minha-agenda-autenticando" ||
                scenario === "importar-analisar" ? (
                  <button className="btn btn-primary" type="button" disabled>
                    {actions.primaryLabel}
                  </button>
                ) : (
                  <Link
                    className="btn btn-primary"
                    href={
                      actions.primary.startsWith("/")
                        ? actions.primary
                        : `/onboarding/${actions.primary}`
                    }
                  >
                    {actions.primaryLabel}
                  </Link>
                ))
              ) : (
                <button
                  className={clsx(
                    "btn btn-primary",
                    requiresChoice && selection < 0 && "is-disabled",
                  )}
                  type="submit"
                  disabled={requiresChoice && selection < 0}
                  aria-disabled={requiresChoice && selection < 0}
                >
                  {scenario === "minha-agenda-introducao"
                    ? "Conectar Minha Agenda"
                    : kind === "source"
                      ? "Usar esta agenda"
                      : kind === "method"
                        ? "Seguir por este caminho"
                        : cta}
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
