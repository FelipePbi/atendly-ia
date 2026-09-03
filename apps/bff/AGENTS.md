# AGENTS.md — BFF

## Contexto de produto

O BFF deve expor ao frontend comportamentos compatíveis com `../../docs/product-vault/`.

Este arquivo não redefine arquitetura técnica; apenas fixa as premissas de produto que não podem ser contrariadas por contratos públicos ou mocks.

## Premissas obrigatórias

- Agenda Atendly é a única agenda operacional.
- Minha Agenda só participa de uma única importação.
- Não criar/continuar contrato público de “calendar source ativo”, sincronização, reimportação ou troca de provider por decisão de produto antiga.
- Um negócio utiliza um número de WhatsApp.
- IA pode estar ativa, pausada ou com instabilidade.
- Conversas precisam suportar Comercial / Não classificadas / Pessoal e estados de atendimento humano/IA.
- Cliente pode existir sem telefone em casos manuais específicos.
- Serviços suportam preço fixo, a partir de, sob consulta e sem preço informado.

## Contratos de produto

Não desenhar API/DTO novo neste arquivo. Ao criar ou alterar contrato real, derive os campos do comportamento vigente e documente a decisão técnica separadamente.

## Erros

O frontend nunca deve receber um resultado que force interpretação de falha como sucesso.

Operações de agenda precisam permitir UX segura para:

- confirmação apenas após conclusão real;
- remarcação sem liberar horário antigo antes da nova confirmação;
- cancelamento preservando histórico;
- estados de indisponibilidade/erro compreensíveis.

## Fonte

- `../../docs/product-vault/00-HOME.md`
- `../../docs/product-vault/01-Regras/`
- `../../docs/product-vault/02-Fluxos/`
