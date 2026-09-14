# Goal 019 — Demonstração da IA, teste real e autoativação

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-14 pelo Tech Lead Agent após [Goal018 ACCEPTED](../reviews/018-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

Este Goal foi planejado como **018B** no planejamento após o [review017](../reviews/017-review.md) e renumerado para **019** no planejamento após o fechamento018, sem mudança de escopo: o contrato de planejamento do IA Loop só despacha Goal com ID de três dígitos, de modo que `018B` nunca poderia ser despachado pelo loop. As linhas antes numeradas 019–025 no [MASTER_PLAN](../MASTER_PLAN.md) passaram a 020–026, sem perder título, dependência, escopo ou histórico.

## Baseline aceita

Baseline aceita: `317c8262cd486a2f97b9f6051467ea17b8918bbf`

Goal anterior: 018 — Negócio e onboarding em quatro blocos

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal018 já integrado em `main` (origem `ce94b75023987fcfca2a8f86c76cff9d3618b830`), incluindo implementação das três rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-25** na parte que sobrou: a IA passa a ser **demonstrada** antes de o negócio escolher o estilo, o negócio pode **impedir que a IA responda pessoas específicas** antes de qualquer teste, o **teste real** existe como execução com dono, estados e progresso derivado de fato, e a IA **só é ativada automaticamente** depois que esse teste termina bem. Junto vem a reconciliação entre o que o negócio pediu e o que a IA efetivamente aplica, que a D-010 previu desde o Goal0 e que o Goal014 deixou apenas observável.

O Goal018 entregou a entrada: negócio como dado, projeção versionada, onboarding em quatro blocos e conclusão sem WhatsApp. Ele parou exatamente onde este começa, e parou de propósito — o [review018](../reviews/018-review.md) registrou os três limites que este Goal recebe: o checklist da Home foi entregue **sem** o item "teste concluído" porque nenhuma camada o produzia; `PATCH /v1/settings/ai` continua respondendo `contextProjectionStatus: PROJECTED` mesmo quando a projeção falhou; e a ativação continua exigindo apenas "ao menos um serviço operacional", sem prova de que a IA de fato atende.

O que torna este Goal difícil não é a quantidade de telas: é que ele **cria dado real e apaga dado real**, **liga a IA sozinho** e **manipula uma credencial que não pertence a nenhum negócio**. Cada uma dessas três coisas tem um jeito honesto e um jeito que parece funcionar. As três valem mais do que qualquer tela deste Goal.

Este Goal **não** faz: importação na UI (020), lembretes (021), notificações (022), retenção/exclusão (023), Home e Configurações completas, inclusive a redecomposição de `ProductSettingsScreen` (024). Nenhum job, cron ou agendador persistente é criado — o que este Goal precisa de continuidade ele obtém por reconciliação idempotente em requisição, não por processo de fundo novo. Não há design system de terceiros, Tailwind/shadcn, biblioteca visual, store global, framework novo ou tema escuro. Nenhum aceite de 001–018 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (o BFF é dono do desejado; a IA informa o efetivo; read models honestos; credencial de instância cifrada e vinculada); **D-010** (configuração desejada e aptidão efetiva distintas — é a decisão que este Goal aplica), D-007, D-018, D-021, D-027, D-030, D-031, D-033 e **D-034** em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 010, 011, 013, 014, 015, 016, 017 e 018 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler o AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Ativação e Teste do WhatsApp](../../product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md) (agora **inteiro**, é a fonte deste Goal), [Onboarding](../../product-vault/02-Fluxos/01-Onboarding.md) nas seções 7 a 10 e "Checklist pós-onboarding", [WhatsApp](../../product-vault/01-Regras/05-WhatsApp.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md). Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Onboarding-3-IA-e-WhatsApp.dc.html` e suas variantes Tablet/Desktop, mais `Home.dc.html` para o checklist. Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-25** é o alvo, na parte de ativação por teste; G-26 avança na reconciliação. [CURRENT_STATE](../CURRENT_STATE.md): seções de canal/transporte e de status.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md` (onboarding, configurações, status, conversas) e as rotas `/internal/**` da IA. Usar Graphify apenas para confirmar consumidores de `AiSettings.enabled`, de `GET /v1/status` ou do envio Evolution. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **O número da plataforma não existe em camada nenhuma, e não pode virar mais uma linha de tenant.** `ChannelConnection` é `@@unique([tenantId, provider])` e `@@unique([provider, externalInstanceId])`; `WhatsAppInstance` no BFF é única por `userId` e por `tenantId`. Nenhum `.env.example` declara número, instância ou token de plataforma. A instância da Atendly é **configuração do serviço**, não vínculo de negócio.
- **O envio já é uma porta.** `apps/ai-orchestrator/src/modules/channel/ports/WhatsAppProvider.ts` declara `sendText` e `downloadMedia`; `adapters/evolution/EvolutionProvider.ts` é o adapter vigente, e os testes já usam dublês dessa porta. O remetente da plataforma é mais um uso dessa porta, não um caminho de transporte novo.
- **O `EvolutionClient` do BFF só sabe QR, pareamento e status** (`getQr`, `pairInstance`, `getStatus`); quem envia mensagem é a IA, com a projeção cifrada da credencial do vínculo (`ChannelConnection.credentialCipher`). Isso não muda aqui.
- **A agenda já tem as duas operações de que o teste precisa.** `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` expõe `createAppointment` e `cancelAppointment`, e as tools `create_appointment`/`cancel_appointment` já existem em `modules/tools/assistant-tools.ts`. `AppointmentSource` tem `AI`, `USER` e `INTEGRATION`.
- **Contato ignorado já existe e já é respeitado.** `Contact.ignored`/`ignoredAt`/`ignoredBy`/`ignoredSource` estão no schema da IA desde o Goal005, com `PUT /internal/conversations/:id/ignore` e `PUT /v1/conversations/:id/ignore` no BFF. O que **não** existe é ignorar por telefone alguém que ainda não tem conversa.
- **O status já distingue desejado de efetivo, mas só lê.** `apps/bff/src/modules/status/routes.ts` devolve `ai.desiredEnabled`, `ai.effectiveEnabled` e deriva `PENDING`; `GET /v1/dashboard` devolve `capabilities.aiActivationReady` e `capabilities.hoursConfigured`. Nada reconcilia.
- **`syncAi` engole falha de projeção.** Em `apps/bff/src/modules/settings/routes.ts`, `syncAi` captura a falha e registra `warn`; `businessContextProjectedVersion` só avança em sucesso. No caminho de negócio isso vira `PENDING` observável, mas em `PATCH /v1/settings/ai` a resposta continua dizendo `PROJECTED` — é o resíduo nominal do [review018](../reviews/018-review.md).
- **A regra de ativação vigente é uma só.** `PATCH /v1/settings/ai` com `enabled: true` exige `calendar.capabilities.aiActivationReady` e nada mais; concluir o onboarding não toca `AiSettings.enabled`, e existe teste que falha se alguém acoplar as duas coisas. Este Goal **acrescenta** exigência, nunca remove a existente.
- **O onboarding já está decomposto.** `features/onboarding/` tem despachante, casca, runtime, `blocks.ts`, `blocks/registry.ts` e os quatro blocos; `onboardingFlow` é a ordem real, `blockForScenario` lança se um cenário ficar sem bloco, e existe teste de alcance por rota para **cada** cenário declarado. Cenário novo sem caminho no produto quebra essa suíte de propósito.
- **O checklist da Home tem três itens e nenhum produtor para o quarto.** `DashboardScreen` monta serviço operacional, horários configurados e WhatsApp conectado; "teste concluído" ficou fora por não ter fonte.
- **O harness recusa o banco que ele mesmo provisiona.** `databaseNameForEnv` em `tools/ia-loop/lib/temporary-postgres.mjs` devolve `ia_bff` para `BFF_TEST_DATABASE_URL`, e `scripts/validate-integration.mjs` recusa nome sem `test` como palavra delimitada (`DISPOSABLE_NAME = /(?:^|[_-])test(?:[_-]|$)/iu`), de propósito, para nunca cair em banco compartilhado ou de produto. A correção foi vista no diff da rodada 1 do Goal018 e **não** foi integrada.

## Pontos de implementação

`apps/ai-orchestrator/prisma/schema.prisma` e `apps/ai-orchestrator/prisma/migrations/`, `apps/ai-orchestrator/src/config/` (configuração da instância da plataforma), `apps/ai-orchestrator/src/modules/channel/` (porta de envio e adapter da plataforma), `apps/ai-orchestrator/src/modules/activation-test/` (novo — execução, estados, cliente simulado, limpeza), `apps/ai-orchestrator/src/modules/internal/routes.ts`, `apps/ai-orchestrator/src/modules/scheduling-service/client.ts` (só se faltar operação), `apps/ai-orchestrator/tests/`, `apps/bff/src/modules/` (rotas públicas do teste, em módulo próprio ou no de settings), `apps/bff/src/modules/status/routes.ts`, `apps/bff/src/modules/settings/routes.ts`, `apps/bff/src/modules/dashboard/routes.ts`, `apps/bff/src/modules/conversations/routes.ts` (ignorar por telefone), `apps/bff/src/clients/ai-orchestrator/index.ts`, `apps/bff/src/lib/errors.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `apps/frontend/src/data/mappers/publicApiSchemas.ts`, `apps/frontend/src/data/services/` (serviços de onboarding/status/conversas), `apps/frontend/src/features/onboarding/` (blocos "Sua IA" e "WhatsApp"), `apps/frontend/src/features/dashboard/DashboardScreen.tsx`, `apps/frontend/src/shared/runtime/systemStatus.tsx`, `apps/frontend/src/shared/styles/`, `apps/frontend/tests/`, os `.env.example` afetados pela configuração nova e — **declarado, e só isto** — `tools/ia-loop/lib/temporary-postgres.mjs` com `tools/ia-loop/tests/test-databases.test.mjs`.

## Escopo obrigatório

### 1. O número da plataforma é configuração e porta, nunca um tenant

A instância oficial da Atendly entra como **configuração do serviço** (instância, credencial e número, em `.env.example` com valor de exemplo e sem segredo real), lida por um resolvedor próprio. Invariantes, todas com teste:

- a credencial da plataforma **nunca** é alcançável pelo caminho que resolve credencial de negócio, e o caminho de negócio nunca cai na credencial da plataforma quando o vínculo do tenant falta — ausência de vínculo continua sendo recusa, não fallback;
- a instância da plataforma **não** cria linha em `ChannelConnection`, `WhatsAppInstance` ou equivalente por tenant, e não aparece em nenhuma listagem de conexões de negócio;
- o remetente da plataforma só envia para o número do tenant que está executando um teste; ele não é um caminho genérico de envio.

**Sem configuração, o produto recusa o teste real com código próprio** (`PLATFORM_NUMBER_NOT_CONFIGURED`), com copy que diz que o teste não está disponível. Ele **não** cai na demonstração, não simula progresso e não afirma que a IA foi testada. Essa recusa é o que torna a distinção exigida pelo G-25 verificável neste ambiente, e é o mesmo padrão do gate M4 do Goal010.

### 2. A demonstração da IA, simulada e declarada como tal

Um passo novo no bloco "Sua IA", **antes** do estilo, conforme a seção 7 do [Onboarding](../../product-vault/02-Fluxos/01-Onboarding.md): conversa curta com os eventos discretos do vault (cliente identificado, serviço reconhecido, agenda consultada, horário encontrado, agendamento simulado).

- **Usa dados reais do negócio**: nome, serviço operacional e preço vindos do catálogo, horário vindo da disponibilidade real. Se não houver serviço operacional ou horário válido, a demonstração **não** é oferecida e a tela diz o que falta — nada é inventado para preencher a cena.
- **Não toca transporte e não escreve**: nenhuma mensagem sai por provider algum, nenhuma linha é criada em `Appointment`, `Customer`, `Conversation` ou `Message`. O "agendamento simulado" é rotulado como simulado em tela.
- A distinção demonstração × teste real é **provada por teste**, não afirmada por copy: rodar a demonstração não chama a porta de envio e não chama a escrita da agenda; iniciar o teste real chama as duas (contra dublê).

### 3. Contatos ignorados, entre conectar e testar

Etapa **opcional**, oferecida depois da conexão e antes do teste, exatamente como o vault posiciona. Reusa `Contact.ignored`: nenhuma marcação nova de "ignorado" é inventada.

- lista contatos/conversas que já existem e permite marcar;
- permite informar telefone manualmente — caminho novo, porque quem ainda não conversou não tem conversa: ignorar **por telefone** normalizado, criando o contato ignorado se ele não existir, com `ignoredSource` que distingue essa origem;
- pular a etapa não bloqueia nada; nenhuma tela afirma que alguém foi ignorado sem que a marcação tenha sido gravada.

### 4. O teste real tem dono, estados e progresso derivado de fato

A execução do teste é **entidade persistida na IA** (`ActivationTestRun` ou nome equivalente), por tenant, com migration aditiva. Ela guarda, no mínimo: estado, instante de cada passo alcançado, IDs do que criou, motivo da falha e número de tentativas.

- **Estados terminais e não terminais são distintos e explícitos.** Uma execução em andamento, uma pausada por interferência, uma que falhou e uma que teve sucesso não podem ser o mesmo valor com interpretações diferentes na tela.
- **O caminho feliz é o do vault, na ordem do vault:** aviso separado ("Esta é uma conversa de teste da Atendly."), depois o cliente simulado pergunta preço de um serviço apto, pede o próximo horário, a IA consulta a agenda, o cliente aceita, a IA confirma, o agendamento é criado **de verdade**, o teste valida e os dados de teste são removidos.
- **O serviço é escolhido pelo sistema**, preferindo um que permita agendamento normal. **Sem disponibilidade válida o teste não inicia** — recusa com código próprio e copy que manda corrigir a agenda, nunca um teste que começa para falhar depois.
- **Progresso é derivado de fato observado** — mensagem gravada, tool call registrada, agendamento criado —, nunca de temporizador, animação ou texto fixo. Os seis marcos do vault (mensagem enviada, serviço identificado, preço informado, agenda consultada, horário selecionado, agendamento confirmado) são legíveis um a um. Marco sem fonte não é exibido como concluído. É a mesma regra que o Goal018 aplicou ao remover a tela `validacao`.
- **A execução não depende da tela.** Fechar o navegador não cancela nem invalida a execução; reabrir mostra o estado corrente lido do servidor.
- Só existe **uma** execução viva por tenant: iniciar com outra em andamento não cria a segunda.

### 5. Interferência, falha e nova tentativa

- **Interferência humana pausa.** Se a pessoa responder manualmente à conversa de teste, a execução vai para pausada, a tela explica que ela deve apenas observar e oferece `Reiniciar teste`. A detecção usa o que o sistema já sabe distinguir — mensagem de origem humana na conversa de teste —, não heurística de texto.
- **Falha transitória pode gerar nova tentativa automática, com limite declarado no código e observável na execução.** Esgotado o limite, a execução falha, **a IA não é ativada**, a tela nomeia o passo que falhou em linguagem do negócio e oferece tentar de novo.
- Nenhum caminho de falha vira `500` para o consumidor: falhar o teste é resultado, não erro de servidor.

### 6. Remoção dos dados de teste

A regra vale mais do que a conveniência: **remove-se exatamente o que a execução criou, pelos IDs que ela gravou no momento da criação.** Nunca por busca por telefone, nome, data ou padrão. Uma linha que a execução não criou não é tocada, nem que pareça de teste.

- O agendamento de teste e a pessoa de teste saem da agenda e da lista de clientes do negócio, provado por leitura dos read models depois da limpeza.
- Se alguma remoção não for possível com as operações que existem, a execução **registra o resíduo** e a tela diz o que ficou. Limpeza parcial relatada como completa é falha de aceite.
- A limpeza é idempotente: repetir não apaga nada além do já apagado nem falha.

### 7. Autoativação e reconciliação desired/effective

- **Sucesso ativa a IA**, e só sucesso. A ativação passa **pela mesma regra vigente** de `PATCH /v1/settings/ai` (ao menos um serviço operacional) — este Goal acrescenta a exigência do teste, não substitui nem contorna a existente. Nenhum outro caminho ganha ativação automática.
- A ativação é **idempotente**: reconciliar duas vezes a mesma execução bem-sucedida não gera duas ativações nem dois efeitos colaterais.
- **Reconciliação desired/effective**, prevista em D-010: quando o BFF observa divergência entre o que o negócio pediu e o que a IA aplicou, ele **tenta convergir**, de forma limitada e idempotente, em vez de apenas relatar `PENDING`. A reconciliação não pode transformar leitura em efeito surpreendente: é bounded (no máximo uma tentativa por requisição), nunca lança para o consumidor, nunca entra em laço e sempre deixa um estado honesto legível.
- **Resíduo nominal do review018:** `PATCH /v1/settings/ai` deixa de responder `contextProjectionStatus: PROJECTED` quando a projeção falhou. A resposta continua sendo sucesso — o dado do BFF foi gravado —, mas o estado de projeção é o real.
- **Novo teste é exigido ao trocar/revincular o WhatsApp**, como diz o vault. Testar não vira ferramenta recorrente nas configurações.

### 8. Contrato público

`apps/bff/PUBLIC_API_V1.md` documenta as rotas novas, o formato do progresso, cada estado da execução e **cada código de recusa** com significado e caminho de resolução — `PLATFORM_NUMBER_NOT_CONFIGURED`, WhatsApp não conectado, sem disponibilidade, execução já em andamento, IA já ativa. É o mesmo padrão que o Goal017 aplicou às recusas de sugestão e o Goal018 aos códigos de pendência do onboarding. Nenhum código vive só no código.

### 9. Frontend: as telas do teste e o checklist completo

- Telas do bloco "WhatsApp", na ordem do vault: explicação antes do teste com a copy do vault e CTA `Iniciar teste`; progresso com os seis marcos; interferência; falha com o passo nomeado e nova tentativa; sucesso com "Tudo pronto!" e CTA `Ir para o início`.
- Toda tela lê estado real do servidor. Nenhuma afirma ativação, envio, agendamento ou limpeza que não tenha vindo de leitura.
- Cada cenário novo entra em `blocks.ts` com bloco e posição, e continua alcançável pelo fluxo — a suíte de alcance por rota do Goal018 continua verde sem ser afrouxada.
- O checklist de `/inicio` ganha **"teste concluído"**, agora com produtor real, mantendo o que o Goal018 estabeleceu: item concluído marcado, bloco some quando a IA está efetivamente ativa, nada aparece durante o carregamento.
- Continua existindo **um** poller de `GET /v1/status` por árvore renderizada. O progresso do teste tem a sua própria leitura, com intervalo próprio, e ela termina quando a execução chega a estado terminal — não fica consultando para sempre.

### 10. A correção declarada do harness

`databaseNameForEnv` passa a produzir nome reconhecido como descartável pelo `validate:integration` (contendo `test` como palavra delimitada), com teste em `tools/ia-loop/tests/test-databases.test.mjs` que falha se o nome voltar a não conter `test`. É a única mudança autorizada fora de `apps/` e `docs/`, e ela é declarada aqui justamente porque já foi corrigida uma vez fora de escopo e se perdeu.

### 11. Provas

Teste que não falharia se o comportamento fosse removido **não conta como prova** — foi por isso que a rodada 2 do Goal018 foi recusada, com o comportamento já correto no código de produção. Cada invariante deste Goal precisa de teste sensível a reversão, em especial: isolamento da credencial da plataforma; recusa honesta sem configuração; demonstração que não envia e não escreve; progresso derivado de fato; limpeza pelos IDs gravados; autoativação só por sucesso e sempre pela regra vigente; idempotência da reconciliação.

Há migration (na IA), então `validate:integration` é exigido e tem de **rodar de verdade**, com output no relatório.

### 12. Documentação

Atualizar apenas o que a mudança faz mentir: `apps/bff/PUBLIC_API_V1.md`, `docs/migration/CURRENT_STATE.md`, `docs/migration/GAP_ANALYSIS.md` (G-25, G-26) e `docs/migration/REUSE_ANALYSIS.md`. Não tocar documento de fechamento, review, MASTER_PLAN, MIGRATION_STATUS nem DECISIONS — esses são do fechamento, feito por quem revisa.

## Migração, compatibilidade e limites operacionais

- **Há migration de banco, na IA, e ela é aditiva.** Tabela nova para a execução do teste; nenhuma coluna existente muda de significado e nenhum backfill fabrica execução para tenant que nunca testou. Tenant sem execução é "nunca testou", não "falhou".
- **Compatibilidade do contrato interno.** `AiTenantConfig` e as rotas `/internal/**` vigentes continuam válidas; o que entra é aditivo.
- **Nenhuma remoção de comportamento existente.** A regra de ativação vigente permanece; este Goal soma exigência e caminhos novos.
- **Sem transporte real.** Nenhum WhatsApp real, nenhum número da plataforma real, nenhum modelo real e nenhuma CI hospedada são exercitados. O caminho do teste real é provado de ponta a ponta **contra dublê da porta de envio** e contra PostgreSQL descartável. O que este Goal **não** prova é que o envio real funciona — isso é gate operacional, declarado, na mesma classe do M4 do Goal010.
- **Larguras em rota autenticada continuam fora.** O gate renderizado cobre só rotas públicas; onboarding e Home exigem sessão. Estender o Playwright a rota autenticada continua sendo decisão de escopo própria, não tomada aqui.

## Testes e critérios de aceite

1. Migration aditiva aplicada em banco descartável recriado do zero; tenant existente continua sem execução de teste e sem estado fabricado.
2. A credencial da plataforma não é alcançável pelo caminho que resolve credencial de negócio, e vínculo de negócio ausente continua sendo recusa, nunca fallback para a plataforma — provado por teste que falha se os caminhos forem fundidos.
3. A instância da plataforma não aparece como conexão de nenhum tenant em nenhuma listagem ou leitura de status.
4. Sem número da plataforma configurado, iniciar o teste é recusado com `PLATFORM_NUMBER_NOT_CONFIGURED`, a tela diz que o teste não está disponível e **nenhum** progresso, ativação ou sucesso é apresentado.
5. A demonstração roda sem chamar a porta de envio e sem escrever em agenda, cliente, conversa ou mensagem; o teste real chama as duas contra dublê. O teste falha se a demonstração passar a enviar ou escrever.
6. A demonstração usa serviço, preço e horário reais; sem serviço operacional ou sem horário válido ela não é oferecida e a tela diz o que falta.
7. A etapa de contatos ignorados marca contato existente e marca por telefone informado manualmente, criando o contato ignorado quando ele não existe, com origem distinguível; pular não bloqueia o fluxo.
8. Contato marcado como ignorado nesta etapa é respeitado pelo mesmo caminho já existente — a IA não responde —, sem regra nova paralela.
9. O teste não inicia sem WhatsApp conectado nem sem disponibilidade válida, cada recusa com o seu código, e nenhuma delas vira `500`.
10. Existe no máximo uma execução viva por tenant; iniciar com uma em andamento não cria a segunda.
11. Os seis marcos do vault são legíveis um a um e cada um deriva de fato gravado; nenhum marco é marcado como concluído por tempo decorrido. O teste falha se um marco passar a ser afirmado sem fonte.
12. Interferência humana na conversa de teste leva a execução a pausada, com a explicação e a opção de reiniciar.
13. Falha transitória gera nova tentativa até um limite declarado; esgotado o limite a execução falha, a IA **não** é ativada e o passo que falhou é nomeado.
14. A limpeza remove exatamente o que a execução criou, pelos IDs gravados; uma linha preexistente semelhante ao dado de teste **não** é removida — provado por teste que falha se a remoção passar a buscar por telefone, nome ou data.
15. Depois da limpeza, agendamento e pessoa de teste não aparecem na agenda nem na lista de clientes do negócio; limpeza parcial é relatada como resíduo, nunca como sucesso.
16. Repetir a limpeza é idempotente: não apaga mais nada e não falha.
17. Execução bem-sucedida ativa a IA; execução em qualquer outro estado não ativa. Reconciliar a mesma execução duas vezes não duplica ativação nem efeito.
18. A ativação automática passa pela regra vigente de serviço operacional: sem serviço operacional a IA não é ativada nem por teste bem-sucedido.
19. A reconciliação desired/effective é limitada e idempotente, não lança para o consumidor, não entra em laço e deixa estado honesto legível em `GET /v1/status`.
20. `PATCH /v1/settings/ai` com projeção falha responde sucesso com o estado de projeção real, não `PROJECTED` — o teste falha se a resposta voltar a afirmar projeção que não aconteceu.
21. Trocar ou revincular o WhatsApp volta a exigir teste, e o estado de "testado" não sobrevive à troca.
22. `PUBLIC_API_V1.md` nomeia as rotas, os estados e **todos** os códigos de recusa, cada um com significado e caminho de resolução; nenhum código existe só no código.
23. Cada cenário novo do onboarding é alcançável pelo fluxo do produto, provado pela suíte de alcance por rota do Goal018, sem afrouxá-la; nenhum componente novo fica sem importador.
24. O checklist de `/inicio` mostra os quatro itens, "teste concluído" derivado de leitura real, item concluído marcado, e some quando a IA está efetivamente ativa.
25. Continua existindo **um** poller de `GET /v1/status` por árvore renderizada, provado por render dentro do shell real; a leitura de progresso do teste para em estado terminal.
26. Nenhuma tela afirma envio, agendamento, limpeza ou ativação sem leitura real por trás.
27. Suíte de acessibilidade com axe verde nas telas novas em jsdom.
28. `databaseNameForEnv` produz nome aceito pelo `validate:integration`, com teste que falha se `test` sumir do nome.
29. `npx tsc --noEmit` limpo em `apps/frontend`, em `apps/bff` e em `apps/ai-orchestrator`.
30. `npm run lint` em `apps/frontend` cobre `src` e `tests` com `--max-warnings=0` e sai limpo, sem regra afrouxada.
31. `npm run test:ia-loop` exit 0.
32. `npm run validate:core` exit 0, com os skips já declarados do Goal002 e nenhum novo.
33. `npm run validate:integration` exit 0 contra PostgreSQL descartável, com a migration nova aplicada — executado de verdade, com output no relatório.
34. `npm run validate:ui` exit 0 — continua cobrindo apenas as rotas públicas, e **nenhum critério deste Goal declara largura, contraste, foco ou estado de tela autenticada como provado por teste**.
35. `git diff --check` exit 0.

Fidelidade visual à referência aprovada **não** é provada por teste nenhum e continua sendo conferência humana.

## Entrega

Diff sobre a baseline aceita, com relatório do que foi entregue, o que foi provado e como, e o que ficou fora com o motivo. Nenhum commit, merge ou deploy é feito pelo executor. Componente sem importador conta como não entregue. Gate vermelho não é entrega: se um passo determinístico falhar, isso vai no relatório com o output, não é omitido.
