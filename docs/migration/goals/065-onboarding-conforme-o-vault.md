# Goal 065 — Onboarding conforme o vault

**Status: READY.** Preparado em 2026-09-28 pelo Tech Lead Agent após [Goal064 ACCEPTED](../reviews/064-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v89 precisa o escopo com evidência conferida no código. A linha da v78 somava perto de quarenta achados do onboarding. A v89 separa três grupos:

- **Este Goal** faz o onboarding seguir a sequência e as regras do vault nos blocos "Seu negócio", "Primeiro serviço", "Dias e horários", "Sua IA" (texto) e "WhatsApp" (introdução e contatos ignorados). Também põe essas etapas no gate renderizado autenticado.
- **O início do bloco "Sua agenda"** (QA O-17, O-18, O-19 e O-22) passa para o **Goal066**. As telas que esses achados descrevem são as mesmas que o 066 substitui pela pergunta "Sistema atual" e por "Importar agora / Fazer depois".
- **A fidelidade visual do onboarding ao protótipo** (ícones, trilho de capítulos, chevron de voltar, stepper, máscara de moeda, pílulas de dias, barra de horas, demonstração animada, amostra por estilo) passa para o novo **Goal072**, PLANNED, junto dos outros Goals de fidelidade.

## Baseline aceita

Baseline aceita: `76293d0747d0c755c38f90ff71ded08c1247a987`

Goal anterior: 064 — Conta conforme o vault: cadastro e recuperação de senha

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal064 já integrado em `main` (origem `e3156ac438eb83dbd867135f1893d80e53881459`). **Cinco rodadas**, com 6, 4, 4, 6 e 0 blockers. **D-082** foi aceita e [FINAL_AUDIT §43](../FINAL_AUDIT.md) escrita sem reescrever §4 a §42. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 064 mudou cadastro, regra de senha, recuperação de senha, o login, o cumprimento da Home e Configurações › Conta. Não tocou `apps/frontend/src/features/onboarding/` nem `apps/bff/src/modules/onboarding/`. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review064](../reviews/064-review.md), rodada 5: `test:gate` **233**; `test:frontend` **87** arquivos e **854** testes; integração do BFF **52** arquivos e **424** testes; integração do Scheduling **16** arquivos e **124** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **75** testes, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Fazer o onboarding seguir a sequência e as regras do vault (`docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md` §"Onboarding" e `02-Fluxos/01-Onboarding.md` §1, §2, §3, §5A e §6), sem gravar dado diferente do que a pessoa escolheu. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA O-01** (ALTA): não existe Boas-vindas.
- **QA O-02** (ALTA) e **QA O-03**: o botão "Sair" não tem estilo, e o leitor de tela anuncia "SairSair" no celular.
- **QA O-04** (ALTA) e **QA O-14**: segmentos escondidos por rolagem horizontal, e seleção sem `aria-pressed`.
- **QA O-05**, **QA O-06**, **QA O-08**, **QA O-09** e **QA O-15** na parte de sequência: segmento e nome, modalidade e endereço são três etapas no vault; hoje são uma tela, com o nome antes do segmento e outros textos. A busca de endereço por CEP fica fora (Goal072).
- **QA O-16** e **QA O-33**: validação por balão nativo, e erro de horário que não marca o campo.
- **QA O-24**: o primeiro serviço está fatiado em três telas; o vault tem uma.
- **QA O-26** (ALTA): só 2 dos 4 tipos de preço (vault, pergunta 44; "Sem preço informado", pergunta 780).
- **QA O-28**: não existe "Adicionar outro serviço".
- **QA O-30** e **QA O-31**: semana começando no domingo, e sem horário por dia (vault §6, "permitir personalizar por dia").
- **QA O-34** e **QA O-35**: texto de desenvolvimento vazado em "Sua Agenda Atendly está pronta", e resumo sem preço, dias e horário.
- **QA O-38**: "Atendly" no lugar de "IA" como nome da automação, contra `apps/frontend/AGENTS.md`.
- **QA O-41**, **QA O-43** e **QA O-50**: botões da introdução do WhatsApp espremidos no celular, "Só um número por negócio" ausente, e número inválido em contatos ignorados respondido com "Tente novamente".

A posição é a da v78, logo depois do 064. O fechamento do 064 não trouxe evidência para reordenar.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **Não há Boas-vindas.** `onboardingFlow` (`apps/frontend/src/features/onboarding/blocks.ts`) começa em `dados-do-negocio`, e `nextRequiredStep` (`OnboardingRuntime.tsx`) devolve `dados-do-negocio` para conta nova.
2. **A validação é nativa.** O `onSubmit` de `OnboardingScreen.tsx` chama `checkValidity()` e `reportValidity()` sobre campos `required`, `min` e `type="number"`. O erro próprio só existe para dias, horário e modalidade, num `role="alert"` de rodapé que não marca campo nenhum.
3. **"Sair" e segmentos.** `.onboarding-exit` (`apps/frontend/src/shared/styles/atendly.css`, perto da linha 2260) não reseta fundo nem borda. No celular (perto da linha 3225), o texto vai a `font-size: 0` e volta por `::after { content: "Sair" }`. `.chip-row` (perto da linha 631) tem `overflow-x: auto` e `scrollbar-width: none`, e os chips de `blocks/business.tsx` não têm `aria-pressed`.
4. **"Seu negócio" é uma tela só.** `businessStepBody` junta nome, segmento, modalidade e endereço. `persistBusinessStep` grava tudo num `PATCH /v1/onboarding` só. A seção `business` do BFF exige `name` (2 a 160), `category` e `timezone` a cada gravação; `modalities` e `address` ausentes preservam o que está gravado. Etapas separadas regravam nome e segmento a partir do rascunho, sem mudança no BFF.
5. **O onboarding reescreve o tipo de preço.** `PATCH /v1/onboarding` aceita `service.priceType` só em `FIXED` e `ON_REQUEST` (`apps/bff/src/modules/onboarding/routes.ts`, `patchSchema.service`). A leitura (`onboardingStateSchema`) e o Scheduling têm os quatro tipos. `onboardingPriceType` (`OnboardingRuntime.tsx`) troca `STARTING_AT` por `FIXED` e `NOT_INFORMED` por `ON_REQUEST`, e `draftFromState` usa essa troca. Assim, um serviço "A partir de" que passa pela etapa de preço é gravado de volta como "Fixo". Isso é escrita com perda, além de QA O-26. `features/services/ServiceForm.tsx` já tem os quatro tipos e a regra "valor obrigatório para Fixo e A partir de".
6. **"O serviço do onboarding" é o primeiro ativo da lista.** `onboarding-state.ts` devolve `services.find((service) => service.active)`. Um serviço adicional criado por `POST /v1/services` pode passar a ser o serviço que o onboarding mostra e edita, se a ordem de `listServices` o puser antes. O Goal precisa provar que isso não acontece.
7. **Os horários já podem ser por dia no BFF.** `availability.rules` é uma lista de `dayOfWeek`, `startTime` e `endTime` por regra. A tela manda o mesmo intervalo para todos os dias, e `draftFromState` lê só `activeRules[0]`. `weekdayLabels` começa no domingo.
8. **Textos.** `scenarios.ts` diz "O restante da ativação continua em uma próxima etapa do produto." em `agenda-atendly-pronta`, e o resumo mostra só serviço, duração e "Fonte oficial". Os textos das etapas chamam a automação de "Atendly" em pelo menos três lugares ("Como a Atendly deve conversar?", "Isso ajuda a Atendly a usar nomes…", "A Atendly só informará o valor cadastrado…").
9. **WhatsApp.** Na introdução, "Voltar", "Fazer isso depois" e "Conectar meu WhatsApp" ficam numa linha. Em contatos ignorados, `blocks/whatsapp.tsx` responde a qualquer falha, inclusive `400 VALIDATION_ERROR` de número curto, com "Não foi possível marcar este número. Tente novamente."
10. **Nenhuma etapa do onboarding é medida com layout.** `apps/frontend/e2e/routes.ts` deixa `/onboarding` fora de `AUTHENTICATED_ROUTES`. `scripts/goal033-authenticated-ui-rehearsal.mjs` semeia uma conta só, que conclui o onboarding. O jsdom não tem layout, então não prova QA O-04 nem QA O-41.

## Escolhas de desenho desta passada

- **Sequência.** Boas-vindas → Segmento + nome → Modalidade → Endereço (só com "Local próprio") → o bloco "Sua agenda" como está hoje (Goal066) → Primeiro serviço → Serviços adicionais (opcional) → Dias de atendimento → Horários → Agenda pronta → Demonstração da IA → Estilo da IA → WhatsApp como está hoje (071 e 063). Os IDs de rota novos são escolha do Developer, em português e no padrão dos existentes. Rota antiga que deixa de existir (`servico-duracao`, `servico-preco`) não pode quebrar: ela redireciona para a etapa que a substitui.
- **Boas-vindas não grava nada.** Ela aparece quando nenhuma seção do onboarding foi gravada. Depois da primeira gravação, retomar o onboarding não volta a ela. Texto do vault: "Configure sua Atendly em poucos passos.", CTA "Começar", e "Seu progresso fica salvo a cada etapa." Composição estática de três elementos (mensagem, resposta da IA, horário na agenda), sem carrossel. Se houver movimento, ele respeita `prefers-reduced-motion`. A composição animada do protótipo é do Goal072.
- **Endereço sem busca por CEP.** O endereço vira etapa própria, com o mesmo campo único `address` que o BFF já guarda. CEP que preenche bairro e cidade exige serviço externo novo e fica para o Goal072, se uma pessoa quiser.
- **Quatro tipos de preço, sem conversão.** O BFF passa a aceitar os quatro tipos em `PATCH /v1/onboarding`, com a regra de `ServiceForm`: valor obrigatório e não negativo para `FIXED` e `STARTING_AT`; valor ausente ou `null` para `ON_REQUEST` e `NOT_INFORMED`. Violação responde `400 VALIDATION_ERROR` com o campo, antes de qualquer escrita. O frontend grava e relê o tipo escolhido, sem par mais próximo.
- **Serviços adicionais usam a rota de Serviços.** A etapa lista os serviços ativos e cria outros por `POST /v1/services`, que o frontend já usa em `BffServiceCatalogService`. Editar ou desativar serviço adicional continua em Serviços. O serviço do onboarding continua o mesmo depois de criar outros (evidência 6).

## Fora do escopo

- QA O-17, O-18, O-19, O-20, O-21 e O-22 (início do bloco "Sua agenda" e importação no onboarding): Goal066.
- QA O-07, O-10, O-11, O-12, O-13, O-23, O-25, O-27, O-29, O-32, O-36, O-37, O-39, O-42 e a busca por CEP de O-15 (fidelidade ao protótipo): Goal072.
- Consentimento, QR, código e teste real (Goals 063 e 071), além do que o §7 pede na introdução do WhatsApp e em contatos ignorados.
- Mudar `POST /v1/onboarding/complete`, as regras de conclusão, a ativação da IA, `apps/scheduling-service/` ou o modelo de dados. Nenhuma migration.
- Editar nome da pessoa (observação 4 do review064, dirigida ao Goal067).
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059 a 064, 070 e 071 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal025-account-purge` (observação 1 do review071) ou `goal008-agenda` (observação 4 do review059) reprovarem em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas dos achados listados em "Objetivo e posição" no [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md), seções 2a, 2c, 2d, 2e, 2f e 2g;
- no vault: `03-UX-UI/04-Especificacao-das-Telas.md` §"Onboarding"; `02-Fluxos/01-Onboarding.md` §1, §2, §3, §5A e §6; as perguntas 44 e 780 de `04-Referencia/99-Perguntas-e-Respostas.md`;
- no protótipo, só como referência de texto e de ordem: as telas 0, 1.1 a 1.3 e 2.3 a 2.7 de `docs/design-reference/claude-design/prototype/project/Onboarding-1-Negocio-e-Agenda.dc.html`, e a 4.1 de `Onboarding-3-IA-e-WhatsApp.dc.html`;
- `apps/frontend/src/features/onboarding/` (doze arquivos, o maior com 363 linhas) e a seção do onboarding em `apps/frontend/src/shared/styles/atendly.css`;
- `apps/frontend/src/features/services/ServiceForm.tsx` (tipos de preço e regra de valor) e `apps/frontend/src/data/services/BffServiceCatalogService.ts`;
- como modelo de validação inline, `apps/frontend/src/features/auth/AuthScreen.tsx` (D-082, item 5);
- `apps/bff/src/modules/onboarding/routes.ts`, `apps/bff/src/lib/onboarding-state.ts` e a seção de onboarding de `apps/bff/PUBLIC_API_V1.md`;
- os testes existentes que montam o onboarding, em `apps/frontend/tests/` (procure por `OnboardingScreen` e `onboarding`), e os de integração do BFF que chamam `PATCH /v1/onboarding`;
- `apps/frontend/e2e/routes.ts`, `apps/frontend/e2e/authenticated-matrix.spec.ts` e o trecho de semeadura de `scripts/goal033-authenticated-ui-rehearsal.mjs`.

## Pontos de implementação

- `apps/bff/src/modules/onboarding/routes.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `packages/public-api-contract/`, só se o corpo de `PATCH /v1/onboarding` estiver descrito lá.
- `apps/frontend/src/features/onboarding/` e a seção do onboarding em `apps/frontend/src/shared/styles/atendly.css`.
- As páginas de `apps/frontend/src/app/onboarding/`, só se o redirecionamento de rota antiga pedir.
- `apps/frontend/e2e/routes.ts`, `apps/frontend/e2e/authenticated-matrix.spec.ts` (ou um spec novo do onboarding) e `scripts/goal033-authenticated-ui-rehearsal.mjs`.
- Testes novos com prefixo `goal065-` em `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Tipos de preço no onboarding (BFF)

- `PATCH /v1/onboarding` aceita `service.priceType` em `FIXED`, `STARTING_AT`, `ON_REQUEST` e `NOT_INFORMED`.
- `FIXED` e `STARTING_AT` exigem `price` numérico não negativo. `ON_REQUEST` e `NOT_INFORMED` gravam `price` nulo. Violação responde `400 VALIDATION_ERROR` com o campo, antes de chamar o Scheduling.
- `GET /v1/onboarding` devolve o tipo gravado.
- As outras seções do `PATCH` não mudam.

### 2. Boas-vindas e casca (frontend)

- Boas-vindas conforme "Escolhas de desenho", na sequência e no progresso.
- "Sair" com estilo de botão do design system em todas as larguras e um único nome acessível, "Sair". Sem `::after` com texto.
- A etapa de Boas-vindas é a de entrada da conta nova. Retomar o onboarding depois de qualquer gravação leva à primeira etapa pendente, nunca à Boas-vindas.

### 3. Seu negócio em três etapas (frontend)

- **Segmento + nome:** segmento primeiro, os oito chips (sete segmentos e "Outro") sempre visíveis e quebrando linha, com `aria-pressed`; "Outro" abre o campo curto como hoje. Depois, "Como seus clientes conhecem você?", com a ajuda "Pode ser seu nome ou o nome do seu negócio.". Título "Vamos começar pelo seu negócio" e eyebrow "Seu negócio".
- **Modalidade:** "Onde você atende?", "Pode escolher mais de uma opção.", seleção múltipla com o estado exposto ao leitor de tela, e o texto do protótipo: "A domicílio · Você vai até o cliente".
- **Endereço:** só com "Local próprio". Etapa própria, campo único, obrigatório nessa condição.
- Cada etapa grava ao continuar e só avança com `200`.
- `nextRequiredStep` retoma na primeira das três que estiver pendente.

### 4. Validação inline em todas as etapas (frontend)

- O formulário do onboarding ganha `noValidate`. Nenhuma etapa chama `checkValidity` nem `reportValidity`.
- Cada campo obrigatório, numérico ou de horário inválido mostra o erro no próprio campo, com `aria-invalid`, texto ligado por `aria-describedby` e foco no primeiro inválido. Todos os erros do envio aparecem juntos.
- Erro de escolha (nenhum segmento, nenhuma modalidade, nenhum dia) fica ligado ao grupo.
- Horário final antes do inicial marca o campo final (QA O-33).
- Erro de validação devolvido pelo servidor cai no campo correspondente, com texto de tela.

### 5. Primeiro serviço e serviços adicionais (frontend)

- **Primeiro serviço** numa etapa só: nome, duração e preço. O preço tem os quatro tipos: "Fixo", "A partir de", "Sob consulta" e "Sem preço". O valor só é pedido para os dois primeiros. Serviço novo começa em "Fixo". Serviço existente mostra o tipo gravado.
- `onboardingPriceType` e toda conversão de tipo saem do caminho de leitura e de escrita.
- **Serviços adicionais**, etapa opcional logo depois: lista os serviços ativos (nome, duração, preço no texto de tela). "Adicionar outro serviço" abre o mesmo formulário e cria por `POST /v1/services`. "Continuar" segue sem exigir nenhum adicional.
- Depois de criar adicionais, o serviço mostrado e editado em "Primeiro serviço" continua o mesmo, pelo `id`.

### 6. Dias, horários e resumo (frontend)

- Os dias aparecem de segunda a domingo. Os valores de `dayOfWeek` gravados não mudam.
- Horários: um intervalo-base para todos os dias, e a ação "Personalizar dias diferentes", que mostra início e fim por dia escolhido. Grava uma regra por dia com o intervalo daquele dia.
- Ao retomar, a tela reconstrói os intervalos por dia do que está gravado. Não usa só a primeira regra.
- "Agenda pronta" mostra serviço, duração, preço (pelo tipo), dias e horário, e não mostra texto de desenvolvimento nem "Fonte oficial".

### 7. Textos, introdução do WhatsApp e contatos ignorados (frontend)

- Nos textos das etapas do onboarding, a automação se chama "IA". "Atendly" fica só como nome da plataforma. O título do estilo passa a "Como a IA deve conversar?".
- A introdução do WhatsApp diz "Só um número por negócio." Os botões "Conectar meu WhatsApp" e "Fazer isso depois" ficam empilhados em largura total no celular, com "Conectar meu WhatsApp" como principal.
- Em contatos ignorados, número recusado por validação mostra no campo o formato esperado, sem "Tente novamente". Falha de rede ou `5xx` continua com a mensagem de tentar de novo.

### 8. O onboarding entra no gate renderizado autenticado

- O ensaio `scripts/goal033-authenticated-ui-rehearsal.mjs` semeia uma **segunda conta**, pelas rotas do produto, que para no meio do onboarding. A conta existente e as medidas dela não mudam.
- O gate mede, nas cinco larguras e com a mesma régua de `e2e/measure.ts`, cada etapa tocada por este Goal:
  - Boas-vindas;
  - Segmento + nome;
  - Modalidade;
  - Endereço;
  - Primeiro serviço;
  - Serviços adicionais;
  - Dias de atendimento;
  - Horários, com "Personalizar dias diferentes" aberto;
  - Agenda pronta;
  - introdução do WhatsApp.
- A sessão vem do formulário de `/login`, como na conta existente. Cada etapa só é medida depois de um marcador de conteúdo próprio.
- Nas cinco larguras, o gate afirma que os oito chips de segmento estão inteiros dentro da largura, sem rolagem horizontal.
- Os estados de erro das etapas ficam no jsdom. O gate não os mede, e o relatório diz isso.
- `AUTHENTICATED_ROUTES` não perde rota. A conta nova não entra em `KNOWN_*` nem ganha exceção de medida.

### 9. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `76293d0`.

1. **BFF, contra PostgreSQL real** (suíte de integração do BFF):
   - `PATCH /v1/onboarding` com cada um dos quatro tipos: `200`, e `GET /v1/onboarding` devolve o mesmo tipo e o preço certo (nulo para `ON_REQUEST` e `NOT_INFORMED`);
   - `STARTING_AT` sem `price` e `FIXED` com `price` negativo: `400` com o campo, e o serviço gravado não muda;
   - depois de criar dois serviços por `POST /v1/services`, `GET /v1/onboarding` devolve o mesmo `service.id` de antes.
2. **Frontend (jsdom):**
   - conta nova entra em Boas-vindas; conta com qualquer seção gravada retoma na primeira etapa pendente, nunca em Boas-vindas;
   - as três etapas de "Seu negócio" gravam na ordem, e o endereço só aparece com "Local próprio";
   - os chips têm `aria-pressed` e só o escolhido fica `true`;
   - "Sair" tem um nome acessível só;
   - envio vazio de cada etapa com campo mostra todos os erros juntos, com `aria-invalid` e `aria-describedby`, foco no primeiro, e nada é gravado;
   - o primeiro serviço grava e relê cada um dos quatro tipos; um serviço lido como `STARTING_AT` continua `STARTING_AT` ao gravar;
   - serviços adicionais chama `POST /v1/services`, lista o criado e não troca o serviço de "Primeiro serviço";
   - "Personalizar dias diferentes" grava uma regra por dia com o intervalo de cada dia, e a retomada mostra esses intervalos;
   - a semana começa na segunda;
   - "Agenda pronta" mostra preço, dias e horário, e não contém "próxima etapa do produto" nem "Fonte oficial";
   - nenhum texto das etapas usa "Atendly" como nome da automação, e nenhum contém "token", "API", "HTTP", "VALIDATION_ERROR" ou código cru;
   - contatos ignorados com `400 VALIDATION_ERROR` mostra o formato esperado e não contém "Tente novamente".
3. **Gate renderizado:** as etapas do §8 passam nas cinco larguras dentro de `validate:integration`, com **0** retentativas.

Os testes existentes continuam passando. Só muda asserção que dependa de:

- rota ou ordem de etapa;
- validação nativa;
- tipo de preço convertido;
- o texto trocado.

O relatório lista cada asserção mudada, com o motivo.

### 10. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. `service.priceType` do `PATCH` volta a `FIXED` e `ON_REQUEST`: o teste de quatro tipos do §9.1 reprova.
2. `draftFromState` volta a converter o tipo pelo par mais próximo: o teste de `STARTING_AT` do §9.2 reprova.
3. O formulário do onboarding volta a chamar `reportValidity`: o teste de todos os erros juntos do §9.2 reprova.
4. A gravação de horários volta a mandar o mesmo intervalo para todos os dias: o teste de horário por dia do §9.2 reprova.
5. `nextRequiredStep` volta a devolver `dados-do-negocio` para conta nova: o teste de Boas-vindas do §9.2 reprova.
6. `.chip-row` do onboarding volta a `nowrap` com rolagem horizontal: a medida dos oito chips do §8 reprova a 360 px. Basta rodar o passo do gate autenticado de `validate:integration`, e o relatório diz o comando usado.

### 11. O que só uma pessoa confere

- Que o onboarding percorrido num aparelho real segue o vault de ponta a ponta, com a conta nova.
- Que as etapas batem com o protótipo aprovado (Goal072).

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 12. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: os quatro tipos de preço em `PATCH /v1/onboarding` e a regra do valor.
- [DECISIONS](../DECISIONS.md) ganha **D-083** em `PROPOSED`, no formato de D-076 a D-082. Ela diz:
  - a sequência do onboarding que o produto passa a seguir, com o bloco "Sua agenda" ainda como está (Goal066);
  - Boas-vindas sem gravação;
  - os quatro tipos de preço sem conversão;
  - serviços adicionais por `POST /v1/services`;
  - horário por dia;
  - endereço sem CEP;
  - a entrada do onboarding no gate autenticado.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§44**, sem reescrever §4 a §43. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram:
  - a sequência nova;
  - o tipo de preço;
  - o horário por dia;
  - as etapas medidas pelo gate;
  - a conferência humana pendente;
  - as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, porque o Goal064 perdeu duas rodadas com evidência entregue em partes:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os seis controles do §10.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.

### 13. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `apps/bff/src/clients/`, `tools/ia-loop/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`.
- No BFF, só `modules/onboarding/routes.ts`, `PUBLIC_API_V1.md` e testes.
- Em `scripts/`, só a semeadura da segunda conta no ensaio do Goal033.
- Nenhuma migration. Não acrescenta chamada `this.http.` (segue **42**).
- Não muda `POST /v1/onboarding/complete`, a ativação da IA, o painel de conexão do WhatsApp nem o teste real.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES` ou `AUTHENTICATED_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte. Teste de etapa que deixa de existir é substituído por teste da etapa que a substitui, e o relatório diz qual substitui qual.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. `PATCH /v1/onboarding` grava e devolve os quatro tipos de preço, recusa valor incoerente sem gravar, e criar serviços adicionais não troca o serviço do onboarding. Provado por execução do §9.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. Conta nova entra em Boas-vindas, "Seu negócio" tem três etapas na ordem do vault, e a retomada vai à primeira etapa pendente. Provado por execução jsdom do §9.2.
3. Nenhuma etapa usa balão nativo; os erros aparecem juntos, no campo, com `aria-invalid` e `aria-describedby`. Provado por execução jsdom do §9.2.
4. O primeiro serviço tem os quatro tipos sem conversão, e serviços adicionais cria e lista sem trocar o serviço do onboarding. Provado por execução jsdom do §9.2.
5. Horário por dia é gravado e relido; a semana começa na segunda; o resumo é completo e sem texto de desenvolvimento. Provado por execução jsdom do §9.2.
6. Os textos chamam a automação de "IA"; a introdução do WhatsApp diz "Só um número por negócio."; contatos ignorados explica o formato. Provado por execução jsdom do §9.2.
7. Largura, toque, contraste, foco e movimento das etapas do §8 são decididos pelo gate autenticado dentro de `validate:integration`, nas cinco larguras, com os oito chips inteiros. Os estados de erro não são medidos pelo gate renderizado.
8. `PUBLIC_API_V1.md` descreve os quatro tipos no `PATCH` do onboarding. Provado por diff e por execução de `test:gate`.
9. Os seis controles negativos do §10 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
10. Typecheck e lint de `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **87**/**854**; integração do BFF **52**/**424**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **75** testes mais os das etapas do §8, e **0** retentativas. Provado por execução.
11. D-083 em `PROPOSED`, FINAL_AUDIT §44, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §11 não foi feita. Provado por diff contra a execução.
12. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que as etapas batem com o protótipo aprovado (Goal072, conferência humana);
- que os estados de erro das etapas cumprem largura, toque, contraste, foco e movimento;
- o bloco "Sua agenda" e a importação no onboarding (Goal066).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | BFF: quatro tipos de preço no `PATCH /v1/onboarding`, `PUBLIC_API_V1.md` e testes `goal065-` do BFF (§1, §9.1) |
| WU-02 | STANDARD | — | Boas-vindas, casca, "Seu negócio" em três etapas, validação inline e retomada, com testes jsdom (§2, §3, §4) |
| WU-03 | STANDARD | WU-01, WU-02 | Primeiro serviço com quatro tipos, serviços adicionais, dias, horário por dia e resumo, com testes jsdom (§5, §6) |
| WU-04 | STANDARD | WU-03 | Textos com "IA", introdução do WhatsApp e contatos ignorados, com testes jsdom (§7) |
| WU-05 | STANDARD | WU-04 | Segunda conta no ensaio e etapas do onboarding no gate autenticado (§8) |
| WU-06…WU-10 | DETERMINISTIC | WU-05 | typecheck e lint de `apps/bff` e `apps/frontend`, testes dirigidos `goal065` do frontend |
| WU-11 | DETERMINISTIC | WU-06…WU-10 | validate-core |
| WU-12…WU-14 | DETERMINISTIC | WU-11 | gate-tests, validate-ui e validate-integration |
| WU-15 | STANDARD | WU-12, WU-13, WU-14 | Controles negativos (§10) e documentação (§12), depois da execução final |
| WU-16 | DETERMINISTIC | WU-15 | git-diff-check final |

Os testes `goal065-` do BFF e o gate autenticado rodam dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
