# Goal 063 — A IA só liga depois do teste real

**Status: ACCEPTED.** Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal062 ACCEPTED](../reviews/062-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v86 reduz o escopo e o precisa com evidência conferida no código. O teste real é inalcançável pelos dois botões da etapa de contatos ignorados, não só pelo "Pular". A IA liga por `PATCH /v1/settings/ai` sem ler o teste. O backend do teste já funciona fora do onboarding. **QA O-40, O-45 e O-48** (consentimento, QR, visão de código) saem daqui e formam o Goal071.

## Baseline aceita

Baseline aceita: `57012750d63631b09f6bd6ac3a6310b31a05b84c`

Goal anterior: 062 — A importação traz a base inteira e respeita a agenda existente

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal062 já integrado em `main` (origem `bceaf28cf62a23f1e7b73ab05d37f65d424f4435`). **Duas rodadas**, com 6 e 0 blockers. **D-079** foi aceita e [FINAL_AUDIT §40](../FINAL_AUDIT.md) escrita sem reescrever §4 a §39. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 062 mudou a importação, a tela de Disponibilidade e o telefone de cliente. Não tocou onboarding, ativação da IA, teste real, Home nem Configurações › IA. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review062](../reviews/062-review.md): `test:gate` **233**; `test:frontend` **80** arquivos e **766** testes; suíte unitária de `apps/scheduling-service` **35** arquivos e **484** testes; integração do Scheduling **16** arquivos e **124** testes; integração do BFF **49** arquivos e **389** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **65** testes e **0** retentativas.

## Objetivo e posição

Fazer a IA passar de desligada a ligada só com um teste real bem-sucedido e ainda válido, por qualquer caminho, e tornar o teste alcançável: no onboarding, sem que uma etapa opcional o encerre, e em Configurações › IA, enquanto a IA não está ativa. Aplica **U-11** ([DECISIONS](../DECISIONS.md)), que revê D-035 na parte "teste real só no onboarding". Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA O-49** (ALTA): "Pular esta etapa" nos contatos ignorados encerra o onboarding, e o teste real, "Tudo pronto" e a conclusão ficam inalcançáveis.
- **QA S-02** (ALTA): um checkbox "Atendimento automático" mais "Salvar alterações" liga a IA sem teste nenhum, contra o vault (pergunta 14: serviço, disponibilidade, WhatsApp e teste bem-sucedido).
- **QA H-03** (ALTA): os itens do checklist da Home não levam a lugar nenhum, e "Concluir o teste da IA" não tem caminho.
- **QA H-04** (MÉDIA): o checklist some ao ligar o checkbox, com o teste nunca feito. Deixa de ser possível quando o S-02 fecha; o Goal prova isso.

Posição: primeiro depois da cadeia de importação (060 → 061 → 062). O Goal071 (conexão do WhatsApp) vem logo depois e mexe no mesmo bloco do onboarding; este Goal não toca a conexão.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **O onboarding é concluído antes do teste, pelos dois botões.** Na etapa `contatos-ignorados`, "Continuar" (`persistWhatsappStep`) e "Pular esta etapa" (`skipIgnoredContactsStep`), em `apps/frontend/src/features/onboarding/blocks/whatsapp.tsx`, chamam `onboarding.complete()` e `refreshSession()` antes de `ctx.go("teste-real")`. `ProductRuntimeProvider` (`apps/frontend/src/shared/runtime/ProductRuntime.tsx`) manda toda rota `/onboarding/*` para `/inicio` quando a sessão tem `onboardingCompleted`. `skipWhatsappStep` faz o mesmo antes de `whatsapp-concluido`, então essa tela também é inalcançável.
2. **A tela de sucesso afirma o que não leu.** `ActivationTestSucceeded` (`blocks/activation-test.tsx`) diz "Sua IA está ativa e pronta para atender seus clientes" só com a execução `SUCCEEDED`. Quem liga a IA é a reconciliação (`reconcileAiActivation`, `apps/bff/src/lib/ai-activation.ts`), que roda na leitura de `GET /v1/status` e `GET /v1/dashboard` e ainda confere serviço operacional.
3. **A IA liga sem teste.** `PATCH /v1/settings/ai` (`apps/bff/src/modules/settings/routes.ts:163-205`) grava `enabled: true` conferindo só a exclusão de conta (`assertAiActivationNotBlockedByDeletion`) e `capabilities.aiActivationReady`. É o único caminho humano que grava `enabled: true`; a reconciliação é o único outro. O `PATCH` não mexe em `activatedByRunId`.
4. **Pausar pode ser desfeito sozinho.** A autoativação da reconciliação liga a IA quando `enabled` é falso, há execução `SUCCEEDED` não superada e `activatedByRunId` é diferente do `id` dela. Uma IA ligada à mão (com `activatedByRunId` nulo) e depois pausada volta a ligar na leitura seguinte, se existir execução bem-sucedida.
5. **O backend do teste já funciona fora do onboarding.** As rotas `GET/POST /v1/activation-test` e `POST /v1/activation-test/restart` (`apps/bff/src/modules/activation-test/routes.ts`) não olham o onboarding. A única recusa própria do BFF é `ACTIVATION_TEST_AI_ALREADY_ACTIVE` (409), com a IA ligada. As demais recusas vêm da IA. `apps/ai-orchestrator/` não precisa mudar.
6. **A prova válida já tem leitura.** `activationTestCompleted` (`apps/bff/src/modules/dashboard/routes.ts:122`) é `state === "SUCCEEDED" && !supersededByChannelChange`.
7. **A tela de IA é um checkbox.** `AiSettings.tsx` guarda `enabled` e `tone` e envia os dois no mesmo `PATCH`. Pausar pede confirmação num `Dialog`; ligar não pede nada.
8. **O checklist é lista sem ação.** `PostOnboardingChecklist` (`apps/frontend/src/features/dashboard/DashboardScreen.tsx:707`) monta `li` sem link nem botão. Ele aparece enquanto `status.aiView !== "active"`.
9. **O que o gate autenticado mede.** `/inicio` e `/configuracoes` estão em `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`). `/configuracoes/ia` e `/onboarding/*` não estão. O tenant do ensaio (`scripts/goal033-authenticated-ui-rehearsal.mjs`) não grava `AiSettings`, então a IA está desligada e o checklist aparece em `/inicio`.
10. **O vault e U-11 convivem.** O vault diz que o teste "não é uma ferramenta recorrente de testar IA dentro das configurações" (`docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`, §"Quando repetir o teste"). U-11 põe o teste também em Configurações › IA. As duas regras valem juntas porque o teste só é oferecido enquanto a IA não está ativa, e o BFF já recusa o teste com a IA ativa.

## Fora do escopo

- **QA O-40, O-45 e O-48**: consentimento e pergunta de número pessoal antes de conectar, QR renovado e visão de código. Vão para o Goal071. `WhatsAppConnectionPanel` e as rotas de WhatsApp do BFF não mudam aqui.
- Desligar a IA de negócio que já está ligada sem teste. Não há migration de dado nem regra retroativa: a regra nova vale para a passagem de desligada a ligada. O relatório e D-080 declaram esse limite.
- Mudar o teste real em si: marcos, limpeza, número da plataforma, `PLATFORM_NUMBER_NOT_CONFIGURED`, superação por troca de canal (D-035).
- A exclusão de conta e a guarda de não reativação (Goal025): continuam como estão, e a checagem de exclusão continua antes das outras.
- Nome, Boas-vindas e demais divergências do onboarding (Goals 064 e 065), a importação no onboarding (Goal066), o resto de Configurações (Goal067) e a fidelidade visual da Home (Goal068).
- Editar o Product Vault. A convivência do §10 da evidência é registrada em D-080.
- As observações abertas dos reviews 059, 060, 061, 062 e 070 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal008-agenda.test.ts` (observação 4 do review059) reprovar em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal059.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas O-49, S-02, H-03 e H-04 e a seção "Resolvidas pelo usuário" do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- em [DECISIONS](../DECISIONS.md): a linha U-11, D-035 inteira, D-010 só no desejado e efetivo, e D-041 só na guarda contra reativação (Goal025);
- no vault: `02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`, seções "Contatos ignorados", "Falha", "Sucesso" e "Quando repetir o teste"; `02-Fluxos/01-Onboarding.md`, seção "Checklist pós-onboarding";
- `apps/bff/src/modules/settings/routes.ts` (a rota `PATCH /v1/settings/ai` e `settingsState`), `apps/bff/src/lib/ai-activation.ts`, `apps/bff/src/modules/activation-test/routes.ts`, `activationTestCompleted` em `apps/bff/src/modules/dashboard/routes.ts` e `apps/bff/src/lib/errors.ts`;
- em `apps/bff/PUBLIC_API_V1.md`: as seções de Configurações, do teste real (tabela de recusas) e de `GET /v1/status`;
- em `apps/frontend/src/features/onboarding/`: `blocks.ts`, `OnboardingRuntime.tsx` (`nextRequiredStep`), `OnboardingScreen.tsx`, `blocks/whatsapp.tsx` e `blocks/activation-test.tsx`;
- `apps/frontend/src/shared/runtime/ProductRuntime.tsx`, só o redirecionamento por fase;
- `apps/frontend/src/features/settings/AiSettings.tsx` e `apps/frontend/src/features/dashboard/DashboardScreen.tsx` (`PostOnboardingChecklist` e `checklistVisible`);
- `apps/frontend/e2e/routes.ts`;
- os testes existentes do teste real, da reconciliação, de `PATCH /v1/settings/ai`, do onboarding e do checklist.

## Pontos de implementação

- `apps/bff/src/modules/settings/routes.ts` e, se precisar de leitura compartilhada, `apps/bff/src/lib/`.
- `apps/bff/src/lib/errors.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `packages/public-api-contract/` só se o contrato fechar o conjunto de códigos de erro ou o schema de configurações da IA.
- `apps/frontend/src/features/onboarding/`, `features/settings/AiSettings.tsx`, `features/dashboard/DashboardScreen.tsx` e, para o teste compartilhado entre onboarding e Configurações, um módulo em `apps/frontend/src/features/` escolhido pelo Developer.
- `apps/frontend/src/app/(platform)/configuracoes/ia/` se a tela do teste precisar de rota própria.
- `apps/frontend/e2e/routes.ts`.
- Testes novos com prefixo `goal063-` em `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. A IA só passa de desligada a ligada com prova (BFF)

- `PATCH /v1/settings/ai` com `enabled: true`, quando o desejado gravado (`AiSettings.enabled`) é falso ou não existe, exige prova válida: a execução corrente do teste em `SUCCEEDED` e não superada por troca de canal, a mesma definição de `activationTestCompleted`. A leitura usa uma função só, compartilhada com o dashboard; não nasce uma segunda definição de prova válida.
- Sem prova válida, a rota recusa com `409` e código próprio novo (por exemplo, `AI_ACTIVATION_TEST_REQUIRED`), sem gravar nada e sem projetar nada.
- Se a leitura da execução falhar, a rota recusa sem gravar: dúvida nunca liga a IA. O erro sobe como os demais erros de upstream do BFF.
- Ordem das checagens: exclusão de conta primeiro (Goal025, inalterada), depois prova válida, depois serviço operacional (inalterada). O código e a forma das duas recusas antigas não mudam.
- Ligar com prova grava `activatedByRunId` com o `id` da execução que autorizou, na mesma escrita de `enabled: true`. A troca de canal passa a desligar também a IA religada à mão, pela regra que a reconciliação já tem.
- `enabled: true` com a IA já ligada não é passagem: não exige prova e não muda `activatedByRunId`. Salvar só o estilo nunca é recusado por falta de teste.
- **Pausar fica pausado.** `PATCH` com `enabled: false` nunca é desfeito pela reconciliação. Se existe execução bem-sucedida não superada, o `id` dela fica em `activatedByRunId` ao pausar, para que a autoativação a reconheça como já usada. O Developer escolhe a forma e prova com a leitura de `GET /v1/status` depois da pausa.
- Um teste novo bem-sucedido depois de uma pausa continua ligando a IA pela reconciliação, como hoje (vault, "Sucesso": ativar a IA).
- As rotas do teste real não mudam, inclusive a recusa `ACTIVATION_TEST_AI_ALREADY_ACTIVE`.

### 2. O onboarding não é concluído antes do teste (frontend)

- **Regra:** `onboarding.complete()` só é chamado pela ação que sai do onboarding para a área logada. Nenhuma tela que ainda pertence ao onboarding vem depois dessa chamada.
- `contatos-ignorados`: "Continuar" e "Pular esta etapa" vão para `teste-real` sem concluir o onboarding. Pular não grava marcação.
- A saída do onboarding acontece em três pontos:
  - no CTA de `teste-real-sucesso` ("Ir para o início");
  - em "Fazer isso depois" das telas do teste, inclusive quando a recusa é `PLATFORM_NUMBER_NOT_CONFIGURED`;
  - no CTA de `whatsapp-concluido`, que passa a ser mostrada antes da conclusão.
- **Retomada.** Com o WhatsApp conectado e o onboarding aberto, `OnboardingResume` leva à tela do teste que corresponde à execução corrente (`activationTestScenarioFor`), ou a `contatos-ignorados` quando não há execução. A leitura da execução que falha não vira tela de sucesso nem de falha: a tela diz que não conseguiu ler.
- **A tela de sucesso só afirma o que leu.** "Sua IA está ativa" aparece só depois de uma leitura de `GET /v1/status` (a leitura que reconcilia) com a IA efetivamente ativa. Se a leitura disser outra coisa (por exemplo, falta serviço operacional, ou a projeção falhou), a tela diz o estado real e o que falta, sem afirmar ativação. O texto de sucesso do teste ("Sua IA conversou com o cliente de teste e marcou o horário") continua.
- A barra de progresso e a ordem do fluxo (`onboardingFlow`) não mudam.

### 3. Configurações › IA sem checkbox, com o teste (frontend)

- O checkbox "Atendimento automático" deixa de existir (U-11). A tela mostra o estado lido e a ação que cabe nele:
  - **IA ativa:** "Pausar atendimento", com a confirmação que já existe.
  - **IA pausada, com prova válida:** "Retomar atendimento", que envia `enabled: true`.
  - **Sem prova válida:** o texto diz que a IA só liga depois do teste real e oferece o teste. Sem WhatsApp conectado, o texto diz isso e leva a `/configuracoes/whatsapp`, sem oferecer o teste.
  - **Recusa `AI_ACTIVATION_TEST_REQUIRED`:** a tela relê o estado e mostra o caso "sem prova válida", não um erro genérico.
- O estilo da IA é salvo sem mudar o ligado: o `PATCH` leva o desejado lido, nunca um valor do formulário.
- **O teste em Configurações é o mesmo do onboarding.** Os componentes de introdução, progresso, pausa por interferência, falha e sucesso saem de `blocks/activation-test.tsx` para um módulo compartilhado, usado pelo onboarding e por Configurações › IA. Nenhuma cópia de marco, texto ou regra de estado. O onboarding continua funcionando igual, provado pelos testes existentes.
- O teste só é oferecido enquanto a IA não está ativa. Com a IA ativa, a tela não mostra entrada para o teste.
- Nenhum texto contém "token", "API", "HTTP", "run", "projeção", "reconciliação", "desired", "effective" nem código cru.

### 4. O checklist leva a cada módulo (frontend)

- Cada item do checklist da Home vira ação alcançável por clique:
  - "Cadastrar um serviço" leva a `/servicos`;
  - "Definir horários de atendimento" leva a `/configuracoes/disponibilidade`;
  - "Conectar o WhatsApp" leva a `/configuracoes/whatsapp`, com "Conectar" como ação na linha enquanto pendente;
  - "Concluir o teste da IA" leva ao teste em Configurações › IA, e, enquanto o WhatsApp não está conectado, diz "depois do WhatsApp" em vez de oferecer o teste.
- Item concluído continua marcado e continua alcançável.
- O checklist continua aparecendo enquanto a IA não está ativa e some depois da ativação, como o vault manda. Como o S-02 fecha, ele só some com teste feito ou com IA ligada antes deste Goal (limite do §"Fora do escopo").
- A leitura de cada item não muda: continua vindo de `GET /v1/dashboard` e `GET /v1/status`.

### 5. Gate renderizado

- `/configuracoes/ia` entra em `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`), com `sessionMarker` e `contentMarker` no padrão das demais. O tenant do ensaio não tem teste, então a tela medida é a de "sem prova válida", com a ação dela.
- `/inicio` continua medida, agora com o checklist com ações.
- Nenhuma medida do gate é desligada, e nenhuma rota sai da lista.

### 6. Contrato público

- `apps/bff/PUBLIC_API_V1.md`:
  - a recusa nova de `PATCH /v1/settings/ai`, com a ordem das três checagens;
  - a gravação de `activatedByRunId` ao religar e a regra de pausa;
  - o teste oferecido fora do onboarding enquanto a IA não está ativa;
  - a correção do texto de `ACTIVATION_TEST_AI_ALREADY_ACTIVE` na tabela de recusas, se ele passar a mentir;
  - a passagem da seção de exclusão de conta que fala em religar a IA, se ela passar a mentir.
- `packages/public-api-contract/` só muda se ele fechar o conjunto de códigos ou o schema da resposta de configurações. A contagem congelada de chamadas `this.http.` em `apps/bff/src/clients/` (**42**) não muda. Nenhum teste de outro app é editado para acomodar contagem.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**. Nenhum teste chama WhatsApp, Evolution ou número da plataforma reais; a IA é dublê, como nos testes do Goal019.

1. **BFF, contra PostgreSQL real** (suíte de integração do BFF):
   - `PATCH /v1/settings/ai` com `enabled: true` e sem execução recusa com o código novo e não grava `AiSettings.enabled`;
   - o mesmo com execução `FAILED`, `PAUSED_BY_HUMAN` e `SUCCEEDED` superada por troca de canal;
   - com leitura da execução falhando, recusa e não grava;
   - com `SUCCEEDED` não superada e serviço operacional, liga e grava `activatedByRunId`;
   - com exclusão agendada, recusa com o código e a forma de antes, mesmo com prova válida;
   - sem serviço operacional e com prova válida, recusa com `409 CONFLICT` como antes;
   - IA já ligada sem `activatedByRunId` (negócio de antes deste Goal): salvar o estilo com `enabled: true` passa e não muda nada além do estilo;
   - pausar e depois ler `GET /v1/status`: a IA continua desligada, com execução bem-sucedida existente;
   - religar à mão com prova, trocar o canal e ler `GET /v1/status`: a IA desliga (`DEACTIVATED_BY_CHANNEL_CHANGE`);
   - dois negócios diferentes: a prova de um não liga a IA do outro.
2. **Frontend (jsdom):**
   - "Continuar" e "Pular esta etapa" em `contatos-ignorados` não chamam `onboarding.complete()` e levam a `teste-real`;
   - "Fazer isso depois" e o CTA de sucesso concluem e levam a `/inicio`;
   - `whatsapp-concluido` é mostrada antes da conclusão;
   - a retomada leva à tela da execução corrente;
   - a tela de sucesso não diz "Sua IA está ativa" quando `GET /v1/status` diz desligada;
   - Configurações › IA não tem checkbox; mostra os quatro estados do §3 com a ação de cada um; o estilo salvo envia o desejado lido; a recusa nova leva ao estado "sem prova válida"; o teste aparece em Configurações sem prova e não aparece com a IA ativa;
   - cada item do checklist é link ou botão para o destino do §4;
   - nenhum texto das telas tocadas contém os termos proibidos do §3.

Os testes existentes continuam passando. Só muda asserção que espera a conclusão do onboarding em `contatos-ignorados`, o checkbox de `AiSettings`, o checklist sem ação ou `PATCH /v1/settings/ai` ligando sem prova; o relatório lista cada mudança com o motivo. Teste existente que liga a IA por `PATCH` e espera sucesso passa a dar ao dublê uma execução bem-sucedida, e o relatório nomeia cada um.

### 8. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório:

1. `PATCH /v1/settings/ai` volta a ignorar a prova: o teste de "sem execução" do §7.1 reprova.
2. A prova volta a aceitar execução superada: o teste de `SUCCEEDED` superada do §7.1 reprova.
3. Pausar deixa de marcar a execução como usada: o teste de pausa seguida de `GET /v1/status` do §7.1 reprova.
4. `contatos-ignorados` volta a concluir o onboarding: o teste jsdom do §7.2 reprova.
5. A tela de sucesso volta a afirmar a ativação sem ler: o teste jsdom do §7.2 reprova.
6. Um item do checklist volta a ser `li` sem ação: o teste jsdom do §7.2 reprova.

### 9. O que só uma pessoa confere

O teste real depende do número oficial da Atendly, que não existe no ambiente de migração (D-035, gate operacional). Nenhum teste prova o envio real. Depois do aceite, uma pessoa confere na pilha local com número da plataforma configurado:

- que o onboarding chega ao teste pelos dois botões;
- que o teste em Configurações › IA roda;
- que a IA liga ao terminar bem;
- que pausar e ler de novo não religa.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o §6.
- [DECISIONS](../DECISIONS.md) ganha **D-080** em `PROPOSED`, no formato de D-075 a D-079. Ela diz que:
  - a IA passa de desligada a ligada só com prova válida, por qualquer caminho, e a prova é a execução `SUCCEEDED` não superada;
  - ligar à mão grava a execução que autorizou, e pausar nunca é desfeito pela reconciliação;
  - o teste real é oferecido no onboarding e em Configurações › IA, só enquanto a IA não está ativa. Isso convive com o vault ("não é ferramenta recorrente") porque o BFF recusa o teste com a IA ativa;
  - o onboarding só é concluído pela ação que sai dele.

  D-080 revê D-035 na parte "teste real só no onboarding" e responde ao "Revisar se" de D-035 sobre o teste fora do onboarding: o item (10) continua valendo, e o teste vale para a instância contra a qual rodou. Aplica U-11 e diz isso, sem reescrever D-035 nem U-11. Limites da D-080: IA ligada antes deste Goal sem teste continua ligada; o envio real não tem prova (§9).
- A linha U-11 de DECISIONS ganha só uma nota de aplicação ("aplicada no Goal063, ver D-080"), sem mudar o texto.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§41**, sem reescrever §4 a §40: **QA O-49, S-02, H-03 e H-04** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram:
  - a regra de ativação, a pausa e o teste em Configurações;
  - a conclusão do onboarding e a rota nova no gate autenticado;
  - a conferência humana pendente;
  - as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Escreva a prosa **depois** da execução final, e só depois de `validate:integration` e dos seis controles terem rodado na árvore final (blockers 1, 2 e 3 do review062). Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova.

### 11. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `packages/public-api-contract/`, e só se o §6 exigir. Nenhum teste de outro app é editado para acomodar contagem congelada.
- Não cria migration, nem no BFF.
- Não muda `WhatsAppConnectionPanel`, as rotas de WhatsApp do BFF nem a etapa de conexão (Goal071).
- Não muda as rotas do teste real, os marcos, a limpeza nem a regra de superação por troca de canal.
- Não desliga IA já ligada por regra retroativa.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada, nenhuma medida do gate autenticado desligada e nenhuma rota tirada de `AUTHENTICATED_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. `PATCH /v1/settings/ai` só passa a IA de desligada a ligada com prova válida, grava a execução que autorizou, recusa sem gravar quando a leitura falha e mantém as duas recusas antigas na ordem do §1. Provado por execução do §7.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. Pausar não é desfeito pela reconciliação, e a IA religada à mão desliga com a troca de canal. Provado por execução do §7.1.
3. O onboarding chega ao teste pelos dois botões de `contatos-ignorados`, só é concluído pela ação que sai dele, retoma na tela da execução corrente e não afirma ativação sem leitura. Provado por execução jsdom do §7.2.
4. Configurações › IA não tem checkbox, mostra os quatro estados do §3 e oferece o mesmo teste do onboarding só sem prova válida. Provado por execução jsdom do §7.2 e pelos testes existentes do onboarding.
5. Cada item do checklist leva ao destino do §4. Provado por execução jsdom do §7.2. Largura, toque, contraste, foco e movimento de `/inicio` e de `/configuracoes/ia` são decididos pelo gate autenticado dentro de `validate:integration`, e os de `/configuracoes` por `validate:ui`; `/onboarding/*` não é medida.
6. `PUBLIC_API_V1.md` descreve o que mudou, e a contagem de `this.http.` em `apps/bff/src/clients/` segue **42**. Provado por diff e por execução de `test:gate`.
7. Os seis controles negativos do §8 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **80**/**766**; integração do BFF **49**/**389**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em mais de **65** testes (a rota nova soma medidas) e **0** retentativas. Provado por execução.
9. D-080 em `PROPOSED`, a nota em U-11, FINAL_AUDIT §41, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo depois da execução final, trazem as contagens dela e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que o teste real envia e recebe mensagem de verdade: o número da plataforma não existe no ambiente (§9);
- que `/onboarding/*` cumpre largura, toque, contraste, foco e movimento;
- que as telas batem com o protótipo aprovado (conferência humana, Goal068);
- consentimento, QR e visão de código, que são do Goal071.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Regra de ativação em `PATCH /v1/settings/ai`: prova válida compartilhada, recusa nova, `activatedByRunId` ao religar, pausa que fica pausada, `errors.ts` e `PUBLIC_API_V1.md` (§1, §6), com os testes `goal063-` do BFF |
| WU-02 | STANDARD | — | Onboarding: conclusão só na saída, retomada pela execução, sucesso só com leitura, e o teste extraído para módulo compartilhado (§2), com os testes jsdom |
| WU-03 | STANDARD | WU-01, WU-02 | Configurações › IA sem checkbox e com o teste compartilhado, checklist com ações e `/configuracoes/ia` no gate autenticado (§3, §4, §5), com os testes jsdom |
| WU-04…WU-08 | DETERMINISTIC | WU-03 | typecheck e lint de `apps/bff` e `apps/frontend`, testes dirigidos `goal063` do frontend |
| WU-09 | DETERMINISTIC | WU-04…WU-08 | gate-tests |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | validate-core; depois validate-ui e validate-integration |
| WU-13 | STANDARD | WU-11, WU-12 | Controles negativos (§8) e documentação (§10), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Os testes `goal063-` do BFF rodam dentro de `validate:integration`, que também roda o gate autenticado com a rota nova. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`.
