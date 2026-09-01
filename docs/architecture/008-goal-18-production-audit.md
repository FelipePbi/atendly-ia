# GOAL 18 — Deploy e auditoria de produção

Status: `IN_PROGRESS`  
Data da auditoria: 2026-09-01

O deploy, a observabilidade, a auditoria arquitetural estática e os fluxos de
agenda foram validados em produção. O goal permanece em andamento porque os
cenários que exigem uma conta real da Minha Agenda e um WhatsApp vinculado não
podem ser declarados como aprovados sem essas integrações externas.

## Topologia implantada

| Serviço                         | URL pública                                          | `GET /health` |
| ------------------------------- | ---------------------------------------------------- | ------------- |
| `atendly-ia-frontend`           | `https://atendly-ia-frontend.onrender.com`           | 200           |
| `atendly-ia-bff`                | `https://atendly-ia-bff.onrender.com`                | 200           |
| `atendly-ia-ai-orchestrator`    | `https://atendimeto-ia.onrender.com`                 | 200           |
| `atendly-ia-scheduling-service` | `https://atendly-ia-scheduling-service.onrender.com` | 200           |
| `atendly-ia-evolution-go`       | `https://evolution-go-4pmo.onrender.com`             | 200           |
| `atendly-ia-health-worker`      | `https://atendly-ia-health-worker.onrender.com`      | 200           |

Os nomes finais dos seis serviços estão reconciliados no Render. O serviço
genérico foi renomeado em segurança para preservar banco e configuração. O
arquivo `render.yaml` é o contrato de infraestrutura, mas o workspace ainda não
possui um Blueprint conectado; a reconciliação desta execução foi feita pela API
do Render.

Como serviços gratuitos do Render não recebem tráfego pela private network, as
URLs entre serviços permanecem públicas e protegidas por tokens internos. O
frontend conhece somente a URL pública do BFF.

O Scheduling Service possui PostgreSQL próprio. A instância atual usa o plano
gratuito e expira em 2026-10-01; antes dessa data é necessário promover o banco
ou executar uma migração assistida para uma instância persistente.

O BFF usa a conexão pooled do Neon em runtime e `DIRECT_DATABASE_URL` para
Prisma Migrate. Essa separação remove o advisory lock retido pelo PgBouncer que
impedia deploys.

## Ownership de ambiente

- Frontend: URL do BFF.
- BFF: banco da plataforma, sessão/JWT, origens, URLs internas e tokens.
- AI Orchestrator: banco da IA, OpenAI/modelo, pgvector, URLs internas e token.
- Scheduling Service: banco próprio, chave de criptografia e token interno.
- Evolution Go: bancos de transporte, chave global e token interno.
- Health Worker: somente URLs dos cinco serviços monitorados.

Credenciais não foram registradas neste documento. Credenciais da Minha Agenda
continuam criptografadas e resolvidas por tenant no Scheduling Service.

## Observabilidade e redaction

- os seis serviços expõem health barato;
- `x-request-id` é propagado e devolvido nos health checks;
- logs da IA carregam `tenantId`, `conversationId`, `aiRunId` e `toolCallId`;
- Authorization, cookies, senhas, credenciais de provider, chaves e telefones
  desnecessários são redigidos ou mascarados;
- o health worker monitora frontend, BFF, AI, Scheduling e Evolution.

## Auditoria arquitetural

`npm run smoke:final-audit`, incluindo os seis endpoints de produção, passou
15/15:

- frontend chama somente o BFF;
- BFF não persiste Conversation ou Message;
- AI não acessa Minha Agenda diretamente;
- Scheduling não chama OpenAI;
- retrieval RAG exige tenant;
- appointment não depende de estado do LangGraph;
- LLM só solicita ações tipadas e não persiste appointment diretamente;
- credenciais da Minha Agenda não são globais;
- não existe unicidade global de telefone operacional;
- correlação e redaction exigidas estão configuradas.

## Smoke de produção

| Área          | Cenário                                                   | Resultado                                                                     |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Conta         | register                                                  | Aprovado — 201                                                                |
| Conta         | login                                                     | Aprovado — 200                                                                |
| Conta         | logout                                                    | Aprovado — 200 e sessão posterior 401                                         |
| Conta         | session                                                   | Aprovado — 200 autenticado                                                    |
| Onboarding    | Agenda Atendly                                            | Aprovado até o gate do WhatsApp; serviço, preço e disponibilidade persistidos |
| Onboarding    | Minha Agenda                                              | Pendente — requer credenciais externas válidas                                |
| WhatsApp      | connect                                                   | Aprovado — 201 e QR real em `WAITING_QR`                                      |
| WhatsApp      | reconnect                                                 | Aprovado — 200 e novo QR                                                      |
| WhatsApp      | disconnect                                                | Aprovado — 200; instância de smoke removida                                   |
| Agenda        | service                                                   | Aprovado — serviço do onboarding listado pela API pública                     |
| Agenda        | customer                                                  | Aprovado — 201                                                                |
| Agenda        | availability                                              | Aprovado — 200 com slots determinísticos                                      |
| Agenda        | create appointment                                        | Aprovado — 201 e status `SCHEDULED`                                           |
| Agenda        | reschedule                                                | Aprovado — 200 e novo slot persistido                                         |
| Agenda        | cancel                                                    | Aprovado — 200 e status `CANCELLED`                                           |
| Dashboard     | dados reais                                               | Aprovado — 200, fontes AI/Scheduling/WhatsApp e `degraded=false`              |
| Dashboard     | estados de falha                                          | Pendente — não foi induzida falha destrutiva em produção                      |
| AI            | pergunta simples, RAG, disponibilidade, booking e handoff | Pendente — exige WhatsApp realmente vinculado                                 |
| Conversations | inbound, resposta IA, takeover, resposta manual e release | Pendente — exige WhatsApp realmente vinculado                                 |

O appointment de smoke foi cancelado, preservando o histórico como exige a
regra de produto. O tenant de smoke permanece porque não existe uma rota pública
de exclusão administrativa e não foi feito acesso cruzado aos bancos para
apagá-lo.

## Validações locais

- frontend: lint, typecheck, format e build aprovados;
- BFF: lint, typecheck, format e build aprovados;
- AI Orchestrator: lint, typecheck, format e build aprovados;
- Scheduling Service: lint, typecheck, format e build aprovados;
- `render.yaml`: validação de YAML e Prettier aprovados;
- Evolution Go: pacotes compilaram; 64 testes passaram e 2 falharam somente na
  limpeza de `TempDir` no Windows porque o arquivo de log da instância permaneceu
  aberto após as asserções funcionais.

## Pendências para concluir o goal

1. Rotacionar a chave da API do Render usada nesta execução, pois o valor foi
   exibido em output da sessão.
2. Fornecer credenciais válidas de uma conta de teste da Minha Agenda e executar
   onboarding/conexão sem registrar os valores.
3. Vincular um WhatsApp de teste pelo QR e executar os cenários de AI e
   Conversations ponta a ponta, incluindo booking real e handoff.
4. Validar o dashboard em degradação controlada sem comprometer o ambiente.
5. Promover ou migrar o PostgreSQL gratuito do Scheduling antes de 2026-10-01.

Somente depois dessas evidências o GOAL 18 deve mudar para `COMPLETED`.
