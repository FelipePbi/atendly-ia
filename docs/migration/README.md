# Migração do Atendly

Esta pasta contém a auditoria independente, a arquitetura alvo e o plano incremental para o único MVP do Atendly. Goal0 analisa e planeja; não implementa produto. Baseline: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`, auditada em 2026-09-05.

**Astra:** Tech Lead / Architect / Reviewer; confronta evidências, decide direção técnica dentro do escopo, mantém plano e inspeciona implementações. **Claude Code / Opus:** Developer / Executor; implementa o Goal vigente, migrations/contratos/testes e entrega diff/resultados para review. Relatório do executor não substitui inspeção real.

## Fontes e leitura

1. [Product Vault](../product-vault/00-HOME.md): regra soberana de produto/UX e escopo MVP.
2. [Claude Design](../design-reference/claude-design/README.md): visual/layout/motion subordinados ao vault; não é arquitetura ou código pronto.
3. `apps/`, `packages/` e Graphify: evidência do runtime e dependências; código confirma decisões importantes.
4. Documentos desta pasta: diagnóstico e propostas técnicas, sem alterar fontes soberanas neste Goal.

| Documento | Pergunta respondida |
| --- | --- |
| [CURRENT_STATE](CURRENT_STATE.md) | O que existe na baseline, quais fluxos/donos/tecnologias e o que foi realmente verificado? |
| [LEGACY_ASSESSMENT](LEGACY_ASSESSMENT.md) | Quais conceitos são substituídos, quais consumers os mantêm e quando podem sair? |
| [GAP_ANALYSIS](GAP_ANALYSIS.md) | Onde runtime/protótipo divergem do produto, com impacto/prioridade/dependências? |
| [REUSE_ANALYSIS](REUSE_ANALYSIS.md) | O que REUSE/REFACTOR/REPLACE/REMOVE/CREATE em frontend, backend, contratos e infra? |
| [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md) | Qual destino físico/lógico, comunicação, ownership e garantias recomendados? |
| [DATA_MIGRATION](DATA_MIGRATION.md) | Como expandir/backfill/cortar/recuperar dados, separando migração interna de importação do usuário? |
| [DECISIONS](DECISIONS.md) | Que decisão está autorizada/proposta, quais alternativas e o que depende do usuário? |
| [MASTER_PLAN](MASTER_PLAN.md) | Qual sequência de 25 Goals, dependências, marcos, riscos e DoD? |
| [MIGRATION_STATUS](MIGRATION_STATUS.md) | O que está planejado/pronto/implementado/revisado/aceito, com commit e evidência? |
| [Goal001](goals/001-autorizar-alvo-instancia-evolution.md) e [review001](reviews/001-review.md) | Qual escopo foi implementado/aceito e qual diff/evidência sustenta o aceite? |
| [Goal002](goals/002-base-de-validacao-reproduzivel.md) | Qual o único próximo escopo executável detalhado para Claude? |
| [AUDIT_PROGRESS](AUDIT_PROGRESS.md) | Onde a auditoria parou/foi retomada, checkpoints, correções e limites? |

Fatos, inferências, divergências e propostas aparecem separados. “Factual concluído” significa evidência suficiente para planejamento, não certificação de produção nem execução de todos os testes. O histórico das interrupções está preservado no progresso.

## Ciclo de execução e manutenção

`Astra gera Goal N → Claude implementa/testa → diff/commit/report → Astra revisa → aceite ou correção → atualizar decisões/plano/status → reavaliar e escrever próximo Goal`.

Atualizar CURRENT_STATE quando um Goal aceito mudar a fotografia de runtime, preservando a baseline anterior na trilha. Atualizar gaps/reuso/dados/arquitetura somente onde mudança alterar conclusões. DECISIONS registra evidência e substituição; MASTER_PLAN é o roteiro vigente, não promessa imutável. MIGRATION_STATUS muda com provas de implementação/review, nunca só com intenção.

Não escrever prompts de todos os Goals agora. Se houver descoberta relevante, Astra confirma no código, registra impacto e insere/divide/reordena/supersede sem perder IDs/histórico. Correções ficam vinculadas ao Goal original. Os oito critérios do ciclo de review/DoD exigidos pelo Goal0 estão operacionalizados no MASTER_PLAN.

Somente esta pasta foi produzida pelo Goal0; nenhuma feature, contrato, schema, migration, teste de runtime, Product Vault ou design foi alterado. Alterações anteriores fora desta pasta foram preservadas. Sem commit, push, merge ou PR.

## Próxima ação

Goal 0 revisado e aceito pelo usuário em 2026-09-05.

O **Goal001 está ACCEPTED** após inspeção do diff e reprodução dos testes pelo Astra em 2026-09-05. A implementação permanece no working tree, sem commit; [review001](reviews/001-review.md) identifica os arquivos/hashes e limites do aceite.

O **[Goal002](goals/002-base-de-validacao-reproduzivel.md) está READY** para **Claude Code / Opus**, focado na base de validação reproduzível. Somente001 histórico e002 vigente estão detalhados; nenhum prompt posterior foi criado. G-35, achado independente de isolamento na consulta de status de mensagem, é obrigatório no Goal003 antes da ampliação de persistência no004. As falhas Go preexistentes não bloquearam001 e serão tratadas em002. Sem push, merge ou PR nesta revisão.
