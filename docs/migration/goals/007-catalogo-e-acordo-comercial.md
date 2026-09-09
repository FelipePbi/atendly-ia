# Goal 007 — Catálogo e acordo comercial

**Status: ACCEPTED.** Aceito em 2026-09-09 na [rodada 3 do review007](../reviews/007-review.md); fechamento integrado como `d20a52745cf1aae7391faf5688fb8084271ec3d4`. Texto original preservado abaixo. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-08 pelo Tech Lead Agent após [Goal006 ACCEPTED](../reviews/006-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `8d77ed992f12e1405ae7bfaaeb2d852af5711b5d`

Goal anterior: 006 — Clientes como pessoas

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal006 já integrado em `main` (origem `7f87967b9a053b53ee68d2e20340daa6ea7f9452`), incluindo implementação, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fazer o serviço do Scheduling carregar as semânticas comerciais do produto antes que a agenda (008), a disponibilidade (009), a importação (010) e o assistente (011) passem a consumi-las: preço com quatro significados — fixo, a partir de, sob consulta e não informado —, preço e duração explicitamente ausentes em vez de zero ou inventados, estado de revisão separado de ativo, atributos do serviço previstos para o MVP (descrição, identidade visual, buffers, recorrência de referência), e o acordo comercial de cada atendimento guardado como snapshot estável com essas mesmas semânticas. Fechar G-16 e a parte de catálogo de G-17; deixar o serviço "operacional" com definição única para IA, agenda e ativação. Holds, versionamento de proposta, valor final, presença e eventos do atendimento são do Goal008; recorrência executada pela IA é do Goal011; redesenho da importação é do Goal010; telas de serviços são do Goal015.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), seção "Agenda e catálogo"; D-011, D-012 e D-022 em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e API pública vigente; sem novo serviço nem nova fonte de agenda. Não repetir discovery global.

## Dependências e contexto mínimo

- Goal006 ACCEPTED e integrado. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e dos apps tocados. Consultar seletivamente no Product Vault apenas [Regras de negócio](../../product-vault/01-Regras/01-Regras-de-Negocio.md) — "Ativação da IA", "Serviço operacional" e "Snapshot comercial" —, em [Agenda e agendamentos](../../product-vault/01-Regras/02-Agenda-e-Agendamentos.md) somente "Identidade visual do serviço", "Multi-serviço", "Buffer" e "Recorrência por serviço", e em [Importação Minha Agenda](../../product-vault/01-Regras/06-Importacao-Minha-Agenda.md) somente "Serviços incompletos". Não abrir o vault inteiro; hold, valor final, presença e agendamento manual excepcional são dos Goals 008 e 009.
- [CURRENT_STATE](../CURRENT_STATE.md): "Scheduling, catálogo, clientes e importação" e o delta do Goal006. [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-16, G-17. [DATA_MIGRATION](../DATA_MIGRATION.md): §1 (linhas `Service` e `AppointmentItem`, constraints SQL adicionais ao Prisma), DATA-09 e DATA-12 em §2, §5.2 (linhas "Serviço" e "Agendamento"), §5.3 (semântica FIXED/ON_REQUEST e "preço ausente não vira zero"), §5.4 (linhas IA → Scheduling, BFF → Scheduling, Frontend → BFF) e o gate "Acordo e histórico" de §7. [Review006](../reviews/006-review.md): observações 2, 3 e 4.
- Fatos já confirmados, sem precisar redescobrir: `apps/scheduling-service/prisma/schema.prisma` tem `Service` com `name`, `durationMinutes` obrigatório, `priceType` enum `FIXED | ON_REQUEST`, `price Decimal(12,2)` nullable e `active`; `AppointmentItem` guarda `serviceNameSnapshot`, `durationMinutesSnapshot`, `priceTypeSnapshot` e `priceSnapshot` com FK obrigatória para `Service`; a migration `20260828175825_init` adiciona em SQL `Service_durationMinutes_check` (> 0) e `Service_price_check` (FIXED exige preço, ON_REQUEST exige nulo), constraints que o Prisma não expressa. `services/atendly-service-service.ts` rejeita duração ausente ou zero, só admite os dois tipos, devolve `colorId: null` em `toCalendarService` e `requireActive` bloqueia inativos; `calendar-provider.ts` define `CalendarServiceDefinition` com os mesmos dois tipos; `integrations/atendly/provider.ts` grava os snapshots na criação (`:167`) e soma durações dos snapshots. Rotas: `GET/POST /internal/service-catalog` e `PATCH /internal/service-catalog/:id` em `internal-api/routes.ts`, `GET /internal/services` (ativos) em `calendar/routes.ts`; BFF `GET/POST /v1/services` e `PATCH /v1/services/:id` em `modules/services/routes.ts`, com `editable` vindo de `capabilities.manageServices`; client do BFF e da IA validam `priceType` com Zod fechado em dois valores (`apps/bff/src/clients/scheduling/index.ts:14`, `:81`; `apps/ai-orchestrator/src/modules/scheduling-service/types.ts:5`, `:20`); frontend `serviceSchema` (`publicApiSchemas.ts:144`), `BffServiceCatalogService`, `ProductDirectoryScreen` (formulário com dois tipos e `priceCents ?? 0`) e `OnboardingRuntime` (`servicePriceType`) também fechados em dois valores. Na IA, `list_services` só devolve preço com `includePrices`, `calculateTotalPrice` soma preços e devolve nulo se algum for nulo, e `buildAppointmentComment` escreve "Valor sob consulta." para qualquer total nulo; `listActiveServices` chama `/internal/services`. `minha-agenda/provider.ts` força `priceType: "FIXED"` (`:470`, `:518`, `:527`, `:540`) e usa zero como fallback de preço e a duração total do atendimento como fallback por item (DATA-09).
- Usar Graphify apenas para confirmar callers de `AtendlyServiceService`, `listForScheduling`/`requireActive`, `CalendarServiceDefinition`, `listActiveServices` da IA e dos DTOs de serviço do BFF. Não reconstruir o grafo, percorrer domínios não envolvidos nem reabrir aceites de 001–006.

## Pontos de implementação

- Scheduling: `prisma/schema.prisma` e migrations novas (enum de preço com quatro valores, duração opcional com estado de revisão, atributos do serviço, snapshots com as novas semânticas), incluindo a substituição das constraints SQL `Service_price_check`/`Service_durationMinutes_check` em SQL explícito; `src/modules/services/atendly-service-service.ts` (validação por semântica, operacional versus ativo versus em revisão); `src/modules/calendar/calendar-provider.ts` e `src/modules/integrations/atendly/provider.ts` (definição de serviço, snapshots e total do acordo); `src/modules/integrations/minha-agenda/provider.ts` e `src/modules/migrations/calendar-migration-service.ts` apenas para parar de fabricar `FIXED`/zero/duração por item, sem redesenhar a importação (Goal010); `src/modules/internal-api/routes.ts` e `src/modules/calendar/routes.ts` (contratos por operação).
- IA: `src/modules/scheduling-service/client.ts`/`types.ts` e `src/modules/tools/assistant-tools.ts` (quatro semânticas na listagem, no total e no comentário do agendamento; só serviços operacionais). Sem reescrever prompts ou grafo além do necessário para não inventar preço (Goal011).
- BFF: `src/modules/services/routes.ts`, `src/clients/scheduling/index.ts`, `apps/bff/PUBLIC_API_V1.md`.
- Frontend: `src/data/mappers/publicApiSchemas.ts`, `src/data/services/BffServiceCatalogService.ts` e o mínimo em `ProductDirectoryScreen`/`OnboardingRuntime` para aceitar e exibir os quatro tipos sem quebrar e sem gravar zero; tela completa de serviços é do Goal015.
- Resíduos do Goal006, pequenos e no mesmo diff: `addTag` não reescreve `aiAuthorized` de tag existente; o BFF deriva o identificador de proveniência (`actor`) da sessão autenticada em vez de aceitá-lo do corpo; `list_customer_appointments` da IA consulta por `customerId` quando o contato está vinculado a uma pessoa e só cai em candidatos por telefone quando não está.

## Escopo obrigatório

### 1. Quatro semânticas de preço, sem zero fabricado

`priceType` passa a admitir fixo, a partir de, sob consulta e não informado, com nome de valores decidido no diff e documentado; `price` é obrigatório apenas em fixo e a partir de, e proibido nos outros dois, em validação de aplicação **e** em constraint SQL nova que substitui `Service_price_check`. `FIXED` e `ON_REQUEST` existentes mantêm o significado original; nenhum registro é reclassificado. Preço zero só existe quando informado explicitamente; ausência de preço nunca é serializada, somada ou exibida como zero em nenhum consumer (Scheduling, IA, BFF, frontend, importação). Valores monetários preservam Decimal no banco e semântica consistente no contrato.

### 2. Duração explícita, revisão separada de ativo e serviço operacional

Serviço pode existir sem duração apenas como pendência de revisão (`Precisa de revisão`), estado distinto de `active`: `durationMinutes` opcional com constraint que substitui `Service_durationMinutes_check` (positivo quando presente) e estado de revisão persistido com origem (importação ou manual). Definir em um único lugar o predicado "operacional" — ativo, com duração válida e fora de revisão — e usá-lo em `listForScheduling`/`/internal/services`, em `requireActive` (que passa a recusar também serviço em revisão para novos agendamentos, com erro próprio) e na capacidade de ativação da IA lida pelo BFF ("pelo menos um serviço operacional"). Serviço em revisão continua listável e editável no catálogo; corrigir a duração retira a pendência.

### 3. Atributos do serviço previstos para o MVP

Persistir descrição opcional, identidade visual opcional (uma cor escolhida pela profissional, representada por token estável, substituindo o `colorId: null` fixo), buffers antes e depois em minutos (opcionais, default zero) e recorrência de referência opcional (intervalo em dias). Buffers e recorrência são configuração de catálogo neste Goal: a aplicação dos buffers na ocupação é do Goal009 e o uso da recorrência pela IA é do Goal011; aqui basta persistir, validar, expor nos contratos e documentar que ainda não têm efeito operacional. Não implementar modalidades ou regras privadas do negócio (G-26, Goal018) nem combo comercial.

### 4. Acordo comercial como snapshot estável

`AppointmentItem` passa a guardar as quatro semânticas em `priceTypeSnapshot`/`priceSnapshot` e a duração acordada; o total do atendimento é derivado dos snapshots com regra explícita e única (soma quando todos são fixos; "a partir de" quando há algum a partir de e nenhum sob consulta ou não informado; sem total nos demais casos), usada pelo Scheduling e pela IA. Editar o catálogo depois da confirmação não altera snapshots existentes, e a confirmação lê o catálogo dentro da mesma transação que valida o slot (ordem já estabelecida no Goal006), então uma edição concorrente não mistura versões. Não introduzir versionamento de proposta, hold, valor final, presença nem eventos (Goal008).

### 5. Importação não fabrica semântica

O mapper da Minha Agenda deixa de forçar `FIXED` e zero: preço ausente vira não informado, valor conhecido vira fixo, duração ausente vira serviço em revisão de origem importação, e a duração total do atendimento não é copiada para cada item de um atendimento multi-serviço (item sem duração própria fica com ausência explícita). Nenhuma mudança de fluxo, preview, conclusão ou corte da importação (Goal010).

### 6. Contratos por operação

Scheduling: catálogo com os novos campos e estados, filtro operacional para a IA e erro próprio para serviço em revisão; `/internal/services` continua devolvendo apenas o que a IA pode oferecer. BFF: `/v1/services` e `PATCH /v1/services/:id` com os novos campos, tenant pela sessão e CSRF nas mutações por cookie, DTO aditivo com padrão seguro para respostas antigas. Frontend: schemas aceitam os quatro tipos, duração nula, estado de revisão e atributos novos; o formulário legado do diretório e o onboarding não podem gravar zero nem quebrar ao receber tipos novos. IA: `list_services` devolve tipo e preço com as quatro semânticas (sem `includePrices` como condição para dizer que o preço existe mas não foi informado), total e comentário do agendamento seguem a regra do item 4, e a IA nunca oferece serviço em revisão. Documentar em `PUBLIC_API_V1.md`. `packages/contracts` continua por consumidor comprovado (D-011).

### 7. Resíduos do Goal006

Conforme "Pontos de implementação": `addTag` idempotente sem reescrever autorização; proveniência derivada da sessão no BFF; `list_customer_appointments` por `customerId` quando o contato está vinculado.

## Migração, compatibilidade e limites operacionais

- Migrations novas e aditivas; não reescrever migrations aplicadas, rodar reset em URL herdada nem executar migration durante build. Expandir primeiro (valores novos no enum, colunas opcionais, estado de revisão, constraints SQL novas que aceitam o conteúdo existente), migrar todos os leitores e escritores em repositório (Scheduling, IA, BFF, frontend, mapper de importação) e só então retirar as constraints antigas — em passos separados e ensaiados, com constraints SQL explícitas na migration e a divergência com o Prisma documentada no cabeçalho, como nos Goals 005 e 006.
- Nenhum registro existente muda de tipo, preço ou duração no backfill; serviços existentes continuam `FIXED`/`ON_REQUEST` com os valores atuais e nascem fora de revisão; snapshots existentes preservam o que já têm. Nenhum serviço fictício para satisfazer FK; a FK de `AppointmentItem` para `Service` permanece obrigatória neste Goal (item histórico de origem com referência opcional fica para o Goal010, conforme TARGET_ARCHITECTURE).
- Ensaio em banco descartável, no padrão `scripts/goal006-migration-rehearsal.mjs`: fixture legada com serviços dos dois tipos (incluindo preço zero explícito), agendamentos com snapshots e um serviço importado; provar que a expansão preserva linha a linha, que as constraints antigas só caem depois dos consumers, que serviço com preço zero explícito continua zero, e que depois do corte existem serviço "a partir de", "não informado" e em revisão sem duração; repetição sem mudança de contagem ou estado.
- Reversão: binário anterior volta a funcionar enquanto não existirem tipos novos, duração nula ou revisão pendente; depois disso a versão antiga deixa de ser destino seguro, e isso fica registrado em DATA_MIGRATION. Não reintroduzir zero ou `FIXED` como fallback de rollback.
- Sem WhatsApp real, deploy, credenciais reais em fixtures, commits pelo executor, push/merge/PR ou alteração de provider/framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018). Se surgir evidência de exposição ativa ou necessidade de mudar fronteiras, registrar evidência e devolver a decisão ao Tech Lead.

## Testes e critérios de aceite

1. Dois tenants em fixture real: serviços, atributos e snapshots de A não aparecem nem mudam em B; tenant não selecionável por header/body/query.
2. Semânticas: criar e atualizar serviços nos quatro tipos com as combinações válidas de preço; combinações inválidas recusadas na aplicação e, em integração, também pela constraint SQL; preço zero explícito preservado; preço ausente nunca serializado como zero em Scheduling, BFF, IA e frontend (asserção nos parsers e mappers).
3. Operacional: serviço em revisão ou sem duração não aparece em `/internal/services`, é recusado por `requireActive` com erro próprio, e não conta para a capacidade de ativação lida pelo BFF; corrigir a duração o torna operacional; inativo continua bloqueado como antes.
4. Acordo: confirmação grava snapshots com as quatro semânticas; edição do catálogo após a confirmação não altera snapshots nem o total; edição concorrente entre validação do slot e gravação não mistura versões; total derivado segue a regra única (casos: todos fixos, com a partir de, com sob consulta, com não informado, com zero explícito).
5. Importação: mapper com preço ausente, preço conhecido, duração ausente e atendimento multi-serviço sem duração por item produz não informado, fixo, revisão e ausência explícita — nunca `FIXED` com zero nem duração total copiada; nenhum outro comportamento da importação alterado.
6. IA: `list_services` e o comentário do agendamento apresentam "a partir de", "sob consulta" e "não informado" sem inventar valor; serviço em revisão nunca é oferecido nem agendado (asserção por dublê); total do multi-serviço segue a regra do item 4.
7. Contratos: rotas do BFF com CSRF e tenant da sessão; DTOs e schemas do frontend compatíveis com respostas antigas e novas; formulário legado e onboarding não gravam zero para tipos sem preço; `PUBLIC_API_V1.md` atualizado; client da IA e tools cobertos.
8. Resíduos do 006: tag repetida preserva `aiAuthorized`; proveniência gravada com o ator da sessão mesmo quando o corpo traz outro; compromissos do cliente listados por `customerId` quando o contato está vinculado.
9. Ensaio das migrations em base nova e fixture legada com contagens reconciliadas, constraints antigas removidas só após os consumers e retomada sem duplicação; auditoria estática verde; nenhum segredo no output.
10. `npm run validate:core`, `npm run validate:integration` e `git diff --check` passam; novas suítes incorporadas ao gate apropriado — Scheduling em `tests/unit` (core) e `tests/integration` (integração, banco derivado do alvo já validado), IA, BFF e frontend nas suítes existentes; sem fazer core depender de banco pessoal e sem pular testes de catálogo ou acordo; skips explícitos do 002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo (nomes dos valores novos do enum, representação da cor e da recorrência), migrations/compatibilidade, RED/GREEN dos casos negativos (preço ausente virando zero, serviço em revisão oferecido pela IA, edição do catálogo reescrevendo snapshot, importação forçando FIXED), comandos/resultados e limitações. Atualizar somente contratos/docs afetados e registrar G-16 e G-17 (catálogo) conforme evidência, sem alegar fechamento de outros domínios. Goal007 termina IMPLEMENTED/REVIEW_REQUIRED até review do Tech Lead.

O review de 007 deve usar profundidade **DEEP dirigido** — semântica de preço e duração em todos os consumers, estabilidade do acordo e migração das constraints — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão. Goal008 permanece condicionado ao aceite007 e ao commit de fechamento007 cujo SHA será sua baseline aceita. Não gerar prompts de 008 ou posteriores.
