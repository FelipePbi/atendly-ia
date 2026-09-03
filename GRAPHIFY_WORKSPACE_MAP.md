# Atendly Workspace Map

## Projetos

| Projeto | Responsabilidade de alto nível |
| --- | --- |
| `apps/frontend` | Interface web do produto |
| `apps/bff` | Backend público consumido pelo frontend |
| `apps/ai-orchestrator` | Conversas, handoff e execução da IA |
| `apps/scheduling-service` | Agenda, serviços, clientes, disponibilidade e agendamentos |
| `apps/evolution-go` | Transporte WhatsApp |
| `apps/health-worker` | Monitoramento de saúde |
| `apps/frontend-open-design` | Referência/prototipação visual |

## Fontes para descoberta

- Produto e UX/UI: `docs/product-vault/00-HOME.md`.
- Orientação global para agentes: `AGENTS.md`.
- Setup e limites técnicos: README e `AGENTS.md` de cada app.
- Contrato HTTP atualmente registrado pelo BFF: `apps/bff/PUBLIC_API_V1.md`.

## Graphify

Graphify descreve relações encontradas no código e nos documentos analisados. Ele não substitui o product vault nem transforma implementação legada em regra de produto.
