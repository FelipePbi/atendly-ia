# Documentação Atendly

## Fontes por responsabilidade

| Responsabilidade | Fonte |
| --- | --- |
| Produto e regras | [`product-vault/`](product-vault/00-HOME.md) |
| Referência visual e comportamental | [`design-reference/claude-design/`](design-reference/claude-design/README.md) |
| Arquitetura técnica e ADRs | [`architecture/`](architecture/README.md) |
| Runtime atual | [`../apps/`](../apps/) + [`../packages/`](../packages/) |

O Product Vault continua soberano para regras de produto e UX. O Claude Design atual aprovado orienta aparência, layout, responsividade e microinterações, mas não é aplicação, runtime nem fonte de arquitetura.

## Como navegar

A documentação é consultada **sob demanda**: localize o tema, abra 1–3 arquivos e pare. Não carregue `docs/` nem o vault inteiros — ver [`AI_WORKFLOW.md`](AI_WORKFLOW.md).

### Produto

- `product-vault/00-Produto/`
- `product-vault/01-Regras/`
- `product-vault/02-Fluxos/`

### UX/UI

- `product-vault/03-UX-UI/`

### Rastreabilidade

- `product-vault/04-Referencia/02-Decisoes-Substituidas.md`
- `product-vault/04-Referencia/99-Perguntas-e-Respostas.md`

## Documentos atuais fora do vault

- [`AI_WORKFLOW.md`](AI_WORKFLOW.md) — política de consulta seletiva desta documentação e divisão entre docs, Graphify e RTK.
- [`architecture/`](architecture/README.md) — decisões arquiteturais e ADRs; hoje sem ADR vigente.
- [`design-reference/claude-design/`](design-reference/claude-design/README.md) — referência visual e comportamental aprovada do novo frontend.
- [`PLANO_REFATORACAO.md`](PLANO_REFATORACAO.md) — escopo da futura análise técnica de alinhamento, sem decisões arquiteturais antecipadas.
- [`../apps/bff/PUBLIC_API_V1.md`](../apps/bff/PUBLIC_API_V1.md) — inventário do contrato HTTP que o runtime registra hoje, incluindo dívida explicitamente marcada.

Setup e limites de cada aplicação ficam no README e no `AGENTS.md` locais.

## Regra de precedência

1. `docs/product-vault/`
2. `AGENTS.md` raiz
3. instruções locais do app
4. documentação técnica vigente
5. implementação existente

Quando o runtime contradisser o product vault, registre a divergência como dívida técnica. Não derive uma nova regra de produto do comportamento legado.
