# Goal 022 — Central de notificações e alertas persistentes

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-15 pelo Tech Lead Agent após [Goal021 ACCEPTED](../reviews/021-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `cb0312b9268aa16c8e013aecf92561218ca1d43e`

Goal anterior: 021 — Lembretes, confirmação de presença e notificação de alteração

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal021 já integrado em `main` (origem `06cc85fc105c718240978f188779b2abde22973b`), incluindo implementação das duas rodadas, review e documentação de fechamento. O commit posterior `35c3ea71d94e67da3b172e35fd09d843c26923d7` corrige apenas o cabeçalho de status do documento do Goal021, que o fechamento tinha deixado em `READY`; não toca código e não muda a baseline. O diff inicial desta execução contra `cb0312b` deve conter, no máximo, esse ajuste documental e artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-28** na parte de central, níveis, estado lida/não lida, resolvido e banner persistente: *"níveis informativo/atenção/crítico, handoff, falha de lembrete"*, com a central própria que a [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md) descreve em "Notificações" e que hoje não existe em camada nenhuma — nenhum modelo no BFF, nenhuma rota, nenhuma tela, nenhuma entrada de navegação.

Este Goal está aqui, e não antes, por uma razão só: **os produtores finalmente existem, e todos são duráveis**. A central não inventa nada — ela lê o que quatro Goals já gravam e dá a isso um lugar onde a profissional olha:

- `Handoff` com `status` OPEN/RESOLVED e `resolvedAt` na IA, mantido desde o Goal005 e resolvido tanto quando a profissional responde (`SessionService`) quanto quando a IA retoma (`HandoffService.resumeBot`) — é *cliente aguardando humano*, com abertura e resolução já escritas por quem é dono do fato;
- `AppointmentNotificationIntent` no Scheduling, cujo próprio comentário de schema diz que o vocabulário fechado de `reason` "é o que a central de notificações do Goal022 vai ler" — é *falha de lembrete*, com estado, motivo e instante de liquidação;
- `ImportSession.completedAt` no Scheduling, exposto por `GET /v1/calendar/imports` desde o Goal020 — é *importação concluída*;
- `AppointmentEvent` com `type=CREATED` e `source=AI`, append-only desde o Goal008 — é *novo agendamento pela IA*, o único evento que o vault manda nascer **silencioso por padrão**, conforme configuração;
- e `GET /v1/status`, que desde o Goal014 verifica Evolution e IA na própria requisição — são *WhatsApp desconectado* e *IA indisponível*, que são **condições**, não eventos.

O que falta é exatamente o que este Goal faz: um lugar durável onde esses fatos viram notificação com nível, ficam lidos quando a pessoa os lê, e — quando são condição — **ficam marcados como resolvidos quando o problema passa**, que é a exigência literal da Especificação das Telas ("problemas resolvidos identificados como resolvidos").

**O alerta externo por e-mail não é escopo deste Goal.** Não existe infraestrutura de e-mail em nenhum serviço: SMTP, `nodemailer` e variável `EMAIL_*` não aparecem no BFF, e o fluxo de recuperação de senha do Goal003 nunca ganhou entrega real. E-mail crítico não é "mais um consumidor do que já está pronto" — é provedor, custo e execução contínua **fora de sessão**, que é precisamente **U-03** ([DECISIONS](../DECISIONS.md)), e nenhuma decisão autorizou compra ou mudança de provedor. Entregar uma preferência de e-mail que nenhuma camada honra seria a mesma classe de defeito que a rodada 1 do [review021](../reviews/021-review.md) recusou. G-28 permanece aberto nessa parte, e o motivo está registrado em v40 do [MASTER_PLAN](../MASTER_PLAN.md).

Este Goal **não** faz: e-mail, push, app nativo, broker, fila externa, cron do sistema operacional, serviço novo nem **worker novo**. Não cria um terceiro loop de processo — o segundo, da entrega de lembretes, é do Goal021 e continua sendo o último. Não faz retenção nem purga de notificação, de `facts` ou de `detail` das intenções: retenção e exclusão de conta são do **023**, onde mora o ciclo cross-store, e criar aqui um segundo prazo de retenção produziria regra paralela à que o 023 vai definir. Não redecompõe `ProductSettingsScreen` (024). Não retira rota legada (025). Não reabre nenhum aceite de 001–021.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), em especial a atribuição já registrada ao BFF — *"central de notificações e preferências"* — e a divisão *"BFF recebe eventos de atenção e mantém central/estado lido/email crítico"*. **D-008** (trabalho durável no dono, sem fila nem serviço novo), **D-037** (a intenção de lembrete como fonte auditável de falha), **D-036** (estado da importação como leitura própria), **D-030**/**D-031** (fundação visual, decomposição por módulo, autorização negada por padrão na UI), **D-034** (projeção versionada com falha visível) e **D-021** (sessão e controle humano) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 004, 005, 008, 010, 014, 017, 018, 019, 020 e 021 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Consultar seletivamente no Product Vault apenas as seções "Central de notificações", "Alertas persistentes", "Handoff" e "Alertas externos" de [Lembretes, Notificações e Instabilidade](../../product-vault/01-Regras/07-Lembretes-Notificacoes-e-Instabilidade.md), mais "Notificações" de [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), a topbar em [Navegação e Módulos](../../product-vault/00-Produto/04-Navegacao-e-Modulos.md) e [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md). Não abrir o vault inteiro.
- Consultar `docs/design-reference/claude-design/prototype/project/` apenas na topbar e em tela de listagem com estado lida/não lida, e só para resultado visual. Instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-28** é o alvo, na parte de central/níveis/banner/preferências. G-29 (retenção) **não** é alvo. G-31 avança na seção de Notificações.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`. Usar Graphify apenas para confirmar consumidores de `GET /v1/status` e do `SystemStatusProvider`; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **O BFF tem banco próprio e migrations próprias** (`apps/bff/prisma/`), e nenhum modelo de notificação existe nele.
- **`GET /v1/status`** (`apps/bff/src/modules/status/routes.ts`) devolve `whatsapp` (`CONNECTED`/`DISCONNECTED`/`UNKNOWN`), `ai` (`ACTIVE`/`OFF`/`PENDING`/`UNKNOWN`) e `degraded`, com dependência indisponível virando `UNKNOWN` e nunca `500`. Ela **já escreve** antes de ler: `reconcileAiActivation` tenta convergir a ativação uma vez por requisição, sem lançar e sem laço (Goal019). Rota de leitura que reconcilia dentro da própria requisição é padrão vigente e aceito aqui, não invenção deste Goal.
- **`SystemStatusProvider`** (`apps/frontend/src/shared/runtime/systemStatus.tsx`) é o **único** poller de `/v1/status` da árvore, montado por `AppShell`; chrome e telas filhas leem o mesmo resultado por `useSystemStatus`. Segundo poller na árvore é regressão do Goal018/WU-10.
- **`AppShell`** (`apps/frontend/src/shared/layout/AppShell.tsx`, 382 linhas) já renderiza os chips de estado de WhatsApp e IA e a navegação; `navigation.ts` tem `SIDEBAR_DESTINATIONS`, `MOBILE_TAB_SECTIONS` (quatro abas + "Mais") e `MORE_DESTINATIONS`.
- **`Handoff`** (`apps/ai-orchestrator/prisma/schema.prisma`) tem `tenantId`, `conversationId`, `externalContactId`, `reason`, `summary`, `status` OPEN/RESOLVED, `createdAt`, `resolvedAt` e índice `(tenantId, status, createdAt)`. `HandoffService.pauseForHuman` cria a linha sem checar se já há uma aberta para a mesma conversa; `assistant-tools` e o takeover do dono checam antes. Portanto **pode haver mais de uma linha OPEN por conversa**, e a takeover do dono também produz `Handoff` — os dois fatos são tratados no escopo abaixo.
- **`AppointmentNotificationIntent`** (Scheduling) tem `state`, `reason` (vocabulário fechado), `settledAt`, `detail`, índice `(tenantId, state, dueAt)` e a leitura por compromisso `listAppointmentNotifications`, que **não** devolve `facts` nem `leaseToken`.
- **`AppointmentEvent`** (Scheduling) tem `type`, `source`, `occurredAt` e `sequence` (`BigInt @unique @default(autoincrement())`), com índices por `(tenantId, appointmentId, …)` — **não** há índice por `(tenantId, sequence)`.
- **`GET /v1/calendar/imports`** devolve direito, sessão viva e histórico da importação, e é leitura pura (Goal020/D-036).
- **`onboardingState`** (`apps/bff/src/modules/onboarding/routes.ts`) já compõe, numa função só, negócio, calendário, serviço ativo, disponibilidade e instância WhatsApp, e `profile.onboardingCompletedAt` diz se o onboarding foi concluído.
- Gates: `scripts/validate-core.mjs` (builds e suítes sem banco) e `scripts/validate-integration.mjs` (banco descartável, um passo `rehearse:goalNNN-…` por migration).

## Pontos de implementação

- `apps/scheduling-service/` — leituras por tenant para a central; migration **aditiva de índice apenas**.
- `apps/ai-orchestrator/` — leitura por tenant de quem está aguardando humano.
- `apps/bff/` — `prisma/schema.prisma` e migration aditiva, módulo novo `modules/notifications/`, ponto de reconciliação em `modules/status/routes.ts`, clientes internos, `PUBLIC_API_V1.md`.
- `apps/frontend/` — módulo novo `features/notifications/`, rota `app/(platform)/notificacoes/`, `shared/layout/AppShell.tsx` e `navigation.ts`, `data/mappers/publicApiSchemas.ts`, `data/services/`.
- `scripts/` — ensaio da migration do BFF e um passo a mais em `validate-integration.mjs`.
- `docs/migration/` — documentos afetados (ver §10).

Arquivo fora desta lista exige justificativa no relatório; consequência direta do escopo é aceitável, invenção de superfície não.

## Escopo obrigatório

### 1. A notificação é registro durável do BFF, com identidade de dedupe

Modelo `TenantNotification` no BFF, com migration **aditiva** (tabela nova que nasce vazia; nenhum `UPDATE` em linha existente, nenhum backfill):

- `tenantId`, `kind`, `level`, `shape`, `dedupeKey`, `occurredAt`, `readAt`, `resolvedAt`, `subjectId`, `payload` mínimo e `createdAt`/`updatedAt`.
- **`(tenantId, dedupeKey)` é `@@unique`.** É essa chave, e não o código de aplicação, que torna a materialização idempotente: reconciliar dez vezes a mesma fonte produz uma linha. `dedupeKey` é derivada da identidade do fato no dono (ver §3), nunca de `now()`, nunca de contador local e nunca do texto exibido.
- **`level` é tabela fixa por `kind`**, constante única no código, não coluna livre e não escolha de chamador. Os três níveis são os do vault: `INFO`, `ATTENTION`, `CRITICAL`.
- **`shape` distingue `EVENT` de `CONDITION`.** É a diferença que a tela precisa: evento aconteceu e fica no histórico; condição está aberta ou foi resolvida. Só `CONDITION` recebe `resolvedAt`.
- `payload` guarda **apenas** o que a copy e o link precisam (ex.: nome do cliente, id da conversa, id do agendamento, motivo do vocabulário fechado). **Nunca** telefone, credencial, `facts` de intenção, `leaseToken` nem payload cru — o que não sai do dono não passa a sair pelo BFF.
- Índices para as três leituras reais: não lidas por tenant, condições abertas por tenant e histórico por `occurredAt` decrescente.

### 2. A materialização é por leitura reconciliada, sem worker e sem inverter chamada interna

- **Nenhum worker novo, nenhum broker, nenhum cron.** A reconciliação roda **dentro de requisição que já existe**, é limitada, idempotente e **nunca lança**: fonte indisponível deixa o `kind` dela intocado e é reportada como degradada, exatamente como `/v1/status` já faz com Evolution e IA. Uma fonte quebrada nunca derruba a central inteira nem devolve `500`.
- **A direção das chamadas internas continua sendo uma só.** Quem lê é o BFF, que já tem cliente e credencial para Scheduling e IA. Nem Scheduling nem IA ganham cliente HTTP de saída, rota de push para o BFF ou superfície de credencial nova — a propriedade que o [review021](../reviews/021-review.md) registrou como deliberada.
- **Throttle por tenant, persistido.** `NotificationSyncState` por tenant guarda `lastReconciledAt` e o cursor de cada fonte de evento. Reconciliação dentro da janela de throttle é pulada e a resposta sai do estado persistido. A janela vem de configuração com default sensato; não é constante mágica espalhada.
- **Upsert nunca reescreve estado do leitor.** Materializar de novo um fato já materializado **não** zera `readAt`, **não** move `occurredAt` e **não** reabre `resolvedAt`.
- **Condição resolvida é resolvida, não apagada.** Quando a fonte deixa de reportar a condição, a linha aberta daquele `kind`/`subjectId` recebe `resolvedAt`; a linha permanece no histórico. Nada é deletado neste Goal.

### 3. As sete espécies, com fonte, chave e resolução nomeadas

| `kind` | nível | forma | fonte (dono) | `dedupeKey` | resolução |
| --- | --- | --- | --- | --- | --- |
| `CUSTOMER_WAITING_HUMAN` | ATTENTION | CONDITION | `Handoff` OPEN na IA | identidade da **conversa**, não da linha de handoff | fonte não reporta mais a conversa |
| `REMINDER_FAILED` | ATTENTION | EVENT | `AppointmentNotificationIntent` em `FAILED` | identidade da intenção | — |
| `IMPORT_COMPLETED` | INFO | EVENT | `ImportSession.completedAt` | identidade da sessão de importação | — |
| `AI_APPOINTMENT_CREATED` | INFO | EVENT | `AppointmentEvent` `CREATED`/`AI` | `sequence` do evento | — |
| `WHATSAPP_DISCONNECTED` | CRITICAL | CONDITION | `whatsapp` de `/v1/status` | tenant + espécie | estado volta a `CONNECTED` |
| `AI_UNAVAILABLE` | CRITICAL | CONDITION | `ai` de `/v1/status` | tenant + espécie | estado volta a `ACTIVE` |
| `SETUP_INCOMPLETE` | ATTENTION | CONDITION | `onboardingState` do próprio BFF | tenant + espécie | configuração deixa de faltar |

Regras que não podem ser interpretadas de outro jeito:

- **`CUSTOMER_WAITING_HUMAN` deduplica por conversa.** A IA pode ter mais de uma linha `Handoff` OPEN para a mesma conversa, porque `pauseForHuman` cria sem checar. Uma conversa esperando é **uma** notificação, e é por isso que a chave é a conversa. **Handoff de takeover do dono não gera notificação**: a profissional assumindo a conversa não é um cliente esperando por ela — a leitura da IA (§4) exclui esse motivo na origem, e não no BFF.
- **`REMINDER_FAILED` é só `FAILED`.** `DISMISSED` e `CANCELLED` são decisões legítimas do domínio (antecedência vencida, cliente sem telefone, versão superada) e **não** são falha: notificá-las transformaria funcionamento correto em alarme. O motivo exibido vem do vocabulário fechado de `reason`, traduzido; `detail` nunca vai para a tela como está.
- **`AI_UNAVAILABLE` só nasce de indisponibilidade, não de escolha.** `ai.state === "OFF"` é a profissional tendo desligado a IA e **não** gera notificação. `UNKNOWN` (dependência não respondeu) e `PENDING` que não convergiu são os casos de indisponibilidade; a regra exata fica declarada em comentário no código, junto da constante.
- **`WHATSAPP_DISCONNECTED` usa `UNKNOWN` com cuidado:** desconhecido não é o mesmo que desconectado. Só `DISCONNECTED` abre a condição; `UNKNOWN` não abre e **não resolve** uma condição já aberta — é a mesma honestidade do read model do Goal014, que se recusa a afirmar o que não verificou.
- **`SETUP_INCOMPLETE` só vale para negócio que já concluiu o onboarding** (`onboardingCompletedAt` presente). Negócio em onboarding não tem configuração faltando: ele está configurando. A avaliação **reusa `onboardingState`** em vez de reescrever "o que é configuração essencial" numa segunda regra que poderia divergir.
- **`AI_APPOINTMENT_CREATED` nasce silencioso.** É a única espécie sujeita a preferência, com **default desligado**, conforme o vault: "pode gerar notificação conforme configuração do usuário, com default silencioso". Com a preferência desligada, nada é materializado — o cursor avança sem criar linha, para que ligar a preferência não faça chover notificação retroativa.

### 4. As leituras por tenant nos donos

Aditivas, somente leitura, sob a autenticação interna vigente de cada serviço. Nenhuma delas devolve credencial, telefone, `facts` ou `leaseToken`.

- **IA:** leitura de quem está aguardando humano por tenant — uma entrada por conversa, com id da conversa, identificação do contato/cliente como as telas de Conversas já fazem, motivo e instante de abertura, excluindo takeover do dono e ordenada por abertura. Teto de resultados no próprio serviço.
- **Scheduling, falhas de lembrete:** intenções em `FAILED` do tenant, por cursor estável e com teto, devolvendo id, `appointmentId`, `kind`, `slot`, `reason`, `settledAt` e a identificação mínima do compromisso que a copy precisa. Se o índice vigente `(tenantId, state, dueAt)` não sustentar a ordenação por cursor, acrescentar índice **aditivo**; não alterar índice existente.
- **Scheduling, agendamentos criados pela IA:** feed por tenant sobre `AppointmentEvent`, filtrado por `type=CREATED` e `source=AI`, avançando por `sequence` — que é único e monotônico, e por isso é cursor confiável onde `occurredAt` não é (Goal008 já registra que eventos da mesma transação compartilham `occurredAt`). Exige índice **aditivo** por `(tenantId, sequence)`; a migration é só de índice.
- **Importação:** **nenhuma rota nova** — usar `GET /v1/calendar/imports`/o método já existente do `SchedulingClient`. Criar leitura paralela para um fato que já tem leitura própria seria recriar D-036 pela metade.

### 5. Contrato público do BFF

Aditivo, documentado em `apps/bff/PUBLIC_API_V1.md`, tudo sob `requireTenantContext` e escopado pelo tenant da sessão — nunca por `tenantId` de corpo ou query:

- `GET /v1/notifications` — lista com filtro por nível, por não lidas e por resolvidas, paginação com teto, e **janela de histórico limitada**; devolve o nível, a forma, o instante, o estado de leitura, o estado de resolução e o alvo de navegação.
- `GET /v1/notifications/summary` — contadores por nível, total de não lidas e condições abertas. É a leitura barata que o chrome consome.
- `POST /v1/notifications/read` — marca uma notificação ou todas as visíveis como lidas. Idempotente: marcar de novo não muda nada e não é erro.
- `GET /v1/notifications/preferences` e `PATCH /v1/notifications/preferences` — a preferência de `AI_APPOINTMENT_CREATED`, só humano. Nada de e-mail: campo de canal que nenhuma camada honra não entra no contrato.
- Notificação de outro tenant **não é 403 informativo**: é inexistente. Marcar como lida um id alheio responde o mesmo que marcar um id inexistente.

### 6. A reconciliação nos dois pontos certos

- **Condições de WhatsApp e IA reconciliam dentro de `GET /v1/status`**, reusando os valores que a rota **já** computou. Zero chamada remota a mais: a rota já verifica Evolution e IA nesta própria requisição, e já converge ativação antes de ler. A reconciliação ali é local, não lança, e nunca muda o corpo da resposta de status.
- **As demais espécies reconciliam dentro das rotas de notificação**, sob o throttle de §2.
- **`/v1/status` não ganha campo novo** e continua com a mesma forma. Consumidor de status não passa a depender da central.

### 7. As superfícies consumidoras

- **Tela `/notificacoes`**, módulo próprio em `features/notifications/`, seguindo a decomposição por módulo de D-031: lista com os três níveis visualmente distintos, não lida destacada, "marcar como lida" e "marcar todas como lidas", condição resolvida **identificada como resolvida** (e não simplesmente sumindo), histórico recente e vazio explicado — "nada exige sua atenção agora" é informação, não tela em branco. A preferência de agendamento criado pela IA mora **aqui**, e não em `ProductSettingsScreen`: a Especificação das Telas põe Notificações como destino próprio, e o review021 registrou que aquela tela já cresceu além do razoável e será redecomposta no 024.
- **Entrada na navegação**: topbar em tablet/notebook/desktop, conforme "Navegação e Módulos"; no mobile, dentro de "Mais", sem disputar as quatro abas. O indicador de não lidas usa o mesmo tick do `SystemStatusProvider` — **um poller na árvore, não dois**. Contador com teto de exibição; nunca número cru sem limite.
- **Banner persistente** para WhatsApp desconectado e IA indisponível, derivado do **`/v1/status` que o shell já lê**, e não da central. Isso é deliberado: o banner afirma a condição **agora**, e a central guarda **desde quando** e **até quando** — uma fonte por superfície, sem dois caminhos podendo se contradizer quando o throttle atrasa a reconciliação. O banner não repete o que os chips de estado já dizem: ou o chip some, ou o banner não duplica a mesma frase.
- **Nada de contagem local somada na tela.** O que a tela mostra é o que a rota devolveu, como no progresso da importação (D-036, item 9).

### 8. Prova

- **Domínio contra PostgreSQL real** (`validate:integration`): idempotência do upsert sob reconciliação repetida; `readAt` preservado ao rematerializar; condição aberta e depois resolvida quando a fonte para de reportar; `UNKNOWN` não abrindo e não resolvendo condição de WhatsApp; duas linhas `Handoff` OPEN na mesma conversa produzindo **uma** notificação; takeover do dono não produzindo nenhuma; `DISMISSED`/`CANCELLED` não produzindo `REMINDER_FAILED`; preferência desligada avançando cursor sem criar linha; e **isolamento de tenant**: tenant A nunca lê, conta ou marca como lida notificação de B.
- **Fonte indisponível**: com Scheduling ou IA fora, a central responde `200` com o que tem e reporta degradação; nenhuma rota devolve `500` por isso.
- **Ensaio da migration** em `scripts/`, registrado como passo de `validate-integration.mjs`, no padrão dos ensaios existentes: aplica limpa em base nova e é aditiva.
- **Interface em jsdom** (`validate:core`): níveis, lida/não lida, resolvido identificado como resolvido, vazio explicado, preferência, contador no chrome e ausência de segundo poller.
- **Gate renderizado** (`validate:ui`): largura, alvo de toque, contraste computado, foco visível e `prefers-reduced-motion` nas larguras 360/390/768/1024/1440. O gate cobre rota pública; a central é autenticada, então o que ele decide aqui é a não regressão das superfícies públicas e do chrome que este Goal toca. **Fidelidade visual à referência aprovada continua sendo conferência humana** e não pode ser declarada como provada por teste — mesmo limite dos Goals 014–021.

### 9. Migração, compatibilidade e limites operacionais

- **Uma migration, no BFF, aditiva**: tabelas novas que nascem vazias. Nenhum `UPDATE` em linha existente, nenhum backfill, nenhuma coluna removida ou renomeada. No Scheduling, **migration de índice apenas**.
- **Nenhum negócio ganha notificação retroativa de evento antigo.** Os cursores de fonte de evento nascem no instante da primeira reconciliação do tenant, não no início dos tempos: ligar a central não pode despejar meses de histórico como se fosse novidade. Condições, por serem estado corrente, nascem já refletindo o agora.
- Notificação **não é purgada** por este Goal. O crescimento é limitado pela janela de leitura, não por exclusão; a retenção é do 023, e a mesma pendência já declarada para `facts`/`detail` das intenções do Goal021 vai junto para lá.
- Sem e-mail, sem push, sem notificação fora de sessão — consequência direta e declarada de a materialização ser por leitura: alerta que precise sair com o produto fechado depende de U-03.
- Nenhum segredo, telefone ou credencial em `payload`, em log ou em resposta.

### 10. Documentação

Ao final, atualizar **apenas** o que este diff faz mentir ou ficar incompleto: `CURRENT_STATE.md` (a central e suas fontes), `GAP_ANALYSIS.md` (**G-28** fechado na parte de central/níveis/banner/preferências e **explicitamente aberto** na parte de alerta externo, com U-03 nomeada), `REUSE_ANALYSIS.md` (o que foi reusado em vez de recriado: `onboardingState`, `GET /v1/calendar/imports`, `SystemStatusProvider`, `GET /v1/status`), `DATA_MIGRATION.md` (a migration aditiva e a ausência de backfill) e `VALIDATION_GATE.md` (o passo de ensaio novo). **Não** tocar `MIGRATION_STATUS.md`, `MASTER_PLAN.md`, `DECISIONS.md` nem `reviews/`: fechamento e decisão são do Tech Lead.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe `TenantNotification` no BFF, criado por migration aditiva, com tabela nascendo vazia e sem nenhum `UPDATE` em linha existente.
2. `(tenantId, dedupeKey)` é único no banco; a idempotência não depende de verificação em código.
3. `level` é derivado de `kind` por tabela fixa única no código; nenhum chamador escolhe nível.
4. `shape` distingue `EVENT` de `CONDITION`, e só `CONDITION` recebe `resolvedAt`.
5. `payload` não contém telefone, credencial, `facts`, `leaseToken` nem payload cru — verificável lendo o que é gravado, não o que é documentado.
6. Reconciliar a mesma fonte duas vezes seguidas não cria segunda linha.
7. Rematerializar um fato já lido **não** zera `readAt`.
8. Rematerializar um fato já resolvido **não** reabre `resolvedAt`.
9. Condição deixa de ser reportada pela fonte ⇒ a linha aberta recebe `resolvedAt` e permanece no histórico; nenhuma linha é deletada.
10. `WHATSAPP_DISCONNECTED` abre em `DISCONNECTED`; `UNKNOWN` não abre.
11. `UNKNOWN` **não** resolve uma condição de WhatsApp já aberta.
12. `ai.state === "OFF"` não gera `AI_UNAVAILABLE`.
13. Duas linhas `Handoff` OPEN na mesma conversa produzem exatamente uma notificação `CUSTOMER_WAITING_HUMAN`.
14. Handoff de takeover do dono não produz notificação, e a exclusão acontece na leitura da IA.
15. `CUSTOMER_WAITING_HUMAN` é resolvida quando a conversa deixa de aparecer na leitura da IA.
16. Intenção `DISMISSED` não produz `REMINDER_FAILED`; `CANCELLED` também não; `FAILED` produz.
17. O motivo exibido de `REMINDER_FAILED` vem do vocabulário fechado de `reason`, traduzido; `detail` não é exibido cru.
18. `IMPORT_COMPLETED` é materializada a partir da leitura de importação já existente, sem rota nova no Scheduling.
19. `AI_APPOINTMENT_CREATED` não é materializada com a preferência desligada, e o cursor avança mesmo assim.
20. Ligar a preferência não materializa retroativamente o que passou enquanto ela estava desligada.
21. `SETUP_INCOMPLETE` não nasce para negócio com onboarding incompleto.
22. `SETUP_INCOMPLETE` reusa `onboardingState`; não existe segunda definição de "configuração essencial" no diff.
23. O feed de agendamentos da IA avança por `sequence`, não por `occurredAt`.
24. A migration do Scheduling é **só de índice**: nenhuma coluna, tabela ou constraint nova.
25. Nenhum arquivo de `apps/scheduling-service/` ou `apps/ai-orchestrator/` ganha cliente HTTP de saída para o BFF.
26. Nenhum processo, worker, loop, broker, fila ou cron novo existe no diff.
27. A reconciliação nunca lança: fonte que falha deixa o `kind` dela intocado e é reportada como degradada.
28. Com Scheduling fora, `GET /v1/notifications` responde `200` com o que tem; não há `500`.
29. O throttle por tenant é persistido e configurável, e reconciliação dentro da janela é pulada.
30. `GET /v1/status` reconcilia as condições reusando os valores que já computou, sem nenhuma chamada remota a mais, e **sem mudar a forma da resposta**.
31. As rotas de notificação escopam tudo pelo tenant da sessão; nenhuma aceita `tenantId` de corpo ou query.
32. Tenant A não lê, não conta e não marca como lida notificação de B — provado contra PostgreSQL real.
33. Marcar como lida um id alheio responde igual a marcar um id inexistente.
34. `POST /v1/notifications/read` é idempotente.
35. Os cursores nascem no instante da primeira reconciliação do tenant; nenhuma notificação retroativa de evento antigo é criada.
36. `PUBLIC_API_V1.md` documenta as rotas novas e **não** menciona canal de e-mail.
37. Nenhum campo, preferência, copy ou rota sobre e-mail crítico existe no diff.
38. A tela `/notificacoes` distingue os três níveis, mostra não lida, marca como lida uma e todas, e identifica condição resolvida **como resolvida**.
39. A tela vazia explica que nada exige atenção, em vez de ficar em branco.
40. A preferência mora na tela de Notificações; `ProductSettingsScreen` não ganha bloco novo.
41. A entrada de navegação existe na topbar em desktop e dentro de "Mais" no mobile, sem virar quinta aba.
42. O contador de não lidas consome o tick do `SystemStatusProvider`; não existe segundo poller na árvore — verificável por busca de `setInterval`/listener novo.
43. O banner persistente deriva de `/v1/status`, não da central, e não repete a mesma frase dos chips de estado.
44. Existe ensaio da migration em `scripts/`, registrado como passo de `validate-integration.mjs`, e ele aplica limpa em base nova.
45. `validate:core` passa, com os skips preexistentes declarados.
46. `validate:integration` passa, incluindo o passo novo.
47. `validate:ui` passa nas cinco larguras, após `validate:core`.
48. `git diff --check` limpo; typecheck e lint das áreas tocadas limpos.
49. Os documentos de §10 são atualizados, e nenhum documento de fechamento é tocado.
50. Nenhuma afirmação de documentação descreve superfície que o diff não entrega — a recusa que fechou a rodada 1 do Goal021 vale aqui inteira.

## Entrega

Relatório do Developer com: diff por área, resultado real dos gates (não "deveria passar"), a lista de arquivos tocados fora dos pontos de implementação com justificativa, a constante que mapeia `kind` → `level` → `shape` transcrita, as chaves de dedupe de cada espécie, e o que ficou declaradamente fora — em especial o alerta externo por e-mail e a retenção. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
