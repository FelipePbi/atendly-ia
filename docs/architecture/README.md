# Architecture docs — aviso de alinhamento de produto

Os documentos numerados desta pasta registram decisões e inventários técnicos anteriores à refatoração atual de produto.

## Regra de precedência

Para **comportamento de produto**, `../product-vault/` prevalece sobre qualquer afirmação existente nesta pasta.

## Premissas antigas que não podem ser tratadas como requisitos atuais

- tenant escolhe Agenda Atendly ou Minha Agenda como fonte oficial;
- Minha Agenda é provider operacional de calendário;
- sincronização entre calendários;
- reimportação;
- migração da Agenda Atendly para Minha Agenda;
- UI de troca de fonte.

## Regra vigente

- Agenda Atendly é a única agenda oficial;
- Minha Agenda é somente fonte de uma única importação.

## Próximo passo técnico

Não reescreva silenciosamente os ADRs/arquitetura apenas com base nesta mudança de produto.

Quando a refatoração técnica for autorizada, reavalie explicitamente:

- quais abstrações antigas ainda são úteis;
- quais existem apenas por causa da premissa de duas fontes;
- quais rotas/modelos podem virar legado;
- qual ordem segura de remoção/migração.

Essa decisão deve gerar documentação técnica nova, separada do product vault.
