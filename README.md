# Atendly

Atendly é uma plataforma de atendimento por IA para profissionais autônomos de serviços. A IA atende clientes pelo WhatsApp e executa agendamentos na Agenda Atendly, enquanto o profissional continua podendo usar o WhatsApp e assumir conversas manualmente.

## Documentação

A fonte soberana de produto e UX/UI é [`docs/product-vault/00-HOME.md`](docs/product-vault/00-HOME.md). O índice geral está em [`docs/README.md`](docs/README.md).

O código ainda contém contratos e fluxos anteriores à definição vigente. Eles descrevem o runtime atual, não uma segunda versão do produto. O trabalho necessário para alinhá-los está delimitado em [`docs/PLANO_REFATORACAO.md`](docs/PLANO_REFATORACAO.md).

## Aplicações

| Diretório | Responsabilidade |
| --- | --- |
| `apps/frontend` | Interface web |
| `apps/bff` | Backend público do frontend |
| `apps/ai-orchestrator` | Conversas e execução da IA |
| `apps/scheduling-service` | Agenda, clientes, serviços e importação |
| `apps/evolution-go` | Transporte WhatsApp |
| `apps/health-worker` | Monitoramento de saúde |
| `apps/frontend-open-design` | Protótipos e referência visual |

Para setup e limites técnicos, consulte o README e o `AGENTS.md` do app correspondente.

## Para agentes

Leia [`AGENTS.md`](AGENTS.md) antes de alterar o projeto. O roteamento entre product vault, Graphify e RTK está em [`CLAUDE.md`](CLAUDE.md); o fluxo detalhado, em [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md).
