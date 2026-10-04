# Goal 021 — Lembretes, confirmação de presença e notificação de alteração

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-15 pelo Tech Lead Agent após [Goal020 ACCEPTED](../reviews/020-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

## Baseline aceita

Baseline aceita: `24b744deda8617a28a115a0ff917973635044435`

Goal anterior: 020 — Importação única na UI e histórico

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal020 já integrado em `main` (origem `38c8a44e8a33ab1ba783ca9afe04b6cd1ef1ad56`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-27** na parte de lembretes: *"até dois lembretes, default um a 24 horas, presença separada, notificar cliente por padrão em mudanças relevantes"*, hoje inexistente em qualquer camada. Este é o primeiro Goal em que a plataforma **fala com o cliente sem que ele tenha falado antes**. Toda mensagem até aqui era resposta a uma mensagem recebida, ou teste que a própria profissional disparou. Um lembrete é uma mensagem que sai sozinha, para o telefone de uma pessoa real, sobre um compromisso que pode ter mudado dez minutos atrás.

É isso que torna o Goal caro de errar, e não o tamanho: **lembrete duplicado, lembrete com horário velho e lembrete de atendimento cancelado são danos que nenhuma tela desfaz**. A entrega tem que ser durável (não se perde quando o processo morre), idempotente (não sai duas vezes quando a varredura repete) e revalidada contra o estado do momento do envio (o que vale é o compromisso agora, não o que ele era quando o lembrete foi agendado).

O domínio em que isso se apoia está pronto e aceito desde os Goals 008 e 009: quatro estados do produto com constraint SQL, histórico append-only por evento na mesma transação da mutação, política única de escrita com locks de dia e retry serializável, e `Appointment.presenceConfirmedAt` — coluna que existe desde o Goal008 com o comentário *"alimentado a partir do Goal021 (lembretes)"* no próprio schema. O que falta é o produtor.

Junto vem a regra do vault que a agenda na interface ainda não cumpre: **`Notificar cliente`, marcada por padrão, ao remarcar ou cancelar manualmente** ([Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), "Novo/editar agendamento"), e **confirmação do lembrete** visível nos detalhes do agendamento. As duas telas existem desde o Goal016 e nenhuma das duas afirmações é verdadeira hoje. Entram aqui porque são consumidoras diretas do mesmo produtor: sem ele, seriam mais texto fixo prometendo o que nenhuma camada faz.

Este Goal **não** faz: central de notificações, níveis informativo/atenção/crítico, banner persistente e e-mail crítico (022) — o que este Goal entrega para lá é **falha de lembrete auditável**, com estado e motivo no dono, pronta para ser lida; retenção e exclusão de conta (023); Home e Configurações completas, inclusive a redecomposição de `ProductSettingsScreen` (024); retirada das rotas legadas (025). Não cria broker, fila externa, cron do sistema operacional, serviço novo nem app nativo. Não cria push nem e-mail. Não chama modelo de linguagem para compor lembrete. Não envia WhatsApp real. Nenhum aceite de 001–020 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), em especial a divisão de responsabilidade já registrada — *"Scheduling calcula vencimento/lembrete com appointment/version e revalida status/data/opt-out/telefone antes de emitir intenção de envio. IA aplica elegibilidade do contato e estilo e entrega por Evolution; recibo retorna ao dono por evento idempotente"*. **D-008** (trabalho durável como loop com lease dentro do processo do dono, sem fila nem serviço novo), **D-006** (política única de escrita da agenda), **D-024** (estados do produto, presença e valor final separados), **D-027** e **D-015** (estilo da conversa), **D-021** (sessão, controle humano e contatos), **D-030**/**D-031**/**D-032** (fundação visual, decomposição por módulo, telas de agenda) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 004, 005, 008, 009, 011, 016, 018, 019 e 020 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Consultar seletivamente no Product Vault apenas [Lembretes, Notificações e Instabilidade](../../product-vault/01-Regras/07-Lembretes-Notificacoes-e-Instabilidade.md) **inteiro** — é a fonte deste Goal —, mais as seções "Novo/editar agendamento", "Detalhes do agendamento" e "Mais / Configurações → Agenda" de [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md) e [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md). Não abrir o vault inteiro. Nada da seção "Central de notificações" daquela nota é escopo deste Goal, exceto produzir o estado que a central vai ler.
- Consultar `docs/design-reference/claude-design/prototype/project/` apenas nas telas de Configurações e de detalhe/edição de agendamento, e só para resultado visual. Instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-27** é o alvo na parte de lembretes e notificação de alteração; G-18 fecha o resíduo nominal da presença por lembrete. G-28 **não** é alvo.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`. Usar Graphify apenas para confirmar consumidores das rotas de ciclo de vida do atendimento e do módulo de agenda; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

1. **Lembrete não existe em camada nenhuma.** Não há modelo de lembrete em nenhum dos três `schema.prisma`; a única ocorrência da palavra no código é o campo `reminder` do payload de origem em `integrations/minha-agenda/provider.ts:542,594` e `types.ts:74,118`, que é dado do Minha Agenda e não mecanismo da Avenly. Não há rota, serviço, job, configuração nem tela.
2. **A coluna da presença já existe e já diz de quem está esperando.** `Appointment.presenceConfirmedAt` (`apps/scheduling-service/prisma/schema.prisma:466-468`) está documentada como *"campo separado de `completedAt`, alimentado a partir do Goal021 (lembretes)"*. O evento `PRESENCE_CONFIRMED` já está no enum `AppointmentEventType` e `AppointmentEventSource` já admite `AI`.
3. **A confirmação de presença hoje mente sobre quem confirmou.** `confirmPresenceWithin` (`appointment-lifecycle-service.ts:299-341`) grava o evento com `source: "USER"` **literal**, embora `callerSource` (`shared/auth/internal-auth.ts:92`) já derive `AI`/`USER` do chamador autenticado desde o Goal009, e a rota `POST /internal/appointments/:id/presence` (`modules/calendar/routes.ts:396`) já receba esse contexto. Quando a IA passar a confirmar presença pela resposta ao lembrete, o histórico atribuirá à profissional uma decisão que não foi dela.
4. **O padrão de trabalho durável já existe duas vezes, e as duas são reaproveitáveis.** No Scheduling, `AutoCompleteLoop` (`modules/appointments/auto-complete-loop.ts`) é um loop no próprio processo, com `pg_try_advisory_xact_lock` preso à transação da varredura, `runOnce` invocável por teste e por rota (`POST /internal/appointments/auto-complete`), montado em `app/build-app.ts:49`. Na IA, `InboxWorker` (`modules/inbox/InboxWorker.ts`) é um worker com claim, lease com heartbeat, `batchLimit` e concorrência controlada, montado em `app.ts:70`. **Nenhum broker novo é necessário nem autorizado.**
5. **A direção das chamadas internas é uma só, e o Scheduling não fala com ninguém.** `apps/ai-orchestrator/src/config/env.ts` tem `SCHEDULING_SERVICE_BASE_URL` (:125) e `SCHEDULING_SERVICE_COMMAND_TOKEN` (:133); `apps/scheduling-service/src/config/env.ts` tem `AI_ORCHESTRATOR_COMMAND_TOKEN` (:44) para **aceitar** a chamada da IA e **nenhuma** URL base de serviço interno — o único cliente HTTP de saída do Scheduling é `integrations/minha-agenda/client.ts`. Fazer o Scheduling chamar a IA criaria uma segunda direção de chamada interna e uma superfície de credencial nova; é por isso que quem reivindica trabalho é a IA.
6. **A saída pelo canal do tenant já tem porta, outbox e classificação de falha.** `WhatsAppProvider.sendText` (`modules/channel/ports/`), `EvolutionProvider`, `OutboxStore` sobre `Message` — com `markSent`, `markUndelivered` e `reconcileFromReceipt`, que é o único caminho que tira uma saída de `UNKNOWN` — e `classifySendFailure`, que separa "não saiu" de "não dá para afirmar". Nada disso precisa ser reescrito.
7. **O caminho de saída existente assume o atendimento humano, e por isso não serve para lembrete.** `POST /internal/conversations/:id/messages` (`modules/internal/routes.ts:566`) chama `sessions.assumeHumanControl` **antes** do transporte, de propósito: enviar é assumir. Um lembrete não é a profissional assumindo — se ele passar por ali, toda conversa com lembrete sai do controle da IA e a resposta "sim" nunca é interpretada.
8. **O vocabulário do estilo já é canônico e não tem dono novo.** `AI_CONVERSATION_STYLES` são três (`PROFESSIONAL`, `BALANCED`, `CASUAL`), com `resolveAiConversationStyle` tolerando ausência e alias legado, e `AiTenantConfig` (`enabled`, `tone`) é a configuração por tenant na IA. `enabled` nasce `false` e passa a `true` pela ativação por prova do Goal019.
9. **A elegibilidade do contato já existe.** `Contact.ignored` está no schema da IA desde o Goal005, com `ignoredAt`/`ignoredBy`/`ignoredSource` e índice `[tenantId, ignored]`, e é descrito no próprio schema como *"regra absoluta, prevalece sobre a sessão"*. Não é preciso criar opt-out novo por cliente.
10. **Telefone de cliente é opcional.** `Customer.phone` e `Customer.normalizedPhone` são nuláveis (`schema.prisma:187-188`) desde o Goal006, por decisão de identidade. Cliente sem telefone é situação normal, não erro — e não pode receber lembrete.
11. **As duas telas consumidoras já existem e ainda não cumprem a regra.** `features/agenda/CancelFlow.tsx` e `RescheduleFlow.tsx` não têm nenhuma ocorrência de "notificar"; `LifecycleActions.tsx` já confirma presença manualmente (:89) e já exibe `presenceConfirmedAt` (:204), mas nada na tela diz se o lembrete saiu ou se a confirmação não veio. `ProductSettingsScreen.tsx` (910 linhas) já tem o cenário `availability` servindo Configurações → Agenda (:573-662).
12. **Preço do atendimento tem tipo, e não é número solto.** O acordo do atendimento traz `totalPriceType` desde o Goal007 — mostrar preço no lembrete só é possível quando há preço **fixo**, e é exatamente isso que o vault autoriza.

## Pontos de implementação

`apps/scheduling-service/prisma/`, `apps/scheduling-service/src/modules/appointments/`, `apps/scheduling-service/src/modules/reminders/` (novo), `apps/scheduling-service/src/modules/calendar/` (write-policy, routes, calendar-service), `apps/scheduling-service/src/modules/internal-api/routes.ts`, `apps/scheduling-service/src/app/build-app.ts`, `apps/scheduling-service/src/config/env.ts`, `apps/ai-orchestrator/src/modules/reminders/` (novo), `apps/ai-orchestrator/src/modules/scheduling-service/client.ts`, `apps/ai-orchestrator/src/modules/tools/assistant-tools.ts`, `apps/ai-orchestrator/src/modules/prompts/`, `apps/ai-orchestrator/src/app.ts`, `apps/ai-orchestrator/src/config/env.ts`, `apps/bff/src/modules/settings/routes.ts`, `apps/bff/src/modules/calendar/routes.ts`, `apps/bff/src/clients/scheduling/index.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/frontend/src/features/reminders/` (novo), `apps/frontend/src/features/agenda/` (CancelFlow, RescheduleFlow, AppointmentDetail, LifecycleActions), `apps/frontend/src/features/settings/ProductSettingsScreen.tsx`, `apps/frontend/src/data/`, `apps/frontend/src/shared/styles/`, e suítes em `apps/scheduling-service/tests/`, `apps/ai-orchestrator/tests/`, `apps/bff/tests/` e `apps/frontend/tests/`.

Arquivo fora desta lista só entra se for consequência direta e declarada do escopo, e o relatório precisa dizer por quê.

## Escopo obrigatório

### 1. Configuração de lembrete, com o default do vault

No Scheduling, dono da agenda: configuração por tenant com **até dois** lembretes, cada um com antecedência própria, mais confirmação pelo lembrete (liga/desliga) e política de preço (`NUNCA` como padrão; mostrar apenas quando o atendimento tem preço **fixo**).

- "Até dois" é invariante de **esquema**, não de validação de aplicação: a posição do lembrete é uma coluna com restrição SQL que só admite os dois valores, com unicidade por tenant e posição. Não existe caminho que grave um terceiro.
- Antecedência é positiva e limitada a um teto declarado; antecedência zero ou negativa é recusada com código próprio.
- Negócio **sem configuração** vale como um lembrete, vinte e quatro horas antes, por constante nomeada e única. Esse default não é materializado por backfill: ausência de linha é ausência de escolha, e continua distinguível de escolha explícita — a mesma regra que o Goal018 aplicou a `modalities`.
- Desligar todos os lembretes é escolha legítima e explícita (zero regras gravadas), diferente de "nunca configurou".

### 2. Versão do compromisso

`Appointment` ganha uma **versão** monotônica por compromisso, incrementada **dentro da mesma transação** da mutação, na política única de escrita — nunca por trigger paralelo e nunca por um segundo caminho de escrita.

Ela incrementa exatamente quando muda o que o cliente precisaria saber: **data, horário, serviços do atendimento e status** (confirmado, cancelado, concluído, falta). Ela **não** incrementa em mudança interna — observação, valor final, presença confirmada, snapshot de buffer —, e isso é a tradução literal da regra do vault: *"alterações somente internas, como observações ou preço administrativo, não devem gerar notificação automática"*.

A versão é o que dá identidade a uma intenção de envio: o que foi agendado para a versão 3 não vale mais quando o compromisso está na versão 4.

### 3. Intenção de envio durável, no dono

Modelo próprio no Scheduling para a intenção de envio ao cliente, com duas espécies: **lembrete** (uma por posição configurada) e **aviso de alteração** (remarcação ou cancelamento manual com notificação pedida).

Invariantes que o review vai verificar:

- **Dedupe por compromisso, espécie, posição e versão**, garantido por índice único. O aviso de alteração usa uma posição própria e **não nula** — unicidade com `NULL` não deduplica no PostgreSQL, e essa é a forma de o índice não ser decorativo.
- Estados distinguem **não saiu**, **pode ter saído** e **não devia sair**: pendente, reivindicado, enviado, falho, dispensado e cancelado, com motivo nomeado em tudo que não é "enviado". Motivo é vocabulário fechado, não texto livre.
- Criar, remarcar e cancelar recomputam as intenções **na mesma transação da mutação**: as pendentes da versão antiga são canceladas e as da versão nova são criadas. Remarcar não deixa para trás o lembrete do horário velho.
- Lembrete cuja antecedência já passou no momento do agendamento nasce **dispensado com motivo**, não enviado imediatamente: agendar às 22h para amanhã às 9h não dispara agora um lembrete de "24 horas antes".
- Só compromisso **futuro e confirmado** gera lembrete. Atendimento importado do passado, concluído, cancelado ou com falta não gera — e isso vale inclusive para os milhares de atendimentos que uma importação única pode criar de uma vez.
- Cancelamento gera aviso de alteração **somente** quando a notificação foi pedida; cancelar sempre cancela as intenções pendentes.

### 4. Reivindicar e liquidar, com revalidação no momento do envio

Rota interna que **reivindica** intenções vencidas em lote e rota interna que **liquida** o resultado. O lease é o mesmo padrão de D-008 e do `InboxWorker`: exclusão vem do claim, expira sozinho quando o processo morre e é renovado enquanto o trabalho corre.

A reivindicação revalida, dentro da transação, contra o estado **do momento**:

- a versão da intenção ainda é a versão vigente do compromisso — versão divergente vira **cancelada**, não enviada;
- lembrete exige compromisso `CONFIRMED` e início ainda no futuro; aviso de alteração aceita compromisso cancelado, porque é justamente disso que ele fala;
- o cliente tem telefone — sem telefone, **dispensada com motivo**, nunca erro;
- teto de lote por varredura e por tenant, para que uma importação recém-concluída não vire uma rajada.

A liquidação é **idempotente** e não tem volta de estado terminal: liquidar duas vezes a mesma intenção não muda o resultado nem soma tentativa. Intenção reivindicada cujo lease expirou volta para pendente com tentativa contada, e tentativa esgotada vira falha com motivo — nunca desaparece.

**Conteúdo é composto pelo dono, não pelo entregador.** A intenção carrega os fatos prontos: nome do cliente, telefone, serviços, e a data e a hora **já formatadas no fuso do tenant** a partir de `CalendarSettings.timezone`, com o instante junto. A IA nunca formata instante — é assim que este Goal não depende do resíduo do timezone replicado, registrado no [review019](../reviews/019-review.md). Preço só entra quando a política é mostrar **e** o atendimento tem preço fixo.

### 5. Entrega pela IA, com estilo e sem assumir o atendimento

Loop de entrega no processo da IA, no formato do `InboxWorker`: reivindica, entrega, liquida. Ele aplica o que o TARGET_ARCHITECTURE atribui à IA — **elegibilidade do contato e estilo** — e nada mais:

- contato `ignored` → dispensada com motivo. É regra absoluta e prevalece;
- canal do tenant não conectado → **falha** com motivo, auditável: é problema operacional do negócio, não decisão do cliente;
- IA não efetivamente habilitada para o tenant → dispensada com motivo. Um lembrete que pergunta "confirma?" para um número que ninguém vai ler é pior do que lembrete nenhum — e é o mesmo critério de aptidão efetiva que o Goal019 fechou;
- o texto é composto por **modelo de mensagem por estilo** (os três de `AI_CONVERSATION_STYLES`), com os fatos vindos da intenção. **Nenhuma chamada de modelo de linguagem compõe lembrete**: estilo muda registro e informalidade, nunca o fato. Um lembrete que inventa horário é o dano que este Goal existe para evitar. Endereço não é repetido automaticamente;
- a saída é gravada como `Message` do tenant com `correlationId` **determinístico a partir da identidade da intenção**, criada **antes** do transporte, e reusa `OutboxStore` e `classifySendFailure`. Antes de enviar, a existência de uma saída com esse `correlationId` já enviada é verificada: é isso que faz a reivindicação repetida após queda do processo **não** duplicar a mensagem do cliente;
- a entrega **não** chama `assumeHumanControl` e não usa a rota de mensagem da profissional. O controle continua com a IA, sem o qual a resposta ao lembrete não é interpretada;
- contato e conversa são resolvidos pelo **mesmo caminho** que o processamento de entrada usa. Se hoje ele só é alcançável de dentro do inbound, extrair — não criar uma segunda forma de existir uma conversa.

### 6. Confirmação pela resposta

Quando o negócio habilita confirmação pelo lembrete, a resposta do cliente é tratada na conversa, pela IA, com as quatro saídas do vault:

- "sim" → registra a confirmação de presença e responde brevemente;
- "não" → pergunta se deseja cancelar ou remarcar, e **nunca decide sozinha**: cancelamento e remarcação seguem as ferramentas e as confirmações explícitas que o Goal011 fechou;
- resposta vaga → tenta esclarecer;
- sem resposta → **nada acontece**: o agendamento permanece válido, e a única consequência é a profissional ver, discretamente, que a confirmação não veio.

O registro da presença usa a rota que já existe (`POST /internal/appointments/:id/presence`), e o evento passa a gravar a origem **derivada do chamador** em vez do `"USER"` literal de hoje. Presença continua separada de status e de conclusão, como o Goal008 fixou: confirmar presença não confirma, não conclui e não cancela nada.

### 7. Notificar cliente na alteração manual

`POST /v1/appointments/:id/cancel` e `POST /v1/appointments/:id/reschedule` passam a aceitar a intenção de notificar o cliente.

- **Omitir é não notificar.** O default do contrato é silêncio; quem notifica é quem pede. O padrão do vault ("marcada por padrão") é da **interface**, e a interface manda o campo sempre, explicitamente. Essa assimetria é deliberada: a IA cancela e remarca dentro da própria conversa, a pedido do cliente, e avisar o cliente do que ele acabou de pedir é ruído.
- Alteração relevante (data, horário, serviço) enfatiza a recomendação de notificar na tela; alteração interna não oferece a opção, porque não gera aviso.
- Nenhuma rota pública existente muda de forma para quem não usa o campo novo.

### 8. As duas telas consumidoras

- **Configurações → Agenda** ganha a seção de lembretes: quantidade (até dois), antecedência com presets e opção personalizada, confirmação pelo lembrete e política de preço. Entra como bloco do módulo novo consumido por `ProductSettingsScreen`, **sem redecompor a tela** — isso é do Goal024, como o Goal020 já fez com a seção de importação.
- **Agenda**: `Notificar cliente` marcado por padrão em cancelar e remarcar, com ênfase quando a alteração é relevante; e, nos detalhes do agendamento, o estado do lembrete e da confirmação — enviado, não enviado com motivo, confirmado, ou **aguardando confirmação**, este último discreto, como o vault pede. A tela não afirma o que nenhuma camada calcula: sem lembrete configurado, não há estado de lembrete para mostrar.
- Invariante do shell mantida: uma única chamada de `useShellConfig` por árvore renderizada, provada por render (D-030/D-031). Nenhum arquivo novo sem consumidor; nenhuma folha de estilo importada apontando para diretório vazio.

### 9. Provas

O padrão que este Goal precisa evitar é o mesmo que derrubou três rodadas do Goal019 e uma do Goal020: **dublê sustentando afirmação sobre produção**. Aqui o endereço é concreto — o agendamento, a invalidação por versão, o dedupe e o lease só existem de verdade no PostgreSQL.

- **Scheduling, integração contra PostgreSQL real:** lembrete agendado na criação e reagendado na remarcação; cancelamento cancelando as pendentes; versão divergente cancelando a intenção na reivindicação em vez de enviar; dedupe provado por **tentativa de inserção duplicada**, não por leitura; antecedência já passada nascendo dispensada; cliente sem telefone dispensado; duas varreduras simultâneas não reivindicando a mesma intenção; lease expirado devolvendo a intenção; liquidação repetida sendo inócua; isolamento por tenant com dois negócios na mesma base. Migration aditiva com ensaio próprio, no padrão dos Goals 018 e 019.
- **IA:** elegibilidade (`ignored`, canal desconectado, IA não habilitada) cada uma com o seu desfecho; composição por estilo com os três estilos, e o mesmo fato produzindo o mesmo conteúdo factual nos três; **reivindicação repetida após falha antes da liquidação não produzindo segunda mensagem**, provada pela existência de uma única saída com o `correlationId` determinístico; entrega não assumindo controle humano, provado pelo estado da sessão depois do envio; falha de transporte classificada com `classifySendFailure` e a intenção liquidada como falha auditável.
- **Confirmação:** "sim" registrando presença com origem `AI` no evento; "não" oferecendo cancelar ou remarcar sem executar nada sozinha; resposta vaga não registrando presença; ausência de resposta não mudando estado nenhum.
- **BFF:** as rotas novas com contexto de tenant, incluindo 401/403 e a forma exata da resposta; `notifyCustomer` omitido não notificando.
- **Frontend:** suíte de schema para as respostas novas; `Notificar cliente` marcado por padrão e enviado explicitamente; alteração interna não oferecendo a opção; estado do lembrete e da confirmação exibidos a partir da leitura, nunca de texto fixo; invariante do shell por render; suíte axe das superfícies novas.
- **Nenhuma suíte pode afirmar que o WhatsApp real recebeu alguma coisa.** Todo transporte continua dublê, como nos Goals 004, 013 e 019, e isso é declarado.

### 10. Documentação

Atualizar, na medida exata do que este diff muda: [CURRENT_STATE](../CURRENT_STATE.md) (agenda, lembretes e entrega), [GAP_ANALYSIS](../GAP_ANALYSIS.md) (G-27 na parte de lembretes e notificação de alteração; G-18 no resíduo da presença), [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) (o que foi reaproveitado de `AutoCompleteLoop`, `InboxWorker`, `OutboxStore` e da política única de escrita) e [DATA_MIGRATION](../DATA_MIGRATION.md) (a migration aditiva e o seu ensaio). Não tocar documentos de fechamento, review, MASTER_PLAN, DECISIONS ou MIGRATION_STATUS — isso é do reviewer.

## Migração, compatibilidade e limites operacionais

- **Migration aditiva, sem backfill de comportamento.** Colunas e tabelas novas nascem com default que reproduz o estado atual: nenhum compromisso existente ganha lembrete retroativo, e nenhuma intenção é criada para o passado. Ensaio próprio e `validate:integration` executado de verdade contra PostgreSQL descartável, como nos Goals 018 e 019.
- **Compatibilidade:** nenhuma rota pública existente muda de forma ou de significado; `notifyCustomer` é aditivo e opcional, com omissão preservando o comportamento de hoje.
- **Nenhum broker, fila externa, cron do sistema ou serviço novo.** O trabalho durável mora no banco do dono e é executado por loop no processo do dono, que é o que D-008 fixou e o que `AutoCompleteLoop` e `InboxWorker` já praticam. Capacidade de execução contínua — quantas instâncias, com que disponibilidade — é decisão de operação e continua fora.
- **Gate operacional declarado, que este Goal não fecha:** nenhuma mensagem sai para um número real. O transporte é dublê e não há prova de entrega pelo WhatsApp — mesma classe do gate do Goal019.
- **Entrega é no mínimo uma vez, e a defesa contra duplicata é o `correlationId` determinístico verificado antes do envio.** A janela em que a duplicata ainda é possível — processo morto entre o envio aceito pelo transporte e a gravação do resultado — é conhecida, é a mesma do Goal004, e continua declarada em vez de escondida: `UNKNOWN` é estado, não motivo para reenviar.
- **Um lembrete já enviado não é desfeito por remarcação posterior.** Quando a remarcação acontece depois do envio, quem corrige é o aviso de alteração, não o cancelamento da intenção — e a tela de detalhe mostra os dois.
- **Fidelidade visual à referência aprovada continua sendo conferência humana** e não pode ser declarada como provada por teste.
- **Nenhuma tela autenticada passa por render de largura, contraste e foco**, porque o gate de browser cobre rotas públicas. Mesmo limite dos Goals 015–020, declarado em vez de contornado.

## Testes e critérios de aceite

1. A configuração de lembrete existe por tenant, com até dois lembretes garantidos por restrição de esquema, e um terceiro é impossível por qualquer caminho.
2. Negócio sem configuração vale como um lembrete a 24 horas, por constante única, sem backfill.
3. Zero lembretes configurados é escolha legítima e distinguível de ausência de configuração.
4. Antecedência inválida é recusada com código próprio.
5. `Appointment` tem versão monotônica incrementada na mesma transação da mutação, pela política única de escrita.
6. A versão incrementa em data, horário, serviços e status, e **não** incrementa em observação, valor final, presença ou snapshot de buffer.
7. Criar compromisso futuro confirmado cria as intenções de lembrete da configuração vigente.
8. Remarcar cancela as intenções pendentes da versão anterior e cria as da nova.
9. Cancelar cancela as intenções pendentes.
10. Lembrete com antecedência já vencida no momento do agendamento nasce dispensado com motivo, e não é enviado imediatamente.
11. Compromisso passado, concluído, cancelado ou com falta não gera lembrete, inclusive quando criado por importação.
12. O índice único recusa intenção duplicada por compromisso, espécie, posição e versão, provado por inserção.
13. O aviso de alteração usa posição não nula, de modo que a unicidade efetivamente deduplica.
14. A reivindicação revalida a versão e cancela a intenção divergente em vez de enviá-la.
15. Cliente sem telefone tem a intenção dispensada com motivo, sem erro.
16. Duas varreduras simultâneas não reivindicam a mesma intenção.
17. Lease expirado devolve a intenção para pendente com tentativa contada; tentativas esgotadas viram falha com motivo.
18. Liquidação repetida é inócua e não reverte estado terminal.
19. Há teto de lote por varredura, e uma carga grande é processada em varreduras sucessivas em vez de rajada.
20. Data e hora do lembrete são formatadas pelo dono no fuso do tenant, e a IA não formata instante em nenhum ponto.
21. Preço só aparece no lembrete quando a política é mostrar e o atendimento tem preço fixo; o padrão é nunca.
22. Endereço não é incluído automaticamente no lembrete.
23. Contato `ignored` tem a intenção dispensada com motivo.
24. Canal não conectado produz falha auditável com motivo.
25. IA não habilitada produz dispensa com motivo.
26. O texto do lembrete é composto por modelo por estilo, nos três estilos, sem nenhuma chamada de modelo de linguagem, e o conteúdo factual é idêntico nos três.
27. A saída é gravada antes do transporte com `correlationId` determinístico, e reivindicação repetida não produz segunda mensagem ao cliente.
28. A entrega do lembrete não assume controle humano da sessão.
29. Contato e conversa são resolvidos pelo mesmo caminho do processamento de entrada, sem segunda forma de criar conversa.
30. Falha de transporte é classificada e liquidada como falha com motivo, sem apagar a tentativa.
31. Resposta "sim" registra a presença, com o evento gravando origem `AI` derivada do chamador.
32. Resposta "não" oferece cancelar ou remarcar e não executa nada sozinha.
33. Resposta vaga não registra presença; ausência de resposta não altera estado nenhum.
34. Confirmar presença não altera status, conclusão nem cancelamento.
35. `notifyCustomer` omitido não notifica; pedido explicitamente, gera o aviso de alteração.
36. A interface envia `notifyCustomer` sempre explicitamente, marcado por padrão, e alteração interna não oferece a opção.
37. Configurações → Agenda tem a seção de lembretes como bloco de módulo, sem redecompor `ProductSettingsScreen`.
38. O detalhe do agendamento mostra estado do lembrete e da confirmação a partir da leitura, com a ausência de confirmação apresentada discretamente.
39. Uma única chamada de `useShellConfig` por árvore renderizada, provada por render; nenhum arquivo novo sem consumidor; nenhuma folha importada apontando para diretório vazio.
40. `PUBLIC_API_V1.md` documenta as rotas novas, o campo novo e os códigos de recusa.
41. As suítes do Scheduling exercitam agendamento, invalidação, dedupe e lease contra PostgreSQL real, não contra dublê de banco.
42. Nenhuma suíte afirma que o WhatsApp real recebeu mensagem.
43. Migration aditiva com ensaio próprio; nenhum compromisso existente ganha lembrete retroativo.
44. `tsc --noEmit` exit 0 em `apps/scheduling-service`, `apps/ai-orchestrator`, `apps/bff` e `apps/frontend`.
45. Lint exit 0, cobrindo também `tests`.
46. `validate:core` exit 0.
47. `validate:integration` exit 0.
48. `validate:ui` exit 0.
49. `git diff --check` exit 0.
50. `CURRENT_STATE`, `GAP_ANALYSIS`, `REUSE_ANALYSIS` e `DATA_MIGRATION` atualizados na medida do diff; nenhum documento de fechamento tocado.
51. Nenhum aceite de 001–020 reaberto; nenhum broker, fila externa, cron ou serviço novo criado.

## Entrega

Relatório do executor com: diff por arquivo e por quê, incluindo justificativa nominal de todo arquivo fora dos pontos de implementação; saída dos gates; o que foi provado contra PostgreSQL real e o que foi provado com dublê, dito com essas palavras; a janela de duplicata que permanece aberta e por quê; e a lista do que este Goal deliberadamente não fez, com destino. Sem commit, push, merge ou deploy.
