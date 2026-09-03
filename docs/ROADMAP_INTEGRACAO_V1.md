# Roadmap de Integração V1 — ARQUIVO HISTÓRICO

> **Status: substituído como fonte de produto.**

Este arquivo existia para conduzir uma refatoração baseada em duas possíveis fontes oficiais de agenda (`Agenda Atendly` e `Minha Agenda`). Essa premissa foi removida do produto.

## Regra atual

- Agenda Atendly é a única agenda oficial.
- Minha Agenda é somente origem de **uma única migração/importação**.
- Não existe sincronização contínua.
- Não existe `switch` de fonte de agenda.
- Não existe reimportação após a primeira importação concluída.

## O que fazer com os antigos goals

Os goals já executados continuam como histórico técnico do repositório, mas **não devem ser tratados como requisitos atuais de produto**.

Antes de continuar qualquer refatoração técnica, deve existir um novo roadmap técnico derivado do product vault e do estado atual do código. Este documento não deve ser atualizado para inventar esse roadmap.

## Fonte atual

Leia:

- `docs/product-vault/00-HOME.md`
- `docs/product-vault/00-Produto/02-Escopo-do-MVP.md`
- `docs/product-vault/01-Regras/02-Agenda-e-Agendamentos.md`
- `docs/product-vault/01-Regras/06-Importacao-Minha-Agenda.md`
- `docs/product-vault/02-Fluxos/01-Onboarding.md`

## Atenção para agentes

Não use este arquivo para justificar:

- `Minha Agenda CalendarProvider` como fonte operacional;
- telas de agenda externa ativa;
- sincronização/reconciliação entre calendários;
- migração Atendly → Minha Agenda;
- reimportação;
- UI de “trocar agenda”.

Esses conceitos foram substituídos por decisão explícita de produto.
