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

## Regra de produto que impacta a descoberta

- Agenda Atendly é a única agenda operacional.
- Minha Agenda deve ser procurada apenas em contexto de **importação/migração única** ou legado técnico a remover/reavaliar.
- Referências a `calendar source`, `sync`, `external calendar`, `Minha Agenda provider` ou `Agenda Atendly vs Minha Agenda` podem representar premissas antigas e devem ser verificadas contra `docs/product-vault/`.

## Onde procurar regras

- Produto/UX: `docs/product-vault/00-HOME.md`.
- Regras de agenda: `docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md`.
- IA/conversas: `docs/product-vault/01-Regras/03-IA-e-Conversas.md`.
- WhatsApp: `docs/product-vault/01-Regras/05-WhatsApp.md`.
- Importação: `docs/product-vault/01-Regras/06-Importacao-Minha-Agenda.md`.
- UX/UI: `docs/product-vault/03-UX-UI/`.

## Graphify

Graphify descreve o código atual. Ele não substitui a documentação de produto.

Quando o grafo revelar implementação conflitante com o product vault, trate-a como dívida/alinhamento necessário, não como evidência de que a regra antiga continua válida.
