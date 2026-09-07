# Status da migração

Baseline histórica do Goal0: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`. Atualização: 2026-09-06. Nenhuma implementação ou commit de migração foi feito pelo Goal0.

**Baseline aceita vigente:** ainda nenhuma. A política de [fechamento por commit](MASTER_PLAN.md#fechamento-por-commit-e-baseline-aceita) foi adotada em 2026-09-06 ([D-017](DECISIONS.md)) e vale para os Goals aceitos a partir dela; nenhum Goal foi fechado ainda por commit sob essa regra. Enquanto isso, a referência de trabalho continua sendo o HEAD indicado na coluna de commit de cada Goal.

Status: PLANNED, READY, IN_PROGRESS, IMPLEMENTED, REVIEW_REQUIRED, ACCEPTED, BLOCKED, SUPERSEDED. No objetivo original, `Goal0 = COMPLETE após auditoria aceita`; nesta tabela isso corresponde a **ACCEPTED** após aceite registrado. Entrega documental não presume esse aceite. READY significa prompt executável preparado, não execução iniciada. `ACCEPTED` sem commit de fechamento é encerramento administrativo incompleto e não libera a criação do próximo Goal.

A coluna **Commit de implementação** passa a registrar, para os Goals fechados sob a nova política, o **SHA do commit de fechamento aceito** — o mesmo que se torna a baseline aceita vigente. As linhas anteriores a 2026-09-06 preservam o que foi registrado na época.

| Goal | Status | Commit de implementação | Review | Observações |
| --- | --- | --- | --- | --- |
| 0 — Auditoria/arquitetura/roadmap | ACCEPTED | —; baseline 5fb5d51 | Revisão aceita pelo usuário em 2026-09-05 | Arquitetura e roadmap aprovados como baseline de trabalho; decisões continuam sujeitas a replanning conforme novas evidências |
| 001 — Autorizar alvo de instância | ACCEPTED | Working tree sobre 4ca1301; sem commit de implementação | Astra, 2026-09-05: [review e hashes](reviews/001-review.md) | 31 nós de autorização passaram; RED reproduzido no handler da baseline. Build/vet verdes. Duas falhas Go preexistentes de cleanup confirmadas em baseline isolada, independentes do diff; resolução no002. Aceite restrito ao diff identificado, sem deploy |
| 002 — Base de validação reproduzível | READY | — | A revisar após implementação | [Goal executável](goals/002-base-de-validacao-reproduzivel.md); fixtures Go/IA/BFF, build Scheduling e gates local/CI; sem centralização de DTOs nesta etapa |
| 003 — Tenant/sessão/vínculo WhatsApp | PLANNED | — | — | Ownership/scopes; fechar G-35 de /message/status e alinhar documentação de autorização antes do004 |
| 004 — Transporte/mensagens duráveis | PLANNED | — | — | Inbox/outbox/ACK/recovery |
| 005 — Contatos/sessão/humano | PLANNED | — | — | Ignore/categoria/controle |
| 006 — Clientes como pessoas | PLANNED | — | — | Identidade sem unicidade de telefone |
| 007 — Catálogo/acordo comercial | PLANNED | — | — | Quatro preços/atributos/pendência |
| 008 — Transações/holds/histórico | PLANNED | — | — | Atomicidade/replay |
| 009 — Disponibilidade/pessoal/recorrência | PLANNED | — | — | Domínio completo |
| 010 — Importação única/corte remoto | PLANNED | — | — | Gates de dados/capacidade externa; U-02 se houver legados |
| 011 — Assistente/tools vigentes | PLANNED | — | — | Regras/estilos/evals |
| 012 — Conhecimento/memória/sugestões | PLANNED | — | — | Proveniência/permissão |
| 013 — Áudio/mídia | PLANNED | — | — | Sem imagem/documento interpretados |
| 014 — Fundação visual/shell/auth | PLANNED | — | — | Mobile e status reais |
| 015 — UI Clientes/Serviços | PLANNED | — | — | Cadastros completos |
| 016 — UI Agenda | PLANNED | — | — | Dia/Semana/Mês |
| 017 — UI Conversas/chat | PLANNED | — | — | Sessão/mídia/entrega |
| 018 — Negócio/onboarding/ativação | PLANNED | — | — | WA opcional/teste real |
| 019 — UI importação/histórico | PLANNED | — | — | Sessão/concluir único |
| 020 — Lembretes/lifecycle agenda | PLANNED | — | — | Jobs e versão de compromisso |
| 021 — Notificações/alertas críticos | PLANNED | — | — | Gate capacidade/email U-03 |
| 022 — Retenção/exclusão recuperável | PLANNED | — | — | U-01 antes de purge Não classificadas |
| 023 — Home/Configurações completas | PLANNED | — | — | Integração operacional |
| 024 — Retirada legado/ensaio release | PLANNED | — | — | Consumers zero, dados/restore/capacidade |
| 025 — Auditoria final MVP | PLANNED | — | — | Conformidade global antes de uso real |

## Evidências e atualização

Por Goal implementado registrar diff/testes com resultado e data, review Astra e correções; ao aceitar, registrar também o SHA do commit de fechamento criado pelo Astra, que passa a ser a baseline aceita vigente. IMPLEMENTED/REVIEW_REQUIRED não permite assumir aceite nem iniciar consumer dependente sem revisão. Ao aceitar, atualizar os documentos afetados e seguir o [fechamento por commit](MASTER_PLAN.md#fechamento-por-commit-e-baseline-aceita) antes de reavaliar o roadmap e escrever o próximo Goal. Descoberta arquitetural exige DECISIONS/MASTER_PLAN revisados antes do próximo prompt.

Validação recuperada do Goal0: IA39 passou/1 falhou; auditoria estática14 passou/health remoto1 pulado. Nenhum teste DB real, E2E, deploy ou comparação de todos os frames realizado. Esses limites não são aprovação de qualidade de runtime.

Review001: suite Go atual executada por Astra com `-count=1 -json`: 95 nós passaram, 2 testes falharam em cleanup preexistente; 31 nós do handler passaram. Build/vet passaram. Formatação equivalente a gofmt após normalização LF; checkout CRLF explicado no review. Sem teste remoto/DB de produto. G-35 é achado independente, condicionado a registros existentes, não regressão001 nem exposição ativa comprovada. Nenhum novo código de implementação foi escrito por Astra.
