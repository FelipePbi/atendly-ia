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
| `packages/contracts` | Contratos TypeScript/Zod compartilhados entre apps |
| `packages/legal-contract` | Textos legais versionados |

## Fontes para descoberta

- Política de consulta seletiva (docs x Graphify x RTK): `docs/AI_WORKFLOW.md`.
- Produto e UX/UI: `docs/product-vault/00-HOME.md`.
- Orientação global para agentes: `AGENTS.md`.
- Setup e limites técnicos: README e `AGENTS.md` de cada app.
- Contrato HTTP atualmente registrado pelo BFF: `apps/bff/PUBLIC_API_V1.md`.

## Graphify

Graphify descreve relações encontradas no **código**. `docs/product-vault/` e o código vendorizado (`apps/evolution-go/whatsmeow-lib/`) estão fora do grafo por configuração — ver `.graphifyignore`. Ele não substitui o product vault nem transforma implementação legada em regra de produto.

Graphify responde *onde está e como está implementado*; a documentação responde *como deve funcionar e por quê*. Para dúvidas de produto ou regra já documentada, consulte a documentação antes de rodar análise profunda.
