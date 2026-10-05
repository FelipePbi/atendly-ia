# Goal 117 — A Home igual ao protótipo nas pendências, no checklist e na pausa da IA

**Status: ACCEPTED.** Preparado em 2026-10-05 pelo Tech Lead Agent após [Goal116 ACCEPTED](../reviews/116-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Quadros do protótipo: H2, H4, H5, H7

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v141**, inserida depois do 116, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID da v137, que pôs Conversas primeiro; com o K5 aceito, o módulo de Conversas não tem mais quadro sem alvo, e a Home é a próxima superfície de uso diário.

## Baseline aceita

Baseline aceita: `cf6704c28bdc7b015d9d16b5862c08f8a8faae5a`

Goal anterior: 116 — O cliente no chat igual ao protótipo, com o controle de como a IA trata o contato

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal116 já integrado em `main` (origem `07e79c2b51aeaea77aca35300054a0a02e9bf1bf`). Foram **três rodadas**, com 4, 4 e 2 blockers; os 2 da rodada 3 eram só de registro e foram aplicados no fechamento. **D-130** foi aceita: o nome do chat e "Ver contato" abrem a folha do cliente do K5 na casca `ChatSheetShell`; a conversa traz `contactCategory`, só de leitura; o controle "Como a IA trata este contato" grava pelas rotas de hoje; e assumir, criar agendamento e resolver ficam na seção "Nesta conversa". A última contagem aceita: frontend **159** arquivos e **2013** testes, `test:gate` **257**, `visual-responses.test.mjs` **24**, `validate:ui` **169** `passed`, `validate:integration` **36** de 36 passos e **275** testes no gate autenticado. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a Home fica igual aos quadros H2, H4, H5 e H7 nos quatro devices** (mobile 402×812, tablet em retrato 768×1024, tablet em paisagem 1024×768 e desktop 1366×768), **e "Pausar" e "Reativar" ligam e desligam a IA a partir da própria Home, com a confirmação do H7**.

**Por que agora.** A fila não tem Goal PLANNED. A conferência de `e2e/visual/targets.json` contra o inventário na baseline `cf6704c` mostra 62 alvos e **51 quadros sem alvo**. Nenhum é de Conversas. A Home é a primeira tela depois do login e tem só H1 e H3 com alvo. H2 (pendências), H4 (checklist), H5 (IA pausada) e H7 (confirmação de pausa) usam leituras e gravações que já existem, salvo a hora da pausa. O H6 (IA com instabilidade) fica fora: veja "Fora do escopo".

## O que a evidência desta passada mostra

Conferido no código da baseline `cf6704c`, nos quadros (`Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`), no contrato e no vault.

1. **H2, "Precisa da sua atenção".** Faixa "IA ativa" com "Pausar". Cartão de pendências com três linhas: "Fernanda Lima pediu para falar com você · Aguardando há 12 min", "Marcos Vieira pediu desconto · A IA não negocia preço · há 34 min" e "Design de sobrancelha está sem duração · A IA não consegue marcar esse serviço" com a ação "Corrigir". Abaixo, "Hoje · 3 restantes", só com os atendimentos que ainda vêm. A nota do quadro: "Pendências em tom de atenção, ordenadas por gravidade e tempo, cada uma com o motivo em linguagem simples. A agenda de hoje desce, mas continua visível." O "· 3 restantes" aparece igual no tablet e no desktop.
2. **A Home de hoje não é o H2.** `DashboardScreen.tsx` mostra o cartão "Precisa da sua atenção" com um selo de contagem e linhas com o nome e `lastMessage.body` ou `handoffReason` cru. Não mostra serviço em revisão, não mostra tempo de espera e não troca "Hoje" para os restantes. `conversationState.ts` já traduz o estado (`waiting-you`, `ai-unstable`) e o motivo (`handoffReasonCopy`, `waitingNoticeCopy`), como a lista do C1 faz.
3. **Serviço sem duração já tem leitura.** `GET /v1/services` traz `needsReview: true` quando falta `durationMinutes`, e o serviço em revisão não entra no que a IA oferece (`PUBLIC_API_V1.md`, parágrafo de `durationMinutes` e `needsReview`).
4. **H4, configuração incompleta.** Faixa "IA inativa · Falta conectar o WhatsApp e fazer o teste"; cartão "Ative sua IA · 2 de 4 passos concluídos"; os itens "Cadastrar um serviço", "Definir horários de atendimento", "Conectar o WhatsApp" (com a única ação viva, "Conectar") e "Fazer o teste real depois do WhatsApp"; "Hoje" vazio com "Nenhum atendimento hoje." e "Criar agendamento". Hoje o checklist existe (`buildChecklistItems`, `PostOnboardingChecklist`), com o item "Concluir o teste da IA" e a dica "depois do WhatsApp", e a faixa diz "Termine a configuração abaixo para a IA responder no WhatsApp."
5. **H5, IA pausada.** Faixa "IA pausada · Desde 09:12. As conversas continuam chegando; ninguém recebe resposta automática." com "Reativar". A nota do quadro chama a hora da pausa de parte do desenho e "Reativar" de "a única ação forte da tela". Hoje a faixa "IA pausada" não tem ação nem hora.
6. **A hora da pausa não existe.** `AiSettings` (BFF) guarda `enabled`, `tone`, `activatedByRunId`, `createdAt` e `updatedAt`. `updatedAt` muda também ao salvar o estilo, então não é a hora da pausa. Pausar não cria notificação (`PUBLIC_API_V1.md`, `AI_ACTIVATED`).
7. **Quem grava `AiSettings.enabled`.** `PATCH /v1/settings/ai` (`apps/bff/src/modules/settings/routes.ts`, ligar e desligar); a autoativação e o desligamento por troca de canal (`apps/bff/src/lib/ai-activation.ts`); a exclusão de conta (`apps/bff/src/modules/account/service.ts`). As outras escritas (onboarding, WhatsApp, `create` do cadastro) não mudam `enabled` de uma linha existente.
8. **H7, confirmação de pausa.** Sobre a Home escurecida: "Pausar sua IA?", "Enquanto estiver pausada, seus clientes não recebem respostas automáticas. As conversas continuam chegando normalmente e você reativa quando quiser.", "Pausar IA" (botão em tinta, não em vermelho) e "Continuar atendendo". No desktop é um diálogo de 440 px. Hoje "Pausar" na faixa é um link para `/configuracoes/ia`, onde `AiSettings.tsx` pausa com outro diálogo.
9. **Pausar e retomar já existem.** `AiSettings.tsx` grava `PATCH /v1/settings/ai` com `{ enabled, tone }` e o estilo **lido**. Ligar exige prova válida do teste real, e a recusa é `409 AI_ACTIVATION_TEST_REQUIRED`, que a tela trata relendo o estado (`refusedForMissingTest`).
10. **O `visual:compare` serve respostas fixas de `GET` pelo caminho exato** (D-118 (a), D-127 (7)) e executa `steps` (como `clickRole` no K5). H1 e H3 usam o estado real da conta de teste, sem `responses`.

## Escolhas de desenho desta passada

1. **A hora da pausa vira dado.** `AiSettings.pausedAt`, coluna nova e aditiva, anulável, sem default e sem backfill, no BFF. A regra:
   - `PATCH /v1/settings/ai` na passagem ligada → desligada grava `pausedAt` com o instante da gravação.
   - Toda outra escrita que **muda** `enabled` grava `pausedAt: null`: `PATCH` desligada → ligada, a autoativação, o desligamento por troca de canal e a exclusão de conta.
   - Escrita que não muda `enabled` (salvar só o estilo, onboarding, WhatsApp) não toca `pausedAt`.
   - `GET /v1/settings` e a resposta de `PATCH /v1/settings/ai` trazem `ai.pausedAt` (ISO ou `null`), opcional e anulável no contrato. Resposta antiga, sem o campo, continua válida.
   Quem desligou por troca de canal ou por exclusão não pausou: `pausedAt` nulo é o certo nesses casos.
2. **As pendências do H2.** O cartão lista, nesta ordem: as conversas `ai-unstable`, as conversas `waiting-you` na ordem em que `conversationsNeedingAttention` já chega, e os serviços com `needsReview` de `GET /v1/services`.
   - Linha de conversa: o nome (ou o telefone formatado) e o motivo traduzido de hoje (`handoffReasonCopy`/`waitingNoticeCopy`) na primeira linha; na segunda, "Aguardando há {tempo}" para `waiting-you` e "A IA não conseguiu responder · há {tempo}" para `ai-unstable`. O tempo vem da mesma fonte que a lista do C1 usa (`formatWaitingTime` sobre `updatedAt`, em `ConversationRow.tsx`). Nada de frase inventada: sem motivo, só o nome.
   - Linha de serviço: "{nome} está sem duração", "A IA não consegue marcar esse serviço" e "Corrigir", que abre a edição do serviço.
   - Com o cartão na tela, "Hoje" mostra "· {n} restantes" e só os atendimentos de hoje que ainda não começaram pelo relógio do negócio. Sem pendências, "Hoje" fica como no H1.
   - A falha de `GET /v1/services` não esconde as conversas nem a agenda; só some a linha de serviço.
3. **O checklist do H4.** Os quatro itens com os rótulos do quadro, "{n} de 4 passos concluídos", e só o primeiro item pendente com ação. A faixa "IA inativa" diz o que falta a partir dos itens pendentes ("Falta conectar o WhatsApp e fazer o teste"). "Hoje" vazio mostra "Nenhum atendimento hoje." e "Criar agendamento" (`/agenda/novo`). As regras de quando o checklist aparece e some não mudam.
4. **A faixa do H5.** "IA pausada", "Desde {HH:MM}." quando `pausedAt` é de hoje no fuso do negócio, "Desde {dd/mm}, {HH:MM}." quando é de outro dia, e nada quando é `null`; depois a frase de hoje e o botão "Reativar". "Reativar" grava `PATCH /v1/settings/ai` com `{ enabled: true, tone }` e o estilo lido; enquanto grava, fica desabilitado. A recusa `409 AI_ACTIVATION_TEST_REQUIRED` mostra "A IA só liga depois de um teste real que terminou bem." e o link "Fazer o teste" para `/configuracoes/ia#teste-real`; outra falha mostra "Não foi possível reativar a IA." com `role="alert"`. Depois de gravar, a Home relê o status e o painel.
5. **A confirmação do H7.** "Pausar" na faixa "IA ativa" vira botão e abre a confirmação do quadro. Nada é gravado antes de "Pausar IA". "Pausar IA" grava `PATCH /v1/settings/ai` com `{ enabled: false, tone }` e o estilo lido; "Continuar atendendo", `Escape` e o escurecido fecham sem gravar. A falha fica na confirmação com `role="alert"`. A casca é a do quadro (folha de baixo abaixo de 768 px, diálogo centrado a partir daí, com a largura que cada quadro desenha). O Developer pode reusar `ChatSheetShell`, movendo-o para `shared/` se precisar, desde que K5 e K6 continuem iguais à captura de antes.
6. **Configurações › IA não muda.** O diálogo "Pausar atendimento automático?" de `AiSettings.tsx` e o alvo IA1 ficam como estão.
7. **Decisão.** O Developer propõe **D-131**, por acréscimo, depois das provas: `pausedAt` e a regra das escritas, a ordem e o texto das pendências, os restantes de "Hoje", o checklist e a frase do que falta, "Reativar" e a confirmação de pausa na Home, e as divergências.

## Escopo obrigatório

### 1. A hora da pausa (BFF e contrato)

1. `apps/bff/prisma/schema.prisma` e uma migration nova em `apps/bff/prisma/migrations/` com `pausedAt` em `AiSettings`.
2. As escritas da escolha 1 em `settings/routes.ts`, `lib/ai-activation.ts` e `account/service.ts`.
3. `settingsStateSchema` em `packages/public-api-contract/src/schemas.ts` com `ai.pausedAt` opcional e anulável; o BFF o devolve em `GET /v1/settings` e em `PATCH /v1/settings/ai`.
4. `apps/bff/PUBLIC_API_V1.md`: o campo e a regra.
5. Provas, com teste que reprova sem a mudança: pausar grava `pausedAt`; salvar só o estilo com a IA pausada mantém o valor; ligar à mão, a autoativação, o desligamento por troca de canal e a exclusão de conta gravam `null`. Os testes que precisam de banco rodam em `validate:integration`; teste de integração que cria e derruba banco próprio passa timeout de hook explícito (observação 2 do review116).
6. Antes de fechar, o Developer confere se algum ensaio ou teste aplica só parte do histórico de migrations do BFF e precisa conhecer a coluna nova, e registra o que achou.

### 2. A Home (`apps/frontend`)

1. O Developer **porta** o HTML/CSS dos quadros H2, H4, H5 e H7, de `Home.dc.html`, `Home-Tablet.dc.html` e `Home-Desktop.dc.html`: cartão de pendências e suas linhas, checklist, faixa pausada com "Reativar", confirmação de pausa, com os valores inline de px, cor, fonte e raio, e o movimento parado com `prefers-reduced-motion`. As medidas do protótipo são `content-box` (D-127 (8)). Nada de reinterpretar o layout.
2. As regras das escolhas 2 a 5. A Home lê `GET /v1/settings` para `tone` e `pausedAt`; a falha dessa leitura não derruba a Home, e só desabilita "Pausar" e "Reativar" com uma mensagem.
3. Acessibilidade: a confirmação tem nome acessível, foco preso, `Escape` fecha e o foco volta a "Pausar"; alvos de toque de no mínimo 44 px; o estado de cada linha tem texto, não só cor.
4. `apps/frontend/e2e/visual/targets.json`: entram **H2**, **H4**, **H5** e **H7**, com `route` `/inicio`, `clock`, e `responses` de `GET` para o que cada quadro lê (`/v1/dashboard`, `/v1/status`, `/v1/settings`, `/v1/services` e o que mais a Home pedir); H7 com `steps` que tocam "Pausar". Os dados das respostas reproduzem os quadros. Tudo nos limites de D-127 (7): só `GET`, caminho exato, nenhuma capacidade nova no `visual:compare`.
5. `scripts/tests/visual-responses.test.mjs` passa a exigir os quatro alvos.

### 3. O que já valia continua valendo

1. H1 e H3 continuam iguais à captura de antes. K5 e K6 também, se `ChatSheetShell` mudar de lugar.
2. Configurações › IA (IA1), a casca, a barra de navegação e as Notificações não mudam.
3. As regras de prioridade da faixa (`resolveOperationalState`: agenda indisponível, WhatsApp desligado, WhatsApp não confirmado, dados da IA indisponíveis, em ativação, não confirmada, verificando, pausada ou inativa, ativa) não mudam; só o texto e as ações dos estados desta passada.
4. O gate autenticado (`e2e/authenticated-matrix.spec.ts`) não muda. Nenhum arquivo de `e2e/` além de `e2e/visual/targets.json` muda. Se o gate reprovar pela mudança, o Developer para e registra; não ajusta o gate sem autorização no review.

### 4. Provas do frontend

1. Testes novos em `apps/frontend/tests/goal117-*.test.tsx`, com:
   - a ordem das pendências, a linha de conversa por estado com o motivo e o tempo, a linha de serviço com "Corrigir", e a falha de `GET /v1/services` sem esconder o resto;
   - "· {n} restantes" e a lista de "Hoje" com e sem pendências;
   - os rótulos do checklist, "{n} de 4 passos concluídos", a ação só no primeiro pendente e a frase do que falta;
   - "Desde" de hoje, de outro dia e ausente;
   - "Reativar" gravando `{ enabled: true, tone }` com o estilo lido, a recusa `AI_ACTIVATION_TEST_REQUIRED` com o link do teste e a falha genérica;
   - "Pausar" abrindo a confirmação sem gravar, "Pausar IA" gravando `{ enabled: false, tone }`, "Continuar atendendo" e `Escape` sem gravar, a falha na confirmação e o foco de volta.
2. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) no BFF, a passagem ligada → desligada sem gravar `pausedAt` faz um teste reprovar;
   - (b) no BFF, a autoativação sem limpar `pausedAt` faz um teste reprovar;
   - (c) no frontend, "Pausar" gravando no toque, sem a confirmação, faz um teste reprovar.
   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
3. Os testes da Home existentes (`goal018-dashboard-status`, `goal063-home-checklist`, `goal074-home` e outros que leiam a Home) continuam passando. Teste que dependa de rótulo ou ação que muda nesta passada pode ser ajustado só para o novo texto ou o novo lugar, sem afrouxar a asserção. Cada ajuste é listado no relatório.

## Divergências declaradas

Não contam como defeito na comparação de H2, H4, H5 e H7:

1. A barra de status e o indicador de início do iPhone nos quadros mobile.
2. O nome e as iniciais do negócio da conta visual, e a casca, como em D-127 a D-130.
3. A data por extenso e os dias calculados de `{today}`; a saudação pela regra de hoje (`homeGreeting`) e o `clock` do alvo.
4. As palavras do motivo nas linhas de conversa do H2, quando a tradução de hoje (`handoffReasonCopy`/`waitingNoticeCopy`) não produz a frase exata do quadro. Ordem, layout, cor, tamanho e a segunda linha seguem o quadro.

Qualquer outra diferença visível é blocker.

## Fora do escopo

- **H6, IA com instabilidade.** Não existe sinal global de instabilidade: o estado `ai-unstable` é por conversa, lido do motivo do handoff, e a nota do quadro pede uma faixa que "volta sozinha ao estado ativo" quando a IA se recupera. Isso pede uma leitura própria antes de virar Goal.
- NT2, NT3, Configurações › IA, a central de Notificações, a casca e a barra de navegação.
- Qualquer mudança na regra de ligar a IA (prova do teste real, `activatedByRunId`, reconciliação, exclusão), além de gravar `pausedAt` nas escritas da escolha 1.
- `{today+N}` ou qualquer outra mudança no `visual:compare` além de `targets.json` e do teste de `scripts/tests/visual-responses.test.mjs`.
- A IA, o Scheduling e as rotas de conversas e de serviços.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-131** em `PROPOSED`, conforme a escolha 7. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal117.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal117, com as contagens da execução final, os controles negativos e a lista das capturas do `visual:compare` conferidas.
- `docs/migration/DATA_MIGRATION.md`: a coluna nova, por que é aditiva e sem backfill, e o rollback (a coluna pode ser removida sem perda de regra; só a hora mostrada some).

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Antes de editar: subir uma pilha própria em bancos descartáveis, num cluster PostgreSQL próprio, com `prisma migrate deploy` dos três serviços, e chamar o `visual:compare` com `VISUAL_BFF_URL` e `VISUAL_BFF_ORIGIN` (o BFF de desenvolvimento em `localhost:3002` não responde, observação 4 do review116); rodar `npx prisma generate` em `apps/ai-orchestrator` antes de `test:gate`. Rodar `npm run visual:compare -- --target H1,H3,K5,K6,IA1` na baseline. As capturas de antes ficam fora do repositório. Se o PostgreSQL da pilha cair com o erro 487 do Windows, reiniciar com `pg_ctl` antes de comparar (observação 3 do review116).
2. A hora da pausa, com os testes do §1.
3. `targets.json` com H2, H4, H5 e H7 e o teste de `visual-responses`; `npm run visual:compare -- --target H2,H4,H5,H7` na baseline, para ter o antes.
4. A Home, com os testes novos e os ajustes listados.
5. Controles negativos do §4.2, revertidos.
6. `npm run visual:compare -- --target H2,H4,H5,H7,H1,H3,K5,K6,IA1` e **olhar** as capturas lado a lado (protótipo × app, 4 devices). H2, H4, H5 e H7 têm de ficar iguais aos quadros, salvo as divergências declaradas; H1, H3, K5, K6 e IA1 iguais à captura de antes.
7. Execução final, sobre a árvore completa: typecheck do BFF e do frontend; lint; testes do BFF e do frontend; `test:gate`; `validate:core`; `validate:ui`; `validate:integration` (com `BFF_TEST_DATABASE_URL` num banco descartável e o PostgreSQL de um cluster próprio); `git diff --check`. Com o RTK ligado, lint por `rtk proxy`. Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A Home fica **igual aos quadros H2, H4, H5 e H7 nos 4 devices**, conferido olhando as capturas do `visual:compare`, salvo as divergências declaradas. H1, H3, K5, K6 e IA1 continuam iguais à captura de antes.
2. `pausedAt` é gravado só na passagem ligada → desligada por `PATCH /v1/settings/ai`, fica `null` em toda outra escrita que muda `enabled`, e não muda em escrita que não muda `enabled`. Provado por teste do BFF que reprova sem a mudança.
3. As pendências seguem a ordem e o texto da escolha 2, e "Hoje" mostra os restantes só com pendências. Provado em jsdom.
4. O checklist e a faixa do H4 seguem a escolha 3. Provado em jsdom.
5. "Reativar" e a confirmação de pausa gravam o que dizem, com o estilo lido, nada antes de confirmar, e as falhas com o estado da escolha 4 ou 5. Provado em jsdom.
6. Os três controles negativos reprovam e foram revertidos.
7. `validate:ui` passa nas cinco larguras (360, 390, 768, 1024 e 1440), sem overflow horizontal, com alvo de toque, contraste, foco visível e `prefers-reduced-motion`. `validate:core`, `test:gate` e `validate:integration` passam, com o gate autenticado sem mudança em `e2e/` fora de `targets.json`.
8. Nenhum arquivo fora de `apps/bff/prisma/`, `apps/bff/src/modules/settings/`, `apps/bff/src/lib/ai-activation.ts`, `apps/bff/src/modules/account/service.ts`, `apps/bff/PUBLIC_API_V1.md`, `apps/bff/tests/`, `packages/public-api-contract/src/schemas.ts`, `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `scripts/tests/visual-responses.test.mjs` e dos quatro registros da seção "Documentação" mudou. Ensaio ou teste de integração fora disso que precise da coluna nova (§1.6) só muda com autorização registrada no review.
9. D-131 proposta, com `pausedAt` e a regra das escritas, as pendências, os restantes, o checklist, a pausa e a reativação na Home e as divergências.

## Plano de execução

1. **WU-01 — A hora da pausa.** Migration, escritas, contrato, documentação da API e os testes do §1.
2. **WU-02 — Alvos e medida de antes.** A pilha descartável, as capturas de antes, `targets.json` com H2, H4, H5 e H7 e o teste de `visual-responses`.
3. **WU-03 — A Home.** Pendências, restantes, checklist, faixa pausada com "Reativar", confirmação de pausa, testes novos e ajustes.
4. **WU-04 — Provas e registros.** Controles negativos, `visual:compare` depois, D-131, CURRENT_STATE, VALIDATION_GATE e DATA_MIGRATION.
5. Verificação determinística: typecheck, lint, testes alvo, suíte do frontend, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
