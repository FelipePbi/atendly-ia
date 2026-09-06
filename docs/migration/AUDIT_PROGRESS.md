# Progresso da auditoria — Astra Goal 0

Checkpoint de fechamento da auditoria em 2026-09-05, preservado abaixo como histórico. Atualização posterior: Goal0 tem aceite externo registrado; Goal001 foi revisado/aceito pelo Astra e Goal002 está READY, conforme seção final e MIGRATION_STATUS. Este arquivo preserva retomada, correções e limites de evidência. Decisões ficam em `DECISIONS.md` e a sequência em `MASTER_PLAN.md`.

## Baseline e preservação

- Commit analisado: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`; HEAD permaneceu igual na retomada.
- Alterações anteriores ao Goal: `graphify-out/manifest.json` modificado e `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md` não rastreado. SHA-256 preservados: `17024F507FBE81ADDC42276848C1B67115D2D3D130B465C2B19C5741CF1FC49A` e `6DD69C737F657B9FE31D1E6AEB273915354089E25D35809E4D3B14FBDE12DED6`.
- Na primeira retomada após a interrupção não havia `docs/migration/` nem relatórios temporários dos subagentes. O registro do subagente IA confirmou que `rtk pnpm --filter @atendly-ia/ai-orchestrator test` gerou um lockfile vazio na raiz antes de executar Vitest. Esse `pnpm-lock.yaml` foi removido após confirmar conteúdo e horário; era resíduo desta auditoria, não alteração externa.
- Os três trabalhos anteriores foram interrompidos por limite de uso, sem relatório final. Mensagens parciais foram preservadas; registros locais das três execuções foram localizados para recuperar as consultas e os resultados já obtidos. Não equivalem a auditorias concluídas.
- Apenas documentos nesta pasta podem ser alterados por este Goal. Sem código, migrations, contratos, Product Vault, Claude Design, commit, push ou PR.

## Estado por domínio

| Domínio | Estado vigente | Evidência / próximo passo |
| --- | --- | --- |
| Monorepo/estrutura geral | Factual concluído | CURRENT_STATE; build Scheduling ausente do agregador, deploy não verificado |
| Auth/tenant | Factual concluído | CURRENT_STATE; FKs/guards úteis, falha de alvo advanced-settings Go confirmada |
| Frontend | Factual concluído | CURRENT_STATE + REUSE_ANALYSIS; módulos reais, previews, contratos, estados e classificação por unidade |
| BFF | Factual concluído | CURRENT_STATE; ownership, rotas, contratos e falha parcial de configuração |
| Scheduling | Factual concluído | DATA_MIGRATION §§1–2; locks parciais, snapshots, identidade e replay |
| Minha Agenda/importação | Factual concluído | DATA_MIGRATION §§3–6; capacidades externas completas são gate futuro |
| AI Orchestrator | Factual concluído | CURRENT_STATE; graph, persistência, ferramentas, memória/RAG e handoff |
| WhatsApp/Evolution Go | Factual concluído | CURRENT_STATE; transporte, isolamento, retry e segredo em payload/log |
| Health Worker/jobs | Factual e proposta concluídos | CURRENT_STATE; monitor preservado; alternativas e jobs no dono comparados em TARGET_ARCHITECTURE/D-008 |
| Contracts | Factual concluído | CURRENT_STATE; common real, domínio placeholder, consumidores locais |
| Persistência/data ownership | Factual e plano concluídos | CURRENT_STATE + DATA_MIGRATION §§1–11; BFF/IA/Scheduling/Go, cópias, transformações e recuperação |
| Product Vault × runtime | Consolidado | GAP_ANALYSIS: G-01–G-34; requisitos, impacto, prioridade, dependências e incertezas |
| Protótipo × frontend | Consolidado | REUSE_ANALYSIS + GAP_ANALYSIS; leitura seletiva suficiente, conflito mobile Agenda/Movimento registrado |
| Arquitetura alvo | Proposta entregue | TARGET_ARCHITECTURE + DECISIONS; donos, comunicação, segurança, confiabilidade e alternativas |
| Estratégia de migração | Plano entregue | DATA_MIGRATION; expansão, leitores, backfill, corte, observação e remoção com gates M0–M6 |
| Roadmap | Entregue | MASTER_PLAN: 25 Goals por dependências; MIGRATION_STATUS inicializado; somente Goal 001 detalhado |

## Fatos já observados diretamente pelo agente principal

1. BFF Fastify, Prisma/PostgreSQL, sessão JWT em cookie HttpOnly; `resolveTenantContext` deriva tenant de uma única associação do usuário, rejeitando zero ou múltiplas associações (`apps/bff/src/lib/auth.ts`, `lib/tenant-context.ts`). Cabeçalho do browser não seleciona tenant.
2. Registro cria User, Tenant, TenantMember, BusinessProfile, AiSettings e aceite legal na mesma transação (`apps/bff/src/modules/auth/routes.ts`). WhatsAppInstance ainda pertence ao usuário por `userId @unique`, enquanto AI settings pertencem ao tenant (`apps/bff/prisma/schema.prisma`).
3. Onboarding exige instância WhatsApp conectada e dois tons antigos, e aceita fonte `EXTERNAL` (`apps/bff/src/modules/onboarding/routes.ts`). Diverge do onboarding opcional de WhatsApp e dos três estilos vigentes.
4. `SchedulingClient` e rotas BFF mantêm fontes ATENDLY/MINHA_AGENDA/EXTERNAL, integração operacional, reconexão e migração de agenda. São fatos legados; a regra alvo continua Agenda Atendly única e Minha Agenda importação única.
5. Settings grava estado local antes de sincronizar com AI Orchestrator; falha remota pode deixar configuração divergente (`apps/bff/src/modules/settings/routes.ts`).
6. `InternalHttpClient` propaga tenant/user/request-id e segredo interno, valida resposta com Zod e repete GET; os schemas são duplicados localmente. `packages/contracts/src/internal/index.ts` e `tenant/index.ts` estão vazios.
7. O teste de cadastro BFF é condicionado por flag e chama `/auth/register`, mas a rota registrada é `/v1/auth/register`. Não é evidência de integração saudável (`apps/bff/tests/auth-register.integration.test.ts`).
8. `scripts/build-all.sh` não inclui build de Scheduling; `render.yaml` define seis serviços e executa migrations no build. Estado real do deploy e bancos externos não foi inspecionado.

## Achados recuperados dos subagentes — consolidação concluída

- Scheduling: seleção de provider operacional por `CalendarSettings.source`; migração exige destino vazio, auto-conclui e troca fonte; idempotência separada da transação; criação de bloqueio sem lock conjunto; cliente usa telefone único por tenant e pode ser alterado antes da confirmação do slot; importação filtra cancelados e perde estados históricos.
- IA: webhook cria processor por request apesar de buffers serem Maps por instância; ACK 202 antecede persistência; mensagem `fromMe` registra OWNER sem garantir pausa; guards de IA desabilitada/handoff podem impedir persistência das mensagens na inbox.
- Frontend: camada BFF e estados reais de loading/erro reaproveitáveis; fonte externa, dois estilos e onboarding legado continuam; identidade visual difere da referência aprovada.

Esses achados começaram como resultados parciais. Foram consolidados com suas referências em CURRENT_STATE, DATA_MIGRATION, LEGACY_ASSESSMENT e REUSE_ANALYSIS; severidade e tratamento estão em GAP_ANALYSIS. O término por limite de uso não invalida saídas recuperadas nem transforma hipóteses em fatos. As novas decisões arquiteturais permanecem PROPOSED.

## Validação recuperada

- Execução anterior da suíte IA: Vitest 4.1.11, 6 arquivos, 39 testes passaram e 1 falhou. Falha em `tests/channel/inbound-message-processor.test.ts:423`: expectativa de `sendText` não inclui o `requestId` enviado pelo runtime. Não foi corrigida. A suíte ter rodado foi confirmado no resultado da ferramenta, corrigindo a hipótese inicial de que o comando pnpm não havia executado testes.
- Esta validação não cobre persistência real, concorrência, entrega WhatsApp nem Product Vault. Ausência de relatório final dos subagentes permanece registrada.

## Checkpoint de fechamento factual

- CURRENT_STATE fechado com todos os apps, fluxos, bancos lógicos, contratos e limites da validação. DATA_MIGRATION contém relatório completo de Scheduling/importação, recuperado apesar de encerramento posterior do subagente por limite de uso.
- IA e frontend deixaram checkpoints curtos; suas mensagens e evidências foram incorporadas pelo agente principal. Não é necessário reabrir subagentes nem reconstruir auditoria.
- Correção de precisão: há transações Serializable/advisory locks no provider Atendly; o risco é a cobertura incompleta entre escritores e a separação do replay, não ausência total de concorrência controlada.
- Falha de autorização Go confirmada estaticamente: token de instância não é comparado ao instanceId alvo em GET/PUT advanced-settings. Nenhuma exploração externa realizada.
- Auditoria estática executada: 14 checks passaram e 1 health remoto foi pulado; o script conta skipped como passed. Não é E2E nem validação de produção.
- Discovery amplo encerrado. As matrizes LEGACY/GAP/REUSE, TARGET_ARCHITECTURE, plano de dados entre serviços, decisões e roadmap foram concluídos na síntese posterior.

## Checkpoint da síntese e próximo ponto de retomada

- Infraestrutura útil confirmada: serviços existentes, auth/membership, FKs, snapshots/locks, tools, pgvector, transporte e adapters frontend. Preservação recomendada com correções delimitadas; não há evidência para reescrita total.
- Dependências do produto anterior confirmadas: Minha Agenda operacional, source switching, onboarding dependente de WhatsApp e dois tons. Retirada exige novos consumidores e reconciliação, sem apagar dados nem criar duas agendas.
- Riscos confirmados no código, sem incidente remoto comprovado: autorização do alvo de instância, ACK/dedupe/entrega, disputa humano/IA, identidade por telefone e cobertura parcial de transações/replay.
- Arquitetura proposta mantém seis apps e PostgreSQL; Scheduling é dono de clientes/catálogo/agenda/importação, IA de contatos/sessões/inbox/conteúdo, BFF de plataforma/configuração/notificações, Evolution de transporte e Health Worker de sondas. Jobs/outbox ficam no banco do dono.
- DECISIONS contém D-001–D-015, distinguindo restrições autorizadas de propostas. U-01 (retenção de Não classificadas), U-02 (conclusões legadas, se existirem) e U-03 (capacidade/custo, se necessário) estão isoladas antes das ações dependentes.
- MASTER_PLAN v1 define 25 Goals e gates, sem prazos fictícios ou MVP reduzido. O único prompt detalhado é `goals/001-autorizar-alvo-instancia-evolution.md`, com 15 seções obrigatórias, escopo pequeno e testes de autorização.
- Próxima ação: revisão da entrega e execução do Goal 001 pelo Claude Code / Opus no fluxo do usuário. Astra não implementou nem iniciou essa correção. Goal0 fica REVIEW_REQUIRED, Goal001 READY, demais PLANNED; não presumir aceite.
- Em nova retomada, ler este checkpoint e MIGRATION_STATUS, conferir HEAD/hashes e continuar da revisão ou da implementação entregue pelo Claude. Reabrir discovery somente se houver evidência nova, alteração externa ou lacuna concreta.

## Checklist final do Goal 0

- [x] Product Vault analisado seletivamente por domínios relevantes.
- [x] Protótipo aprovado analisado por índice/design system/módulos, com limite visual declarado.
- [x] Frontend atual analisado.
- [x] BFF analisado.
- [x] Scheduling Service analisado.
- [x] AI Orchestrator analisado.
- [x] Evolution Go analisado.
- [x] Health Worker analisado.
- [x] Packages compartilhados analisados.
- [x] Contratos e consumidores analisados.
- [x] Persistência e cópias auxiliares analisadas.
- [x] Tenant/auth analisados.
- [x] Minha Agenda/importação analisadas; capacidade externa isolada como gate futuro.
- [x] Graphify utilizado para descoberta/dependências, confirmado no código relevante.
- [x] Gaps e divergências registrados.
- [x] Matriz de reaproveitamento criada.
- [x] Arquitetura alvo definida como proposta.
- [x] Migração de dados planejada.
- [x] Decisões e incertezas registradas separadamente.
- [x] Roadmap criado por dependências.
- [x] Riscos classificados.
- [x] Somente Goal 001 detalhado.
- [x] Nenhum código funcional implementado.
- [x] Product Vault preservado.
- [x] Claude Design preservado.
- [x] Nenhum Goal futuro detalhado prematuramente.

Fechamento documental validado: 12 arquivos Markdown UTF-8, links locais e referências explícitas de arquivos existentes, IDs 001–025 consistentes entre plano/status, dependências apontando para Goals anteriores e estrutura obrigatória do Goal001. Não há marcadores de conflito ou whitespace residual nos documentos. HEAD e hashes preexistentes foram reconferidos; alterações permanentes de autoria do Goal0 restritas a `docs/migration/`. Sem commit, push, merge ou PR.

Limites permanecem: IA 39 passou/1 falhou (execução recuperada); auditoria estática 14 passou/1 health remoto pulado. Sem aprovação de build completo, Go, DB real, concorrência, E2E, deploy ou todos os frames. Conclusão documental não equivale a certificação do runtime ou aceite do usuário.

## Checkpoint posterior — review formal001

- Estado recebido: HEAD4ca1301 adicionou os documentos e manifesto anteriores; código continua igual a5fb5d51 até o diff001 do working tree. Aceite externo de Goal0 preservado.
- [Review001](reviews/001-review.md) registra diff/hashes, critérios, consumers, testes e oito achados do executor. Resultado ACCEPTED: guard anterior ao bind/service, tipos/nil/ID vazio protegidos, recusa genérica e limite administrativo preservado.
- Astra reproduziu31 nós de autorização PASS e RED do teste real no handler da baseline. Build/vet Go PASS; suite inteira95 nós PASS/2 testes FAIL por cleanup preexistente de logger. Baseline isolada confirmou mesmas falhas e independência do handler; worktree temporário removido.
- Nova descoberta G-35: /message/status consulta metadados por ID global sem instância; risco condicionado a registros existentes/ID conhecido/client conectado. source é chat/telefone, não owner. Sem inspeção de produção/incidente comprovado.
- Roadmap v2 mantém25 Goals; G-35 é obrigatório no003 antes de004. Goal002 foi detalhado para corrigir a base de validação, sem DTOs novos nem correção funcional de003. Nenhum prompt posterior a002 foi criado.
- CURRENT_STATE preserva fotografia histórica com delta001; G-01 fechado em GAP, G-35 aberto, D-003/D-016 aceitos com escopo, README/status/plano atualizados. Implementação do executor preservada byte a byte; Astra alterou somente documentação em docs/migration.
- Próxima retomada: Claude executa002; Astra revisa diff/testes reais e então detalha003 com prioridade ao isolamento de metadados. Não reiniciar discovery do Goal0. Estado de produção/DB/E2E continua não verificado.
