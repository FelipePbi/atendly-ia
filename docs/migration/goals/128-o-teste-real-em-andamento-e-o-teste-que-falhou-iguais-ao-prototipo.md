# Goal 128 — O teste real em andamento e o teste que falhou iguais ao protótipo

**Status: ACCEPTED.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal127 ACCEPTED](../reviews/127-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: 4.7, 4.8

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v152**, inserida depois do 127, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 127. Com 4.9 e 4.10 aceitos, `targets.json` tem 86 alvos, e 27 dos 113 quadros continuam sem alvo. O Goal127 provou o caminho que esta passada usa: uma etapa do teste real alcançada por URL direta pela conta de onboarding, com `GET /v1/activation-test` fixo na captura e um corpo próprio do onboarding em `ActivationTestPanels.tsx`, sem tocar Configurações › IA.

## Baseline aceita

Baseline aceita: `02ba0bff99f14069ef98e2b8768b1d4269f3a07f`

Goal anterior: 127 — As duas conclusões do onboarding iguais ao protótipo: IA ativa e configurada sem WhatsApp

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal127 já integrado em `main` (origem `3ff8468d99a2458e811f6c052f027530f15a14e1`). Houve **uma rodada**: o review DEEP saiu `CHANGES_REQUIRED` com 1 blocker só de documentação, e o IA Loop aceitou a rodada com a correção feita no fechamento, só em `docs/migration/`. **D-141** foi aceita: as duas conclusões do onboarding como os quadros 4.9 e 4.10, com a pílula da IA ativa só quando o status confirma. A última contagem aceita:

- frontend **177** arquivos e **2318** testes, `goal127` **45** (3 arquivos);
- `visual-responses.test.mjs` **55**;
- `test:gate` **288**;
- `validate:core` 17 passos, com 15 passando e 2 pulados;
- `validate:ui` **169** `passed` e 21 pulados, sem retentativa;
- `validate:integration` **36** de 36 passos, com o gate autenticado em **290** e 0 retentativas.

Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **as duas telas do teste real que vêm antes do resultado ficam iguais aos quadros 4.7 e 4.8 nos quatro devices**, salvo as divergências declaradas. A 4.7 é `/onboarding/teste-real-progresso`, enquanto a execução roda. A 4.8 é `/onboarding/teste-real-falha`, depois de uma execução que falha. As duas só mostram o que a leitura de `GET /v1/activation-test` traz. Nenhum pedido ao BFF muda.

**Por que agora.** A fila não tem Goal PLANNED. Dos 27 quadros sem alvo, os que não são do onboarding continuam pedindo outra decisão ou trabalho fora do frontend, pelos motivos da v150 e da v151:

- S1b pede cor livre fora de `colorToken`; S5, S6, S8 e S9, a composição de D-114 e a guarda de navegação;
- CL8 é outra tela; CL9 é o carregamento, e `responses` não sabe atrasar uma resposta (`scripts/lib/visual-responses.mjs` só aceita `method`, `path`, `json` e `status`);
- H6 e NT3 pedem o sinal de IA instável, que o status não tem;
- N2, N3 e W3 pedem dado que o contrato não tem.

No onboarding, 4.3 a 4.5 dependem da conexão do WhatsApp e da leitura dos contatos ignorados (W3), e 2.7 e 2.I2 a 2.I10 pedem horários por dia ou uma sessão de importação. A v151 deixou 4.7 e 4.8 para outra passada porque o quadro mostra o que o contrato não traz por marco. Esta passada conferiu o contrato marco a marco e separou o que ele traz do que não traz (evidência 3). O que falta vira divergência declarada, como a nota de limpeza da 4.9. O resto é porte de tela, no mesmo módulo e com o mesmo tipo de alvo que o Goal127 acabou de provar.

## O que a evidência desta passada mostra

Conferido no código da baseline `02ba0bf`, em `apps/bff/PUBLIC_API_V1.md` (seção do teste real) e em `docs/design-reference/claude-design/prototype/project/Onboarding-3-IA-e-WhatsApp.dc.html` (quadros 4.7 "Teste em andamento" e 4.8 "Teste não concluído"), com `Onboarding-3-IA-e-WhatsApp-Tablet.dc.html` (retrato e paisagem) e `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html`.

1. **4.7 no mobile.**
   - O topo é o das outras etapas: o espaço de 40 px do chevron (vazio), a barra com três segmentos `#0F5F63` e o quarto `#DCECEB` com 86 % preenchido, e o eyebrow "WhatsApp" (12 px 600, `letter-spacing: .08em`, maiúsculas, `#0F5F63`).
   - O cabeçalho: "Teste em andamento" em Literata 28 px 500 e "Acompanhe pelo WhatsApp se quiser. Não responda à conversa de teste." em 15 px `#5F574E`.
   - A linha do tempo, com `padding: 4px 0 0 4px`, tem **sete** linhas. Cada uma tem o marcador de 24 px, o conector de 1,5 × 26 px e o texto em 15 px com `padding-top: 2px` e 14 px de espaço:
     - **concluída**: círculo `#2E7D4F` com ✓ de 13 px `#FFFDFA`, conector `#2E7D4F`, rótulo 600, e uma segunda linha em 13 px (`13:41` em `#716859`; "Corte feminino" e "R$ 90" em `#5F574E`);
     - **atual**: anel de 1,5 px `#0F5F63` com `at-breathe 2.4s`, ponto de 10 px `#0F5F63` no centro, conector `#E5DED4`, rótulo "Consultando agenda" 600 e a segunda linha "próximo horário livre para Corte feminino…";
     - **pendente**: círculo vazado de 1,5 px `#D6CEC2`, conector `#E5DED4`, rótulo 500 `#716859`;
     - a sétima linha, "Limpando dados de teste", pendente e sem conector;
     - as três concluídas entram com `at-reveal .3s` e atrasos de .2, .5 e .8 s; a atual, com 1,1 s.
   - O rodapé, com `padding: 12px 20px 46px` e 10 px de espaço: "Abrir WhatsApp" (52 px, raio 14 px, borda de 1 px `#D6CEC2`, 16 px 600, com o ícone de balão de 18 px) e a nota "Pode sair do app — o teste continua e a tela se atualiza sozinha." em 12 px `#716859`, centrada.
   - A legenda: "Sete etapas visíveis; a atual respira, as concluídas mostram o que foi validado (serviço, preço). Nenhum spinner genérico por três minutos."
2. **4.8 no mobile.** O mesmo topo, com estas diferenças:
   - o cabeçalho: "O teste não foi concluído" e "Sua IA ainda não está ativa. Nada foi enviado aos seus clientes.";
   - a linha do tempo tem cinco linhas, com conector de 22 px e sem animação: três concluídas sem segunda linha; a que falhou, com o círculo `#B3392E`, o ✕ de 13 px `#FFFDFA`, o rótulo "Consultando agenda" e a segunda linha "Não encontramos um horário livre nos próximos dias.", as duas em `#8A2A21`; e uma pendente, "Horário selecionado e confirmação";
   - o cartão "O que você pode fazer" (`padding: 14px 16px`, raio 16 px, fundo `#FFFDFA`, borda de 1 px `#E5DED4`, 6 px de espaço): o título em 13 px 600 `#5F574E` e o texto em 14 px, `line-height: 1.45`;
   - o rodapé empilha "Tentar novamente" (primário, 52 px, `#0F5F63`) **em cima** e "Revisar horários" (secundário, borda `#D6CEC2`) embaixo, com 10 px entre os dois;
   - a legenda: "O erro mantém o contexto: mostra até onde deu certo, o que falhou em linguagem simples e o que fazer. Uma nova tentativa automática já aconteceu antes desta tela."
3. **O que o contrato traz e o que não traz** (`activationTestRunSchema` em `packages/public-api-contract/src/schemas.ts`; `PUBLIC_API_V1.md`).
   - **Traz:** os seis marcos na ordem do vault, cada um com `reached`, `reachedAt`, `sourceKind` e `sourceId`; `state` (`RUNNING`, `PAUSED_BY_HUMAN`, `SUCCEEDED`, `FAILED`, `DISCARDED`) e `terminal`; `failedStep`, `failedStepLabel` (texto do servidor) e `failureCode`, só em `FAILED`; `attempts` e `maxAttempts`; `cleanupState` e `cleanupResidue`.
   - **Não traz:** o nome e o preço do serviço que a IA identificou e informou (`sourceId` é só o id do fato), nem o que a IA está fazendo dentro de um marco ("próximo horário livre para …").
   - **`failureCode` é um conjunto fechado de seis códigos**, cada um com significado e "como se resolve" na tabela "Códigos de falha da execução": `ACTIVATION_TEST_AI_DID_NOT_ACT`, `ACTIVATION_TEST_AI_DID_NOT_REPLY`, `ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED`, `ACTIVATION_TEST_AI_DID_NOT_CONFIRM_APPOINTMENT`, `ACTIVATION_TEST_ABANDONED` e `ACTIVATION_TEST_STEP_FAILED`.
   - **Nenhum código de falha da execução aponta para os horários.** "Não encontramos um horário livre" é `ACTIVATION_TEST_NO_AVAILABILITY`, uma **recusa** de `POST /v1/activation-test`, verificada antes de a execução existir. A tabela diz isso: "Não é problema de catálogo nem de agenda: os dois são verificados antes de a execução começar". O texto e o "Revisar horários" do quadro descrevem um caso que não chega à 4.8.
   - A limpeza só roda depois do resultado. Enquanto a execução roda, `cleanupState` é `PENDING`, e "Limpando dados de teste" é um passo que ainda não começou.
4. **O vault.** `docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`:
   - §"Tela durante teste" lista os seis marcos com os rótulos de `MILESTONE_LABELS` ("Agenda consultada", não "Consultando agenda"), diz que "No mobile, pode haver ação `Abrir WhatsApp` quando apropriado" e que o teste continua se a pessoa trocar de aplicativo;
   - §"Falha" pede: não ativar a IA, indicar de forma amigável a etapa que falhou e oferecer tentar novamente.
5. **O app hoje.**
   - `scenarios.ts`: `teste-real-progresso` tem o eyebrow "Teste em andamento", o título "Sua IA está atendendo o cliente de teste" e o texto "Acompanhe cada etapa. …"; `teste-real-falha` tem o eyebrow "Teste não concluído", o título "O teste não chegou ao fim" e o texto "Sua IA não foi ativada. …". `teste-real` (4.6) já usa o eyebrow "WhatsApp".
   - `ActivationTestProgress` (`features/activation-test/ActivationTestPanels.tsx`) lê a execução a cada 3 s até ela terminar (`useActivationTestRun(true)`) e mostra `ActivationTestMilestoneList`: uma lista de pontos com ✓ ou relógio e " — aguardando". Embaixo, uma nota em texto corrido.
   - A tela de progresso **não sai sozinha** quando a execução termina. O rodapé tem "Continuar depois" (`skipActivationTest`, conclui o onboarding sem teste) e "Continuar", que lê a execução (`readFinishedActivationTest`) e vai para a tela do estado, ou diz "O teste ainda está em andamento. Aguarde o fim.".
   - `ActivationTestFailed` lê a execução uma vez e mostra a nota "O teste parou em: <failedStepLabel>." (ou "O teste parou antes de terminar."), "Sua IA continua desligada. …", "A Avenly tentou X de Y vezes antes de parar." quando `attempts > 1`, e `ActivationTestCleanupNote`. O rodapé tem "Fazer isso depois" **antes** de "Tentar novamente" (`activationTestStartAction.failed`).
   - `ActivationTestPanelBody` serve o onboarding e Configurações › IA (Goal063). O onboarding já tem corpo próprio na introdução (`ActivationTestOnboardingIntro`, 4.6) e no sucesso (`ActivationTestOnboardingSucceeded`, 4.9). Configurações › IA usa `ActivationTestProgress` e `ActivationTestFailed`, não tem quadro destas duas telas e não muda.
   - `features/whatsapp/WhatsAppConnectionPanel.tsx` já tem um "Abrir WhatsApp" (`href="whatsapp://send"`).
   - `@keyframes at-breathe` está em `shared/styles/avenly.css`, e `at-reveal` em `shared/styles/avenly-conversations.css`, com as regras de `prefers-reduced-motion`.
6. **Captura e gate.**
   - O alvo 4.9 é hoje o único dono de `responses` em `Onboarding-3-IA-e-WhatsApp.dc.html`, e `scripts/tests/visual-responses.test.mjs` e `tests/goal127-alvos-captura.test.ts` afirmam isso.
   - `ONBOARDING_ROUTES` (`e2e/routes.ts`) tem `teste-real-sucesso` e `whatsapp-concluido`, mas não `teste-real-progresso` nem `teste-real-falha`. `tests/goal079-onboarding-gate-routes.test.ts` exige que todo `contentMarker` seja o título de uma etapa.
7. **Testes que afirmam o que muda.** `goal019-activation-test-screens`, `goal019-a11y`, `goal063-onboarding-activation` e `goal099-onboarding-ia-whatsapp` montam o progresso ou a falha, ou citam os textos de hoje. `goal127-alvos-captura` afirma o dono único de `responses`.
8. **Observação 2 do review127.** `.onboarding-content.is-completion` usa `justify-content: center` dentro de `overflow-y: auto`. Em alturas muito baixas, o topo da arte da 4.9 e da 4.10 pode ficar fora do alcance da rolagem; `safe center` resolve. É a mesma moldura do onboarding, e a correção é de uma linha.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS das duas telas: os valores inline de px, cor, fonte, raio e espaçamento, e as animações. Usa cada arquivo para o seu device: `Onboarding-3-IA-e-WhatsApp.dc.html` no mobile, `-Tablet` em retrato e paisagem e `-Desktop` no desktop. Lê os valores de cada arquivo; não os deduz do mobile. As outras etapas do onboarding não mudam, nem no DOM, nem na captura.
2. **Corpos próprios do onboarding.** `ActivationTestPanels.tsx` ganha `ActivationTestOnboardingProgress` e `ActivationTestOnboardingFailed`, como `ActivationTestOnboardingIntro` e `ActivationTestOnboardingSucceeded`. `ActivationTestPanelBody` os usa só com `onboarding`. `ActivationTestProgress`, `ActivationTestFailed`, `ActivationTestMilestoneList`, `MILESTONE_LABELS` e o que Configurações › IA mostra não mudam.
3. **A linha do tempo é a leitura, nada mais.** Um componente só, usado pelas duas telas, monta as linhas a partir de `run.milestones`, na ordem que veio:
   - **concluída:** marco com `reached: true`;
   - **atual (só na 4.7):** o primeiro marco com `reached: false`, e só com `state: "RUNNING"`;
   - **falhou (só na 4.8):** o primeiro marco com `reached: false`, e só com `state: "FAILED"`; com os seis alcançados, nenhuma linha fica vermelha;
   - **pendente:** os outros marcos com `reached: false`;
   - o rótulo de cada marco é o de `MILESTONE_LABELS`, o texto do vault, em todos os estados;
   - nenhuma linha muda por tempo decorrido, e nada é guardado entre leituras: a regra de `useActivationTestRun` continua valendo;
   - as linhas concluídas não têm segunda linha: o contrato não traz o nome nem o preço do serviço, e nenhum pedido novo é feito para buscá-los.
4. **4.7: o andamento como o quadro.**
   - `scenarios.ts`: o eyebrow passa a "WhatsApp", o título a "Teste em andamento" e o texto a "Acompanhe pelo WhatsApp se quiser. Não responda à conversa de teste.".
   - A linha do tempo da escolha 3, com a sétima linha "Limpando dados de teste", sempre pendente nesta tela (a limpeza só roda depois do resultado), sem conector.
   - **A tela se atualiza sozinha.** A leitura a cada 3 s continua. Quando ela devolve uma execução cuja tela (`activationTestScenarioFor`) não é `teste-real-progresso` (terminou bem, falhou ou pausou por interferência), a etapa vai sozinha para essa tela, com `replace`. Com a leitura em erro ou sem execução, a tela fica onde está, com o `ErrorNote` de hoje. Configurações › IA não ganha essa navegação.
   - O rodapé: "Abrir WhatsApp" (secundário, com o ícone de balão, `href="whatsapp://send"`, como em `WhatsAppConnectionPanel`) e a nota "Pode sair do app — o teste continua e a tela se atualiza sozinha.". "Continuar" sai: a navegação sozinha o substitui. "Continuar depois" continua, discreto, abaixo da nota, com a classe `onboarding-actions-skip` da 4.6 e o mesmo efeito de hoje.
5. **4.8: a falha como o quadro.**
   - `scenarios.ts`: o eyebrow passa a "WhatsApp", o título a "O teste não foi concluído" e o texto a "Sua IA ainda não está ativa. Nada foi enviado aos seus clientes.".
   - A linha do tempo da escolha 3, sem a linha da limpeza. A linha que falhou tem a segunda linha "o que falhou", pelo `failureCode`:

     | `failureCode` | Segunda linha da linha que falhou |
     | --- | --- |
     | `ACTIVATION_TEST_AI_DID_NOT_ACT` | "A IA não concluiu esta etapa." |
     | `ACTIVATION_TEST_AI_DID_NOT_REPLY` | "A IA não respondeu ao cliente de teste." |
     | `ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED` | "A resposta da IA não saiu pelo seu WhatsApp." |
     | `ACTIVATION_TEST_AI_DID_NOT_CONFIRM_APPOINTMENT` | "A IA não confirmou o agendamento." |
     | `ACTIVATION_TEST_ABANDONED` | "O teste parou de responder." |
     | `ACTIVATION_TEST_STEP_FAILED`, código desconhecido ou `null` | "O teste parou nesta etapa." |

   - **O cartão "O que você pode fazer"**, pelo mesmo código:
     - `ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED`: "Confira se o seu WhatsApp continua conectado e tente de novo.";
     - todos os outros, código desconhecido ou `null`: "Tente de novo — pode ter sido uma falha momentânea. Seus serviços e horários foram conferidos antes de o teste começar.";
     - com os seis marcos alcançados (nenhuma linha vermelha), o cartão começa pela frase de hoje: "O teste parou em: <failedStepLabel>." ou, sem rótulo, "O teste parou antes de terminar.";
     - com `attempts > 1`, o cartão termina com a frase de hoje: "A Avenly tentou X de Y vezes antes de parar.".
   - Os textos das duas tabelas ficam num mapa fechado, ao lado de `MILESTONE_LABELS`. Nenhum texto culpa a pessoa, e nenhum promete correção que a pessoa não pode fazer.
   - `ActivationTestCleanupNote` continua abaixo do cartão, com as mesmas três regras (Goal019 §6). Sem execução, não há linha do tempo, e o cartão leva a frase genérica.
   - O rodapé, na ordem do quadro, no DOM e na tela: "Tentar novamente" (primário, `activationTestStartAction.failed`, como hoje) e depois "Fazer isso depois" (secundário, 52 px, borda `#D6CEC2`, `skipActivationTest`, como hoje), no lugar de "Revisar horários".
6. **Movimento.** `at-reveal` nas linhas concluídas e na atual da 4.7, com os atrasos do quadro, e `at-breathe` no anel da linha atual. Se uma `@keyframes` precisar existir em `avenly.css`, ela é declarada uma vez. Com `prefers-reduced-motion: reduce`, nada se move: as linhas aparecem já no lugar final e o anel fica parado e visível. A 4.8 não tem animação.
7. **CSS.** As regras ficam em `shared/styles/avenly.css`, junto das do onboarding, escopadas pelos corpos novos, sem alterar regra que outra etapa ou Configurações › IA usa. Junto, a observação 2 do review127: `.onboarding-content.is-completion` passa a `justify-content: safe center`, sem outra mudança na moldura de conclusão.
8. **Alvos.** `targets.json` ganha, ambos de `Onboarding-3-IA-e-WhatsApp.dc.html`, com `account: "onboarding"`, nenhum passo e `responses` só de `GET /v1/activation-test`:
   - **4.7**, rota `/onboarding/teste-real-progresso`: uma execução `RUNNING`, `terminal: false`, `currentStep: "AI_CHECKS_AVAILABILITY"`, os marcos `MESSAGE_SENT`, `SERVICE_IDENTIFIED` e `PRICE_INFORMED` alcançados (com `reachedAt`, `sourceKind` e `sourceId` válidos), os outros três não, e `cleanupState: "PENDING"`;
   - **4.8**, rota `/onboarding/teste-real-falha`: uma execução `FAILED`, `terminal: true`, os mesmos três marcos alcançados, `failedStep: "AI_CHECKS_AVAILABILITY"`, um `failedStepLabel`, `failureCode: "ACTIVATION_TEST_AI_DID_NOT_ACT"`, `attempts: 1`, `maxAttempts: 2` e `cleanupState: "CLEAN"`;
   - todos os campos válidos para `activationTestRunSchema`;
   - as `notes` citam as divergências declaradas.

   Os outros alvos de onboarding não mudam.
9. **Captura, teste.** `scripts/tests/visual-responses.test.mjs` passa a aceitar 4.7, 4.8 e 4.9 como os donos de `responses` em `Onboarding-3-IA-e-WhatsApp.dc.html`. Ganha um teste que prova:
   - 4.7 e 4.8 declaram só um `GET`, de `/v1/activation-test`, e nenhum passo;
   - a execução do 4.7 é `RUNNING` e não terminal, e a do 4.8 é `FAILED` e terminal;
   - o 4.9 continua com os dois `GET` de antes, e o 4.10 continua sem `responses`.

   `tests/goal127-alvos-captura.test.ts` muda só a asserção do dono único, para a lista nova.
10. **Gate autenticado.** `ONBOARDING_ROUTES` ganha `/onboarding/teste-real-progresso` (marcador "Teste em andamento") e `/onboarding/teste-real-falha` (marcador "O teste não foi concluído"), com o comentário de por que a conta parada as renderiza. Na conta real, sem execução, a 4.7 mostra o `ErrorNote` "Nenhum teste em andamento" e não sai da tela, e a 4.8 mostra o cartão genérico; é isso que o gate mede. `goal079-onboarding-gate-routes.test.ts` continua passando sem afrouxar asserção.
11. **Divergências declaradas.**
    - Nas linhas concluídas da 4.7, sem a segunda linha (hora, serviço e preço) e, na atual, sem "próximo horário livre para …": o contrato não traz esses dados por marco.
    - O rótulo do vault em todas as linhas ("Agenda consultada" onde o quadro diz "Consultando agenda").
    - Na 4.8, cada marco pendente numa linha própria ("Horário selecionado" e "Agendamento confirmado", onde o quadro junta "Horário selecionado e confirmação").
    - Na 4.8, a segunda linha e o cartão pelo `failureCode`, e não o texto de horário livre do quadro, que descreve uma recusa antes do teste e não uma falha da execução; e "Fazer isso depois" no lugar de "Revisar horários".
    - Na 4.7, "Continuar depois" discreto abaixo da nota.
    - Na 4.8, a nota de limpeza abaixo do cartão (Goal019 §6).
    - O "Sair" do topo abaixo de 1024 px e do rodapé da sidebar (D-104), se o quadro não o mostrar.
    - A barra de status e o indicador de início do iPhone nos quadros mobile.

    O Developer registra outras que encontrar nas `notes` dos alvos e em D-142, com o motivo.
12. **Decisão.** O Developer propõe **D-142**, por acréscimo, depois das provas. D-142 cobre:
    - os corpos próprios do onboarding e a linha do tempo lida da execução;
    - a navegação sozinha da 4.7;
    - os textos por `failureCode` e a ordem das ações da 4.8;
    - o movimento, os alvos, as rotas do gate, `safe center` na moldura de conclusão e as divergências.

## Escopo obrigatório

### 1. O frontend (`apps/frontend/src`)

1. `features/activation-test/ActivationTestPanels.tsx`: os dois corpos do onboarding, a linha do tempo e os textos por `failureCode` (escolhas 2, 3 e 5). O que Configurações › IA mostra não muda.
2. `features/onboarding/scenarios.ts`: só as entradas `teste-real-progresso` e `teste-real-falha` (escolhas 4 e 5).
3. `features/onboarding/OnboardingScreen.tsx` e `features/onboarding/blocks/activation-test.tsx`: o rodapé das duas etapas e a navegação sozinha da 4.7 (escolhas 4 e 5).
4. `shared/styles/avenly.css`: o CSS das duas telas nos quatro devices, o movimento e o `safe center` (escolhas 6 e 7).

`OnboardingShell.tsx`, `OnboardingRuntime.tsx`, `blocks.ts`, as outras etapas, Configurações › IA, `WhatsAppConnectionPanel.tsx` e o contrato não mudam.

### 2. A captura e o gate

1. `apps/frontend/e2e/visual/targets.json`: o 4.7 e o 4.8 (escolha 8).
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.
3. `apps/frontend/e2e/routes.ts`: as duas rotas em `ONBOARDING_ROUTES` (escolha 10).

### 3. Provas

1. Testes novos em `apps/frontend/tests/goal128-*.test.tsx`:
   - **4.7, linha do tempo:** com três marcos alcançados e `RUNNING`, três concluídas, a quarta atual, duas pendentes e "Limpando dados de teste" pendente; com zero alcançados, a primeira atual; com os seis alcançados e `RUNNING`, nenhuma atual. Rótulos de `MILESTONE_LABELS`, nenhuma segunda linha.
   - **4.7, cabeçalho e rodapé:** "Teste em andamento", o texto do quadro, "Abrir WhatsApp" com `href="whatsapp://send"`, a nota, "Continuar depois" e nenhum "Continuar".
   - **4.7, navegação sozinha:** a leitura que devolve `SUCCEEDED`, `FAILED` ou `PAUSED_BY_HUMAN` leva a `teste-real-sucesso`, `teste-real-falha` ou `teste-real-interferencia` com `replace`; `RUNNING`, sem execução e leitura em erro não navegam.
   - **4.8, linha do tempo:** a linha que falhou é o primeiro marco não alcançado; com os seis alcançados, nenhuma linha vermelha e o cartão com "O teste parou em: …".
   - **4.8, textos:** a segunda linha e o cartão para cada um dos seis códigos, para código desconhecido e para `null`; a frase de tentativas só com `attempts > 1`.
   - **4.8, cabeçalho, limpeza e rodapé:** "O teste não foi concluído", o texto do quadro, a nota de limpeza com `CLEAN` e com `RESIDUAL`, e "Tentar novamente" antes de "Fazer isso depois" no DOM, cada um com o efeito de hoje.
   - **Configurações › IA:** os painéis de progresso e de falha iguais aos de hoje, sem navegação sozinha.
   - **Moldura de conclusão:** `.onboarding-content.is-completion` com `safe center`.
2. `scripts/tests/visual-responses.test.mjs`: os testes da escolha 9.
3. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) a linha atual da 4.7 marcada por tempo, ou como o primeiro marco alcançado, faz um teste reprovar;
   - (b) a 4.7 navegando com a execução `RUNNING` faz um teste reprovar;
   - (c) o cartão da 4.8 com o texto de `REPLY_NOT_DELIVERED` para outro código faz um teste reprovar;
   - (d) a 4.8 com "Fazer isso depois" antes de "Tentar novamente" faz um teste reprovar;
   - (e) o 4.7 de `targets.json` com a execução `SUCCEEDED` faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
4. Os testes existentes continuam passando. Um ajuste em arquivo da evidência 7 só troca o texto, a ordem ou a ação que este Goal muda. Nenhum ajuste afrouxa asserção sobre ativação da IA, teste real, conclusão do onboarding ou Configurações › IA. Cada ajuste é listado no relatório.
5. **Fidelidade visual.**
   - `npm run visual:compare -- --target 4.7,4.8` e, para regressão, `--target 4.6,4.9,4.10,IA1`. Rodar numa pilha descartável própria, com o banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 127.
   - Antes de editar, o Developer guarda o `app.png` dos alvos de regressão. Depois, mostra que eles não mudaram, ou explica cada diferença.
   - O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, na IA, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhum pedido novo: o nome e o preço do serviço por marco ficam fora até o contrato os trazer.
- Nenhuma regra de ativação nova: quem liga a IA continua sendo o teste que termina bem (D-080).
- A pausa por interferência, a introdução (4.6), as conclusões (4.9 e 4.10, salvo o `safe center`), a conexão do WhatsApp (4.2 a 4.5) e Configurações › IA.
- O resto das lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, N2, N3, W3, H6, NT3, 2.7, 2.I2 a 2.I10 e 4.3 a 4.5) e as outras observações abertas dos reviews 116 a 127.

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-142** em `PROPOSED`, conforme a escolha 12. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal128.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal128, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado; um gate que o IA Loop roda depois do relatório é registrado com o resultado dele, nunca como "não executado";
  - os controles negativos e a rodada em que rodaram;
  - o `visual:compare` (alvos, percentuais, regressão e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. Montar a pilha descartável própria e capturar a regressão de antes, sem editar nada.
2. Implementar a linha do tempo, a 4.7 com a navegação sozinha e a 4.8, com os testes `goal128`.
3. Adicionar os alvos, os testes da captura e as rotas do gate, e o `safe center`.
4. Rodar o `visual:compare` de 4.7 e 4.8, e o de 4.6, 4.9, 4.10 e IA1 para regressão.
5. Rodar os controles negativos do §3.3 e revertê-los.
6. Fazer a execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`);
   - testes do frontend e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. `/onboarding/teste-real-progresso` igual ao quadro 4.7 nos 4 devices e `/onboarding/teste-real-falha` igual ao quadro 4.8 nos 4 devices, salvo as divergências declaradas: o cabeçalho, a linha do tempo, o cartão e as ações, como no quadro. Provado em jsdom e pelo `visual:compare`.
2. Cada linha da linha do tempo vem só de `run.milestones` e de `state`: concluída só com `reached: true`, atual só com `RUNNING`, vermelha só com `FAILED`, nada por tempo decorrido e nenhum dado que o contrato não traz.
3. A 4.7 vai sozinha para a tela do estado quando a leitura mostra que a execução terminou ou pausou, e fica onde está com `RUNNING`, sem execução ou com a leitura em erro. "Abrir WhatsApp" abre o WhatsApp; "Continuar depois" faz o que fazia.
4. A 4.8 mostra o que falhou e o que fazer pelo `failureCode`, com o texto fixo de cada código, e "Tentar novamente" antes de "Fazer isso depois", cada um com o efeito de hoje.
5. As outras etapas do onboarding e Configurações › IA não mudam. 4.6, 4.9, 4.10 e IA1 iguais à captura de antes, ou com cada diferença explicada; a moldura de conclusão só ganha `safe center`.
6. Nenhum pedido ao BFF muda, e nenhum passo de captura toca botão que grava. O teste da captura prova que 4.7 e 4.8 só declaram o `GET` da execução, no estado de cada quadro.
7. Os cinco controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
8. No gate autenticado de `validate:integration`, `/onboarding/teste-real-progresso` e `/onboarding/teste-real-falha` passam nas cinco larguras (360, 390, 768, 1024 e 1440). O gate mede:
   - overflow horizontal ausente;
   - alvo de toque de 24 px no mínimo;
   - contraste, inclusive `#716859` sobre `#F7F4EF`, `#8A2A21` sobre `#F7F4EF` e `#5F574E` sobre `#FFFDFA`;
   - foco visível;
   - `prefers-reduced-motion`.

   `validate:ui`, `validate:core` e `test:gate` passam.
9. Nenhum arquivo mudou fora destes:
   - os arquivos do §1;
   - `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/routes.ts` e `scripts/tests/visual-responses.test.mjs`;
   - os três registros da seção "Documentação".
10. D-142 proposta, conforme a escolha 12.

## Plano de execução

1. **WU-01 — A linha do tempo e a 4.7.** O componente da linha do tempo, `ActivationTestOnboardingProgress` com a navegação sozinha, o cabeçalho de `scenarios.ts`, o rodapé, o CSS com o movimento, e os testes `goal128` da 4.7 e de Configurações › IA.
2. **WU-02 — A 4.8.** `ActivationTestOnboardingFailed` com os textos por `failureCode`, o cartão, a nota de limpeza, o cabeçalho, a ordem das ações, o CSS, o `safe center`, os testes `goal128` da 4.8 e da moldura, e os ajustes dos testes existentes.
3. **WU-03 — Captura, gate, fidelidade, provas e registros.** Os alvos 4.7 e 4.8, os testes da captura, as rotas do gate, o `visual:compare` com a regressão, os controles negativos, D-142, CURRENT_STATE e VALIDATION_GATE.
4. **Verificação determinística:**
   - typecheck, lint, testes alvo `goal128`;
   - suíte do frontend, testes de ferramenta e `test:gate`;
   - `validate:core`, `validate:ui` e `validate:integration`;
   - `git diff --check`.
