# Goal 006 — Clientes como pessoas

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-08 pelo Tech Lead Agent após [Goal005 ACCEPTED](../reviews/005-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `30fc42f62616ba826d0f2fc737386b038fbf9fb7`

Goal anterior: 005 — Contatos, sessão e controle humano

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal005 já integrado em `main` (origem `9b31ea4d8990666defcacfd62f69bac6d8047aaf`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fazer o cliente do Scheduling ser uma pessoa identificada por ID estável, e não pelo telefone: telefone opcional e não exclusivo por negócio, número compartilhado entre pessoas, cliente criado somente quando um agendamento é efetivamente confirmado, seleção explícita entre candidatos quando o número não prova a identidade, relação de responsável principal confirmada antes de ser salva, observações internas e tags manuais com autorização explícita de uso pela IA, e o Contato do canal (Goal005) referenciando a pessoa por ID quando resolvida. Fechar G-14 e a parte de cadastro de G-15 antes de qualquer escrita nova de agenda (008) e da importação (010), que dependem de identidade estável. Preferências inferidas, métricas e resumo por IA ficam no Goal012.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), seção "Agenda e catálogo"; D-005 (PROPOSED, a implementar aqui), D-011 e D-021 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente; sem novo serviço nem nova fonte de agenda. Não repetir discovery global.

## Dependências e contexto mínimo

- Goal005 ACCEPTED e integrado. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e dos apps tocados. Consultar seletivamente no Product Vault apenas [Clientes e memória](../../product-vault/01-Regras/04-Clientes-e-Memoria.md) — "Cadastro básico", "Cliente sem telefone", "Telefone compartilhado", "Criação automática", "Relações entre clientes", "Observações internas" e "Tags" — e, em [Fluxos de agendamento](../../product-vault/02-Fluxos/03-Fluxos-de-Agendamento.md), somente o trecho em que a IA confirma para quem é o atendimento. Não abrir o vault inteiro; preferências, métricas e resumo são do Goal012.
- [CURRENT_STATE](../CURRENT_STATE.md): "Scheduling, catálogo, clientes e importação" e o delta do Goal005. [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-14, G-15. [DATA_MIGRATION](../DATA_MIGRATION.md): §1 (linha `Customer` e FKs), DATA-02 e DATA-13 em §2, §5.2 (linha "Identidade de cliente"), §5.3, §5.4 (linhas IA → Scheduling, BFF → Scheduling, Frontend → BFF) e o gate "Identidade" de §7. [Review005](../reviews/005-review.md): observações 1 e 3.
- Fatos já confirmados, sem precisar redescobrir: `apps/scheduling-service/prisma/schema.prisma` tem `Customer` com `phone` e `normalizedPhone` obrigatórios e `@@unique([tenantId, normalizedPhone])`, e `Appointment.customerId` obrigatório com FK composta `ON DELETE RESTRICT`; `AtendlyCustomerService.create` faz `upsert` por telefone normalizado e **renomeia** o cliente quando recebe nome, e `findByPhone` devolve um único cliente por número; `integrations/atendly/provider.ts` chama esse `create` em `createAppointment` **antes** da transação de agendamento, então uma confirmação que falha no slot já criou ou renomeou a pessoa, e `listAppointments` filtra por `customerPhone`; `modules/calendar/routes.ts` exige `customerName` e `customerPhone` no create; `internal-api/routes.ts` expõe `GET/POST /internal/customers` e `GET /internal/customers/:id` com telefone obrigatório; `calendar-migration-service.ts` cria clientes pelo mesmo `create`; o BFF expõe `GET/POST /v1/customers` e `GET /v1/customers/:id` com telefone obrigatório e o frontend já aceita `phone` nulo em `customerSchema`; o client da IA (`scheduling-service/client.ts`) envia `customerName`/`customerPhone` no create e lista futuros por telefone, e o rascunho de agendamento em `assistant-tools.ts` é identificado por `customerPhone`; o Goal005 criou `Contact` na IA sem referência ao cliente; `scripts/final-production-audit.mjs` verifica por regex que nenhum campo `phone` tem `@unique` de campo; `packages/contracts/src/customers` é placeholder.
- Usar Graphify apenas para confirmar callers de `AtendlyCustomerService`, `findByPhone`, `createAppointment`/`listAppointments` do provider, `SchedulingClient` da IA e dos DTOs de cliente do BFF. Não reconstruir o grafo, percorrer domínios não envolvidos nem reabrir aceites de 001–005.

## Pontos de implementação

- Scheduling: `prisma/schema.prisma` e migrations novas (`Customer` com telefone opcional e não exclusivo, relação de responsável, observações e tags com autorização); `src/modules/customers/atendly-customer-service.ts` (criação explícita, candidatos por telefone, atualização explícita de nome e telefone, sem upsert); `src/modules/integrations/atendly/provider.ts` (agendamento por `customerId` ou criação dentro da transação após validar o slot; listagem por cliente); `src/modules/calendar/routes.ts` e `src/modules/internal-api/routes.ts` (contratos por operação); `src/modules/migrations/calendar-migration-service.ts` apenas para não depender do upsert por telefone, sem redesenhar a importação (Goal010).
- IA: `src/modules/scheduling-service/client.ts` e `src/modules/tools/assistant-tools.ts` (resolver candidatos, confirmar a pessoa, agendar por ID, rascunho com `customerId` quando resolvido); `Contact.customerId` opcional no schema da IA e preenchimento no agendamento confirmado; tools de notas e tags só leem o que está autorizado.
- BFF: `src/modules/customers/routes.ts` e `src/clients/scheduling/index.ts`; `apps/bff/PUBLIC_API_V1.md`.
- Frontend: `src/data/mappers/publicApiSchemas.ts` e `src/data/services/BffCustomerService.ts` apenas para aceitar campos e operações novas; sem tela nova — cadastro completo de clientes é do Goal015.
- Resíduos do Goal005, pequenos e no mesmo diff: resolver handoffs `OPEN` da conversa quando a sessão rotaciona e o espelho legado é limpo; índice único parcial em SQL para no máximo uma `ConversationSession` aberta por conversa, com a divergência de schema documentada na migration.

## Escopo obrigatório

### 1. Identidade por ID, telefone opcional e não exclusivo

`Customer` passa a existir sem telefone e a admitir o mesmo número em mais de uma pessoa do mesmo negócio: `phone`/`normalizedPhone` opcionais, unicidade `(tenantId, normalizedPhone)` substituída por índice não exclusivo, `(tenantId, id)` continua a identidade referenciada pelas FKs. Nome e telefone só mudam por atualização explícita; nenhum caminho renomeia, funde ou deduplica pessoas por telefone ou nome parecido (D-005). A normalização de telefone serve para encontrar candidatos, não para provar identidade.

### 2. Resolução da pessoa e criação só na confirmação

Substituir `findByPhone`/`upsert` por resolução explícita: candidatos por telefone (zero, um ou vários), seleção por `customerId` quando a profissional escolhe, e criação de cliente **somente** dentro da transação de confirmação do agendamento, depois de o slot ser validado — consulta de preço ou disponibilidade e confirmação que falha não criam nem renomeiam ninguém. Na IA, o rascunho carrega `customerId` quando a pessoa foi resolvida; com um único candidato para o número do contato, a IA pode propor essa pessoa e pedir confirmação; com vários, pergunta para quem é o atendimento (por exemplo, "Seria para o Pedro novamente?"); sem candidato, cria na confirmação com o nome informado. Listagens e busca de agenda por cliente passam a aceitar `customerId`, mantendo `customerPhone` como filtro de candidatos.

### 3. Responsável principal, observações e tags com autorização

Relação de responsável principal (um por cliente no MVP) persistida com proveniência e estado de confirmação: a IA pode propor, a relação só vira permanente depois de confirmação explícita do cliente ou da profissional. Observações internas livres e tags manuais persistidas no Scheduling, cada uma com autorização explícita de uso pela IA (padrão: não autorizada); a IA só recebe o que está autorizado, e a autorização é atributo do registro, não do prompt. Não implementar preferências inferidas, métricas nem resumo (Goal012), nem texto de orientação de UI (Goal015).

### 4. Contato do canal referencia a pessoa

`Contact` da IA ganha `customerId` opcional, preenchido quando um agendamento é confirmado para uma pessoa resolvida a partir daquele contato; um contato pode referenciar pessoas diferentes ao longo do tempo (mãe agendando para o filho) sem fundir contatos nem clientes. A referência é por ID e tenant; nenhuma FK cruza bancos.

### 5. Contratos por operação

Scheduling: listar/buscar clientes (com filtro por telefone devolvendo candidatos), obter, criar sem telefone, atualizar nome e telefone, definir/limpar responsável, notas e tags com autorização; agendamento por `customerId`. BFF: rotas públicas equivalentes por operação, tenant pela sessão e CSRF nas mutações por cookie; DTO de cliente com telefone nulo, responsável, notas e tags. Frontend aceita campos e operações novas sem redesenho. Documentar em `PUBLIC_API_V1.md`. `packages/contracts` continua por consumidor comprovado (D-011).

### 6. Resíduos do Goal005

Resolver handoffs `OPEN` na rotação de sessão quando o espelho legado é limpo, e garantir uma sessão aberta por conversa com índice único parcial em SQL, com teste de que a segunda abertura concorrente falha ou é absorvida sem duplicar.

## Migração, compatibilidade e limites operacionais

- Antes de backfill/corte, inventariar (M0) `Customer`, `Appointment` por cliente, `ExternalEntityMap` de clientes e `Contact` da IA com contagens sanitizadas: clientes sem nome, telefones inválidos, colisões de normalização entre tenants e apontamentos de mapas. Não presumir produção vazia nem permissão para alterar banco implantado; ensaiar em bancos descartáveis pelos gates existentes.
- Migrations novas e aditivas; não reescrever migrations aplicadas, rodar reset em URL herdada nem executar migration durante build. Expandir primeiro (colunas opcionais, tabelas de relação/notas/tags, índice não exclusivo), migrar todos os leitores e escritores em repositório (Scheduling, IA, BFF, frontend) e só então remover a unicidade antiga — no mesmo Goal, porque todos os consumers são deste repositório, mas em passos separados e ensaiados. Nenhuma fusão, renomeação ou deduplicação no backfill; clientes existentes preservam ID, nome e telefone; `ExternalEntityMap` intocado.
- A regra `no_global_phone_unique_constraint` da auditoria estática continua passando e deve ser complementada por teste que prove duas pessoas com o mesmo número no mesmo tenant.
- Reversão: binário anterior ao corte volta a funcionar enquanto não existirem números compartilhados ou clientes sem telefone; depois disso a versão antiga deixa de ser destino seguro, e isso fica registrado em DATA_MIGRATION. Não reintroduzir upsert por telefone como estratégia de rollback.
- Sem WhatsApp real, deploy, credenciais reais em fixtures, commits pelo executor, push/merge/PR ou alteração de provider/framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018). Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras, registrar evidência e devolver a decisão ao Tech Lead.

## Testes e critérios de aceite

1. Dois tenants em fixture real: clientes, relações, notas e tags de A não aparecem nem mudam em B; o mesmo número em A e em B são pessoas distintas; tenant não selecionável por header/body/query.
2. Identidade: duas pessoas com o mesmo telefone no mesmo tenant coexistem; cliente sem telefone é criado e agendado manualmente; atualização de nome só por operação explícita; nenhuma rota faz upsert por telefone.
3. Criação e resolução: consulta de disponibilidade e de preço não cria cliente; confirmação que falha no slot não cria nem renomeia; confirmação bem-sucedida cria dentro da transação quando não há pessoa resolvida; com um candidato a IA propõe e pede confirmação; com vários, pergunta; agendamento por `customerId` preserva histórico da pessoa correta.
4. Relações, notas e tags: responsável principal só é salvo após confirmação explícita, com proveniência; nota e tag não autorizadas não chegam ao modelo (asserção por dublê que falha se chamado); autorizadas chegam.
5. Contato: `Contact.customerId` é preenchido na confirmação e pode apontar para pessoas diferentes ao longo do tempo sem fundir registros.
6. Contratos: rotas novas do BFF com CSRF e tenant da sessão; DTOs e schemas do frontend compatíveis com respostas antigas e novas; `PUBLIC_API_V1.md` atualizado; client da IA e tools cobertos.
7. Ensaio das migrations em base nova e fixture legada (clientes com e sem nome, apontamentos de mapa, agendamentos por cliente); contagens reconciliadas; unicidade removida só após os consumers; retomada sem duplicação; auditoria estática verde; nenhum segredo no output.
8. Resíduos do 005: handoffs `OPEN` resolvidos na rotação; índice parcial impede segunda sessão aberta.
9. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam; novas suítes incorporadas ao gate apropriado — o Scheduling ganha suíte própria, no core quando não exige banco e na integração quando exige, derivando o banco do alvo já validado; sem fazer core depender de banco pessoal e sem pular testes de identidade ou persistência; skips explícitos do 002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo, migrations/compatibilidade, RED/GREEN dos casos negativos (upsert por telefone renomeando pessoa, cliente criado por consulta de preço, nota não autorizada chegando ao modelo, fusão de contatos por número), comandos/resultados e limitações. Atualizar somente contratos/docs afetados e registrar G-14 e G-15 (cadastro) conforme evidência, sem alegar fechamento de outros domínios. Goal006 termina IMPLEMENTED/REVIEW_REQUIRED até review do Tech Lead.

O review de 006 deve usar profundidade **DEEP dirigido** — migração de identidade, isolamento de tenant e autorização de dados pessoais — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal007 permanece condicionado ao aceite006 e ao commit de fechamento006 cujo SHA será sua baseline aceita. Não gerar prompts de 007 ou posteriores.
