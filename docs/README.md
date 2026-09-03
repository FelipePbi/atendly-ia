# Documentação Atendly

## Fonte de verdade de produto

Toda decisão vigente de produto e UX/UI está em:

- [`product-vault/00-HOME.md`](product-vault/00-HOME.md)

O `product-vault` substitui documentos históricos de contexto de produto, especificação de telas e decisões antigas de integração.

## Como navegar

### Produto

- `product-vault/00-Produto/`
- `product-vault/01-Regras/`
- `product-vault/02-Fluxos/`

### UX/UI

- `product-vault/03-UX-UI/`

### Rastreabilidade

- `product-vault/04-Referencia/02-Decisoes-Substituidas.md`
- `product-vault/04-Referencia/99-Perguntas-e-Respostas.md`

## Documentos auxiliares deste repositório

- [`PLANO_REFATORACAO.md`](PLANO_REFATORACAO.md) — plano para alinhar produto/protótipo/código à especificação atual, sem decidir arquitetura nova.
- [`ROADMAP_INTEGRACAO_V1.md`](ROADMAP_INTEGRACAO_V1.md) — documento histórico; não deve mais governar produto.
- [`UI_UX_PROTOTYPE_GUIDELINES.md`](UI_UX_PROTOTYPE_GUIDELINES.md) — instruções atualizadas para prototipação.
- [`architecture/`](architecture/) — decisões técnicas existentes; devem ser reavaliadas separadamente quando contradisserem novas regras de produto.

## Regra de precedência

1. `docs/product-vault/`
2. `AGENTS.md` raiz
3. instruções locais do app
4. documentação técnica vigente
5. protótipos/READMEs históricos

Não use documentação antiga para reintroduzir sincronização com Minha Agenda, múltiplas fontes de calendário ou regras substituídas.
