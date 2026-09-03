# Documentation Refresh Manifest

## Objetivo

Este pacote atualiza documentação **agent-facing, product-facing e UX/UI** para a nova definição de produto presente em `docs/product-vault/`.

Não altera o product vault e não inventa uma nova arquitetura técnica.

## Substituir diretamente

- `/AGENTS.md`
- `/README.md`
- `/GRAPHIFY_WORKSPACE_MAP.md`
- `/docs/README.md`
- `/docs/PLANO_REFATORACAO.md`
- `/docs/ROADMAP_INTEGRACAO_V1.md`
- `/docs/UI_UX_PROTOTYPE_GUIDELINES.md`
- `/apps/frontend/AGENTS.md`
- `/apps/frontend/CLAUDE.md`
- `/apps/frontend/README.md`
- `/apps/frontend-open-design/AGENTS.md`
- `/apps/frontend-open-design/DESIGN.md`
- `/apps/frontend-open-design/DESIGN-HANDOFF.md`
- `/apps/bff/AGENTS.md`
- `/apps/bff/README.md`
- `/apps/ai-orchestrator/AGENTS.md`
- `/apps/ai-orchestrator/README.md`
- `/apps/scheduling-service/AGENTS.md`
- `/apps/scheduling-service/README.md`

## Adicionar

- `/docs/architecture/README.md`

Esse arquivo impede que decisões técnicas antigas sejam usadas como fonte de comportamento de produto enquanto a arquitetura ainda não foi revisada.

## Não sobrescrever automaticamente agora

### `docs/architecture/001-008*.md`

São documentos técnicos. Eles provavelmente contêm premissas antigas de CalendarProvider/Minha Agenda, mas a nova documentação de produto **não é suficiente para decidir sozinha qual arquitetura deve substituí-los**.

Devem ser revisados numa próxima etapa técnica.

### `apps/bff/PUBLIC_API_V1.md`

Contrato técnico. Deve ser revisto quando a refatoração técnica/API for planejada.

### `apps/evolution-go/*.md`

Majoritariamente documentação do provider/fork. Não depende da antiga proposta de calendário.

### `apps/health-worker/*.md`

Não é afetado pelas mudanças de produto atuais.

### Skills/tooling (`.codex/skills`, Graphify docs etc.)

Não são documentação de produto.

## Principais conflitos encontrados no repositório atual

1. `AGENTS.md` raiz ainda permite Agenda Atendly OU Minha Agenda como fonte oficial.
2. `README.md` descreve providers de Agenda Atendly/Minha Agenda como operação atual.
3. `ROADMAP_INTEGRACAO_V1.md` contém goal específico para Minha Agenda CalendarProvider.
4. `UI_UX_PROTOTYPE_GUIDELINES.md` exige Dashboard Minha Agenda, agenda externa, status de sync e migração bidirecional.
5. `frontend-open-design/AGENTS.md` contém dois tons antigos e dois modos de calendário.
6. `frontend-open-design` possui protótipos HTML de agenda externa/sync que devem ser revisados posteriormente.
7. `apps/bff/README.md` ainda afirma que AiSettings aceita apenas dois tons e expõe calendar integration/migrations sob premissa antiga.

## Regra após aplicar este pacote

`docs/product-vault/` é soberano para decisões de produto e UX/UI.

Qualquer restante do código/documentação que contradiga esse vault deve ser tratado como legado ou dívida de alinhamento até a etapa técnica seguinte.
