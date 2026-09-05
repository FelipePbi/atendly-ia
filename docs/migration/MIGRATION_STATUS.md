# Status da migração

Baseline auditada: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`. Atualização: 2026-09-05. Nenhuma implementação ou commit de migração foi feito pelo Goal0.

Status: PLANNED, READY, IN_PROGRESS, IMPLEMENTED, REVIEW_REQUIRED, ACCEPTED, BLOCKED, SUPERSEDED. No objetivo original, `Goal0 = COMPLETE após auditoria aceita`; nesta tabela isso corresponde a **ACCEPTED** após aceite registrado. Entrega documental não presume esse aceite. READY significa prompt executável preparado, não execução iniciada.

| Goal | Status | Commit de implementação | Review | Observações |
| --- | --- | --- | --- | --- |
| 0 — Auditoria/arquitetura/roadmap | REVIEW_REQUIRED | —; baseline 5fb5d51 | Consolidação/revisão documental interna concluída; aceite do usuário não registrado | 12 documentos, arquitetura proposta, plano25 e somente001 detalhado; testes/limites no CURRENT_STATE |
| 001 — Autorizar alvo de instância | READY | — | Pendente após implementação | [Prompt executável](goals/001-autorizar-alvo-instancia-evolution.md); Claude Code/Opus |
| 002 — Base de validação/contratos transporte | PLANNED | — | — | Reavaliar após001 |
| 003 — Tenant/sessão/vínculo WhatsApp | PLANNED | — | — | Ownership e scopes |
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

Por Goal implementado registrar commit inicial/final, testes com resultado e data, review Astra e correções. IMPLEMENTED/REVIEW_REQUIRED não permite assumir aceite nem iniciar consumer dependente sem revisão. Ao aceitar, atualizar documentos afetados e reavaliar próximo Goal. Descoberta arquitetural exige DECISIONS/MASTER_PLAN revisados antes do próximo prompt.

Validação recuperada do Goal0: IA39 passou/1 falhou; auditoria estática14 passou/health remoto1 pulado. Nenhum teste DB real, E2E, deploy ou comparação de todos os frames realizado. Esses limites não são aprovação de qualidade de runtime.
