# Goal 067 — Configurações completas

**Status: ACCEPTED.** Preparado em 2026-09-28 pelo Tech Lead Agent após [Goal066 ACCEPTED](../reviews/066-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v87 acrescentou a observação 2 do [review063](../reviews/063-review.md), e a v89 a observação 4 do [review064](../reviews/064-review.md). A v91 precisa o escopo com evidência conferida no código da baseline e **divide** a linha: a política de cancelamento de S-06 e "Como você vê a agenda" (S-08) vão para o novo **Goal073**, porque não existem em camada nenhuma e pedem dado novo, migration e regra na IA.

## Baseline aceita

Baseline aceita: `a069d77f6dd1c7621edb032d6b606b3546016383`

Goal anterior: 066 — A importação entra no onboarding

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal066 já integrado em `main` (origem `0ceb42b068795afb20367805e40a13fb43b5489f`). **Duas rodadas**, com 8 e 0 blockers. **D-084** foi aceita e [FINAL_AUDIT §45](../FINAL_AUDIT.md) escrita sem reescrever §4 a §44. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O commit documental seguinte, `80b85c2`, só passa o status do documento do Goal066 para `ACCEPTED` e não é a baseline. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review066](../reviews/066-review.md), rodada 2: `test:gate` **233**; `test:frontend` **92** arquivos e **958** testes; integração do BFF **53** arquivos e **428** testes; integração do Scheduling **16** arquivos e **124** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `audit:static` **33** de **34**, **1** pulada; `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **140** `expected`, **0** `unexpected`, **0** `flaky` e **0** retentativas.

## Objetivo e posição

Deixar Configurações completas conforme o vault: as regras de oferta de horário têm tela, a disponibilidade é por dia, o texto da IA volta a aparecer, toda subpágina é alcançável no celular, a pessoa edita o próprio nome e nenhuma tela mostra texto interno. Fonte do produto: `docs/product-vault/03-UX-UI/04-Especificacao-das-Telas.md` §"Mais / Configurações" (Negócio, Agenda, IA, Conversas / Retenção, Conta).

Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA S-06** (ALTA), **só a parte das regras de oferta**: antecedência mínima, limite no futuro e intervalo entre horários oferecidos não têm tela.
- **QA S-04** (ALTA): o texto de "Outras informações importantes" não é reexibido, e salvar de novo apaga o que não foi reescrito.
- **QA S-07**: um horário só para a semana toda; não dá para ter sábado mais curto nem intervalo de almoço.
- **QA M-01**: Disponibilidade e retenção de conversas inalcançáveis no celular.
- **QA M-02** e **QA L-09**: "Ajuda" é item morto, no "Mais" e no menu da conta.
- **QA S-01**: abort do efeito tratado como erro permanente em `ProductSettingsScreen`.
- **QA S-03**, **QA S-05**, **QA S-10** e **QA NT-03**: texto interno e título colado na descrição.

Fecha também:

- a **observação 2 do [review063](../reviews/063-review.md)**: salvar o estilo com a IA desligada marca a execução do teste como usada e tira dela a autoativação;
- a **observação 4 do [review064](../reviews/064-review.md)**: conta anterior ao Goal064 fica sem nome, e não há onde informá-lo depois do cadastro.

**Não fecha**, e diz isso no relatório: a política de cancelamento de S-06 e **QA S-08** ("Como você vê a agenda"), que passam ao Goal073. QA S-02 e QA S-09 já foram fechados pelos Goals063 e 059.

A posição é a da v78, logo depois do 066. O 066 não tocou Configurações e não trouxe evidência para reordenar.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **As regras de oferta já existem de ponta a ponta, menos na tela.** `CalendarSettings` do Scheduling tem `minLeadMinutes` (padrão 0), `maxLeadDays` (padrão 90) e `granularityMinutes` (padrão 30), aplicados pelo motor de disponibilidade (`atendly-availability.ts`). `PATCH /v1/settings/availability` aceita os três, e ausentes preservam o valor gravado; `GET /v1/settings` devolve os três dentro de `availability` (`apps/bff/PUBLIC_API_V1.md`, perto da linha 277). `BffSettingsService.ts` já tipa os campos. Nenhuma tela de `apps/frontend/src/features` os mostra ou grava.
2. **Mas o corpo de `PATCH /v1/settings/availability` exige `rules`, e a gravação substitui a grade inteira.** O `PATCH /internal/availability-settings` do Scheduling faz `availabilityRule.deleteMany` e depois `createMany` com o que veio. Quem grava só as regras de oferta precisa reenviar a grade lida, sem mudança, ou apaga a disponibilidade.
3. **A política de cancelamento não existe em camada nenhuma.** Nenhum campo, nenhuma rota e nenhuma regra da IA. O vault diz que ela é regra global do negócio, com padrão "cancelar ou remarcar a qualquer momento" (perguntas 99 e 100 de `99-Perguntas-e-Respostas.md`), que é o comportamento de hoje. A especificação de Configurações › Agenda do vault não a lista; o protótipo sim. Por isso ela vai para o Goal073, com "Como você vê a agenda" (QA S-08), que também não tem dado nem rota.
4. **A disponibilidade só grava um horário para todos os dias.** `AvailabilitySettings.tsx` tem `fitsSingleIntervalForm`: se algum dia tem mais de um intervalo, ou se os dias têm horários diferentes, o formulário não representa a grade. O Scheduling aceita até **28** regras e recusa sobreposição (`assertNonOverlappingRules`). O onboarding do Goal065 já grava horário por dia, e a importação do Goal062 pode trazer dois intervalos no mesmo dia (08–12 e 13–19, QA IM-09).
5. **O texto de "Outras informações importantes" é gravado e nunca lido.** `OtherInfoSection.tsx` diz, em comentário e na tela, que "o conteúdo salvo não é reexibido". Só existe `PUT /v1/knowledge/other-info` (BFF) e `PUT /internal/knowledge/other-info` (orquestrador). O orquestrador guarda o texto como o único chunk do documento `BUSINESS_INFO` ativo de `source` `business-info/other-important-information` (`knowledge-document-service.ts`, `saveOtherInfo`), então ele pode ser devolvido sem mudança de modelo.
6. **Pausar com a IA já desligada consome a prova.** Em `PATCH /v1/settings/ai` (`apps/bff/src/modules/settings/routes.ts`), o ramo `enabled: false` grava a execução válida corrente em `activatedByRunId` sem olhar o `enabled` gravado. A tela manda `enabled: false` ao salvar só o estilo com a IA desligada, e a reconciliação de `apps/bff/src/lib/ai-activation.ts` deixa de ligar a IA com essa execução.
7. **O nome existe e não tem rota de escrita fora do cadastro.** `User.name` é opcional desde o Goal064, e nulo para conta anterior. Nenhuma rota de `apps/bff/src/modules/account/` ou `modules/auth/` o altera depois de `POST /v1/auth/register`, e `AccountSettings.tsx` não o mostra.
8. **O "Mais" do celular não chega a Disponibilidade nem a Conversas.** `MORE_DESTINATIONS` (`apps/frontend/src/shared/layout/navigation.ts`) tem Notificações, Serviços, Negócio, Agenda, IA, WhatsApp, Importação e Conta. `SettingsHub` tem Disponibilidade (só com `calendar.source` `ATENDLY`) e Conversas, mas o hub não está no "Mais". `CalendarSettings` não aponta para Disponibilidade.
9. **"Ajuda" não tem destino.** `AppShell.tsx` desenha "Ajuda" como `span` com `aria-disabled`, no menu da conta e na folha do "Mais". Não há rota nem conteúdo de ajuda no produto, e a especificação de "Mais / Configurações" do vault não a lista.
10. **Texto interno e títulos colados.** `ToneChoice` (`features/settings/shared/fields.tsx`) diz "Tom permitido na V1." em cada estilo. `CalendarSettings` diz "Fonte oficial configurada" e "A troca de origem exige migração assistida e não é um toggle nesta tela.". `ReminderSettingsSection` ("Pedir confirmação de presença") e `NotificationPreferenceSection` ("Agendamento criado pela IA") põem título e descrição sem separação visível.
11. **`ProductSettingsScreen` trata abort como erro.** O `.catch(() => setError(true))` de `settings.get` também pega o abort do cleanup do efeito. `ReminderSettingsSection` já faz o certo (`if (controller.signal.aborted) return;`).
12. **O gate autenticado mede três telas de Configurações.** `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`) tem `/configuracoes`, `/configuracoes/ia` e `/configuracoes/whatsapp`. `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta` não são medidas.

## Escolhas de desenho desta passada

- **Regras de oferta em Configurações › Agenda**, como no vault. Três escolhas, com as opções do protótipo `Mais-Negocio-Agenda-IA`:
  - "Com quanta antecedência a IA pode marcar": 1 h, 2 h, 4 h, 1 dia;
  - "Até quando no futuro": 30, 60, 90 dias;
  - "Intervalo entre horários oferecidos": 15 min, 30 min, 1 h, com o exemplo do protótipo.
  - O valor gravado sempre aparece selecionado. Se ele não for uma das opções (por exemplo, `minLeadMinutes` **0**, o padrão), a tela mostra esse valor como mais uma opção, com texto de produto ("Sem antecedência mínima"), e nunca o troca sem ação da pessoa.
- **Gravar as regras de oferta nunca mexe na grade.** A tela envia `PATCH /v1/settings/availability` com o `timezone` e as `rules` do último estado lido, sem mudança, mais os três campos. O BFF e o Scheduling não mudam. O teste prova que a grade lida é a grade enviada.
- **Disponibilidade por dia**, em `/configuracoes/disponibilidade`. Cada dia da semana liga ou desliga e tem um ou mais intervalos, com "Adicionar intervalo" e "Remover". A tela representa **qualquer** grade que o Scheduling devolve; `fitsSingleIntervalForm` deixa de recusar grade. Sobreposição no mesmo dia e início depois do fim são recusados na tela, com validação inline, antes do envio. Regras inativas lidas são reenviadas como estão: nenhuma regra some sem ação da pessoa. O limite de **28** regras do Scheduling é respeitado pela tela.
- **"Outras informações importantes" reexibe o texto.** Nova leitura `GET /v1/knowledge/other-info` (BFF) sobre `GET /internal/knowledge/other-info` (orquestrador), que devolve o texto do documento ativo, ou vazio quando não existe. A caixa abre com o texto salvo. Salvar grava o que a caixa mostra. O aviso "não é reexibido" sai.
- **Pausar só marca a execução quando a IA estava ligada.** No ramo `enabled: false` de `PATCH /v1/settings/ai`, `activatedByRunId` só é gravado se o `enabled` gravado era `true`. Salvar o estilo com a IA desligada troca só o estilo.
- **Nome da pessoa em Configurações › Conta.** Nova rota `PATCH /v1/account/profile` com `{ name }`, com a mesma validação do nome em `POST /v1/auth/register` (Goal064), os mesmos pre-handlers de escrita autenticada que `/v1/auth/password` usa, e escrita só no `User` da sessão. A tela Conta mostra o nome, ou um convite a informá-lo quando é nulo, e permite editar. O cumprimento da Home passa a usar o nome gravado.
- **"Mais" completo no celular.** `MORE_DESTINATIONS` ganha Disponibilidade (com a mesma condição do hub, `calendar.source` `ATENDLY`, se a folha tiver acesso a essa informação; senão, sem condição) e Conversas. `CalendarSettings` ganha um link para Disponibilidade.
- **"Ajuda" sai** do menu da conta e da folha do "Mais". Não há destino, e item morto viola `AGENTS.md`.
- **Texto de produto.** Cada estilo da IA diz o que o estilo faz, sem "V1" nem "tools". Configurações › Agenda diz que a agenda é a da Atendly, sem "fonte oficial" nem "migração assistida". Título e descrição de cada linha de liga/desliga ficam separados, visual e no nome acessível.

## Fora do escopo

- **Política de cancelamento** e **QA S-08** ("Dias visíveis" e "Visualização inicial"): Goal073.
- Mudar o Scheduling, o motor de disponibilidade, as regras de oferta ou o modelo de dados. **Nenhuma migration.**
- Mudar `PATCH /v1/settings/availability`, `PUT /v1/knowledge/other-info`, `POST /v1/auth/register` ou as rotas de senha.
- Ativação da IA, teste real, painel do WhatsApp, retenção (`RetentionSection`), lembretes além do texto, importação e onboarding.
- As observações 1 e 2 do [review066](../reviews/066-review.md) (guard de `/onboarding/importacao` sem `calendar.source`, `<h2>` dentro de `<button>`): Goal072.
- Fidelidade visual de Configurações ao protótipo além do que este Goal cria. Marca, telas de entrada e Home: Goal068.
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059 a 066, 070 e 071 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md). Se `goal025-account-purge` (observação 1 do review071), `goal008-agenda` (observação 4 do review059) ou o `net::ERR_NO_BUFFER_SPACE` do gate autenticado (observação 1 do review065) aparecerem em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas de QA S-01, S-03 a S-08, S-10, NT-03, M-01, M-02 e L-09 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- no vault: `03-UX-UI/04-Especificacao-das-Telas.md` §"Mais / Configurações"; as perguntas 99 e 100 de `04-Referencia/99-Perguntas-e-Respostas.md`, só para confirmar que a política de cancelamento fica fora;
- no protótipo, só como referência de texto e de opções: as seções Agenda, Disponibilidade e IA de `docs/design-reference/claude-design/prototype/project/Mais-Negocio-Agenda-IA.dc.html` e a seção Conta de `Mais-WhatsApp-Importacao-Conta.dc.html`;
- `apps/frontend/src/features/settings/` (`CalendarSettings.tsx`, `AvailabilitySettings.tsx`, `AiSettings.tsx`, `AccountSettings.tsx`, `ProductSettingsScreen.tsx`, `SettingsHub.tsx`, `shared/fields.tsx`, `shared/labels.ts`), `features/knowledge/OtherInfoSection.tsx`, `features/reminders/ReminderSettingsSection.tsx`, `features/notifications/NotificationPreferenceSection.tsx`;
- `apps/frontend/src/shared/layout/navigation.ts` e `AppShell.tsx`; `apps/frontend/src/data/services/BffSettingsService.ts` e o serviço de conhecimento;
- `apps/bff/src/modules/settings/routes.ts` (rotas `/v1/settings/ai` e `/v1/settings/availability`), `apps/bff/src/modules/knowledge/routes.ts`, `apps/bff/src/clients/ai-orchestrator/index.ts` (chamada de `other-info`), `apps/bff/src/modules/account/routes.ts` e a validação do nome em `modules/auth/`;
- `apps/ai-orchestrator/src/modules/internal/routes.ts` (rota `other-info`) e `modules/knowledge/knowledge-document-service.ts` (`saveOtherInfo`);
- `apps/bff/PUBLIC_API_V1.md`, nas seções de conhecimento, settings e conta;
- `apps/frontend/e2e/routes.ts`, na parte de `AUTHENTICATED_ROUTES`;
- os testes que montam essas telas em `apps/frontend/tests/` e os testes das rotas tocadas no BFF e no orquestrador.

## Pontos de implementação

- `apps/frontend/src/features/settings/`, `features/knowledge/OtherInfoSection.tsx`, `features/reminders/ReminderSettingsSection.tsx` (só texto e separação), `features/notifications/NotificationPreferenceSection.tsx` (só separação), `shared/layout/navigation.ts`, `shared/layout/AppShell.tsx`, `src/data/` e a seção de Configurações em `shared/styles/`.
- `apps/frontend/e2e/routes.ts`.
- `apps/bff/src/modules/settings/routes.ts`, `modules/knowledge/routes.ts`, `modules/account/`, `clients/ai-orchestrator/index.ts` e `PUBLIC_API_V1.md`.
- `apps/ai-orchestrator/src/modules/internal/routes.ts` e `modules/knowledge/knowledge-document-service.ts`.
- Testes novos com prefixo `goal067-` em cada app tocado.

## Escopo obrigatório

### 1. Leitura de "Outras informações importantes" (orquestrador e BFF)

- `GET /internal/knowledge/other-info` no orquestrador devolve o texto do documento `BUSINESS_INFO` ativo de `source` `business-info/other-important-information` do tenant do contexto, ou vazio quando não há documento. Nunca lê documento de outro tenant.
- `GET /v1/knowledge/other-info` no BFF, autenticado como `PUT /v1/knowledge/other-info`, repassa a leitura. A chamada nova do cliente do orquestrador segue o padrão das chamadas vizinhas.
- `PUBLIC_API_V1.md` documenta a rota nova, por acréscimo, no parágrafo do documento `BUSINESS_INFO`.

### 2. Pausar e nome da pessoa (BFF)

- `PATCH /v1/settings/ai` com `enabled: false` só grava `activatedByRunId` quando o `enabled` gravado era `true`. Os demais ramos não mudam.
- `PATCH /v1/account/profile` conforme "Escolhas de desenho". Nome vazio, só espaços ou fora do limite do cadastro é recusado com o erro de validação de sempre. Sem sessão, `401`. Escrita só no `User` da sessão.
- `PUBLIC_API_V1.md` documenta a rota nova e a regra de pausa, por acréscimo.

### 3. Agenda e Disponibilidade (frontend)

- Regras de oferta em Configurações › Agenda, conforme "Escolhas de desenho", gravadas sem mexer na grade.
- Disponibilidade por dia, com um ou mais intervalos, conforme "Escolhas de desenho".
- Configurações › Agenda com texto de produto e link para Disponibilidade.
- `ProductSettingsScreen` ignora o abort do cleanup, como `ReminderSettingsSection`.

### 4. IA, Conta e navegação (frontend)

- `OtherInfoSection` abre com o texto salvo, lido pela rota nova; falha de leitura mostra erro de tela e não apaga nada.
- Estilos da IA sem "V1" e sem "tools".
- Configurações › Conta mostra e edita o nome.
- `MORE_DESTINATIONS` com Disponibilidade e Conversas. "Ajuda" sai dos dois menus.
- Título e descrição separados em cada linha de liga/desliga de Configurações e Notificações.

### 5. O gate renderizado mede as telas tocadas

- `AUTHENTICATED_ROUTES` ganha `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta`, cada uma com marcador de conteúdo próprio, nas cinco larguras, com a régua de `e2e/measure.ts` e a sessão da conta principal. Se a conta principal não chegar a Disponibilidade (por `calendar.source`), o Developer para e relata, sem mudar a conta.
- As rotas já medidas continuam medidas. `ONBOARDING_ROUTES` não muda.
- A folha do "Mais" aberta e os estados de erro ficam no jsdom. O relatório diz isso.

### 6. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**, com o SHA `a069d77`.

1. **Orquestrador:** a leitura devolve o texto salvo do tenant; com outro tenant, não devolve.
2. **BFF (integração):** `GET /v1/knowledge/other-info` devolve o que `PUT` gravou; salvar o estilo com a IA desligada e prova válida não grava `activatedByRunId`, e a reconciliação ainda liga a IA com essa prova; pausar com a IA ligada continua gravando; `PATCH /v1/account/profile` grava o nome da sessão, recusa nome inválido e não toca outro `User`.
3. **Frontend (jsdom):**
   - Configurações › Agenda mostra as três regras com o valor lido selecionado, inclusive `minLeadMinutes` **0**; gravar envia as `rules` lidas sem mudança;
   - Disponibilidade mostra uma grade com dois intervalos num dia e horários diferentes entre dias, e grava a grade que mostra; recusa sobreposição e início depois do fim antes do envio;
   - "Outras informações importantes" abre com o texto salvo, sem o aviso de não reexibição;
   - Conta mostra o nome, o convite quando ele é nulo, e grava;
   - o "Mais" tem Disponibilidade e Conversas, e nenhum menu tem "Ajuda";
   - nenhuma tela de Configurações contém "V1", "tools", "Fonte oficial" ou "migração assistida";
   - com abort no cleanup, `ProductSettingsScreen` não mostra "Configurações indisponíveis".
4. **Gate renderizado:** as três rotas novas passam nas cinco larguras dentro de `validate:integration`, com **0** retentativas.

Os testes existentes continuam passando. Só muda asserção que dependa do texto trocado, do formulário único de horário ou do item "Ajuda". O relatório lista cada asserção mudada, com o motivo, e diz qual teste substitui qual.

### 7. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo, e confira a restauração por hash. Cole a **saída real** no relatório:

1. A leitura do orquestrador deixa de filtrar por tenant: o teste de isolamento reprova.
2. O ramo de pausa volta a gravar `activatedByRunId` sem olhar o `enabled` gravado: o teste de estilo com a IA desligada reprova.
3. Gravar as regras de oferta envia `rules: []`: o teste de preservação da grade reprova.
4. Disponibilidade volta a recusar a grade com dois intervalos no dia: o teste de grade por dia reprova.
5. `OtherInfoSection` volta a abrir vazia: o teste de reexibição reprova.
6. Disponibilidade sai de `MORE_DESTINATIONS`: o teste do "Mais" reprova.
7. `PATCH /v1/account/profile` aceita nome só com espaços: o teste de validação reprova.

### 8. O que só uma pessoa confere

- Que Configurações, percorridas num aparelho real, batem com o protótipo `Mais-Negocio-Agenda-IA` e `Mais-WhatsApp-Importacao-Conta` nas opções e nos textos.
- Que a IA, depois de mudar as regras de oferta, oferece horários com a antecedência, o limite e o intervalo escolhidos, numa conversa real.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 9. Documentação

No mesmo diff, por **acréscimo**:

- [DECISIONS](../DECISIONS.md) ganha **D-085** em `PROPOSED`, no formato de D-080 a D-084. Ela diz:
  - que as regras de oferta ganham tela e são gravadas reenviando a grade lida, sem mudar contrato;
  - que a disponibilidade passa a ser por dia, com mais de um intervalo;
  - a leitura nova de "Outras informações importantes";
  - a regra de pausa e `activatedByRunId`;
  - a rota nova do nome;
  - a saída de "Ajuda" e o "Mais" completo;
  - que a política de cancelamento e QA S-08 ficam para o Goal073.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§46**, sem reescrever §4 a §45. Registra os QAs corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o que mudou, as telas medidas pelo gate, a conferência humana pendente e as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate`, de `validate:ui` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- `apps/bff/PUBLIC_API_V1.md`, conforme §1 e §2.
- `apps/frontend/AGENTS.md`, só se descrever Configurações ou o "Mais".
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo.** Toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final.

**Ordem obrigatória, a mesma dos Goals065 e 066:**

1. Rode o vermelho da baseline.
2. Faça a última edição de código.
3. Rode a execução final nesta ordem: `validate:core`, `test:gate`, `validate:ui`, `validate:integration`. `test:gate` precisa do client Prisma que `validate:core` gera.
4. Rode os sete controles do §7.
5. Escreva a prosa só depois disso.

Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. Cada blocker de review tem parte de código e parte de evidência, e as duas são entregues na mesma rodada.

### 10. O que este Goal não pode fazer

- Não toca `apps/scheduling-service/`, `apps/evolution-go/`, `packages/`, `tools/ia-loop/`, `scripts/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Se alguma tela exigir mudança no Scheduling, o Developer para e relata, sem ampliar o escopo.
- No orquestrador, só a leitura do §1. No BFF, só o §1 e o §2.
- **Nenhuma migration.** A chamada nova do BFF ao orquestrador segue o padrão das vizinhas; o relatório diz a contagem de `this.http.` em `apps/bff/src/clients/` antes (**42**) e depois.
- Não muda `PATCH /v1/settings/availability`, `PUT /v1/knowledge/other-info`, `POST /v1/auth/register`, a ativação da IA com prova, o painel do WhatsApp, a retenção nem o onboarding.
- Não afrouxa gate:
  - nenhuma exceção nova em `KNOWN_*`;
  - nenhum passo a menos em `validate:integration` ou `validate:core`;
  - nenhuma regra de `final-production-audit.mjs` relaxada;
  - nenhuma medida do gate renderizado desligada;
  - nenhuma rota tirada de `PUBLIC_ROUTES`, `AUTHENTICATED_ROUTES` ou `ONBOARDING_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Configurações › Agenda mostra e grava antecedência mínima, limite no futuro e intervalo entre horários, com o valor lido sempre representado, e a grade de disponibilidade enviada é a lida. Provado por execução jsdom do §6.3.
2. Disponibilidade representa e grava qualquer grade do Scheduling, por dia e com mais de um intervalo, e recusa sobreposição antes do envio. Provado por execução jsdom do §6.3.
3. "Outras informações importantes" reabre com o texto salvo, só do próprio negócio. Provado por execução do §6.1, §6.2 e §6.3.
4. Salvar o estilo com a IA desligada não consome a prova do teste; pausar com a IA ligada continua consumindo. Provado por execução de integração do §6.2.
5. A pessoa vê e edita o próprio nome em Conta; nome inválido é recusado. Provado por execução do §6.2 e §6.3.
6. No celular, Disponibilidade e Conversas são alcançáveis pelo "Mais", e nenhum menu tem "Ajuda". Provado por execução jsdom do §6.3.
7. Nenhuma tela de Configurações mostra "V1", "tools", "Fonte oficial" ou "migração assistida", e o abort do cleanup não vira erro. Provado por execução jsdom do §6.3.
8. Largura, toque, contraste, foco e movimento de `/configuracoes/agenda`, `/configuracoes/disponibilidade` e `/configuracoes/conta` são decididos pelo gate autenticado dentro de `validate:integration`, nas cinco larguras. A folha do "Mais" e os estados de erro não são medidos pelo gate renderizado.
9. Os sete controles negativos do §7 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
10. Typecheck de `apps/frontend`, `apps/bff` e `apps/ai-orchestrator` e lint de `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **92**/**958**; integração do BFF **53**/**428**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam. O gate autenticado tem pelo menos **140** testes mais os das três rotas novas nas cinco larguras, e **0** retentativas. Provado por execução.
11. D-085 em `PROPOSED`, FINAL_AUDIT §46, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo, depois da execução final e dos controles. Trazem as contagens da execução final e dizem que a conferência humana do §8 não foi feita. Provado por diff contra a execução.
12. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a IA respeita as regras de oferta numa conversa real (conferência humana; o motor que as aplica é do Goal009 e não muda);
- que as telas batem com o protótipo aprovado;
- a política de cancelamento e "Como você vê a agenda" (Goal073).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Leitura de "Outras informações importantes" no orquestrador e no BFF, com teste de isolamento e `PUBLIC_API_V1.md` (§1) |
| WU-02 | STANDARD | — | Regra de pausa e rota do nome no BFF, com testes de integração e `PUBLIC_API_V1.md` (§2) |
| WU-03 | STANDARD | — | Agenda com regras de oferta, Disponibilidade por dia, textos e abort, com testes jsdom (§3) |
| WU-04 | STANDARD | WU-01, WU-02 | IA, Conta, "Mais", "Ajuda" e separação de títulos, com testes jsdom (§4) |
| WU-05 | MECHANICAL | WU-03, WU-04 | Três rotas novas no gate autenticado (§5) |
| WU-06…WU-10 | DETERMINISTIC | WU-05 | typecheck de `apps/frontend`, `apps/bff` e `apps/ai-orchestrator`, lint de `apps/frontend`, testes dirigidos `goal067` |
| WU-11 | DETERMINISTIC | WU-06…WU-10 | validate-core |
| WU-12…WU-14 | DETERMINISTIC | WU-11 | gate-tests, validate-ui e validate-integration |
| WU-15 | STANDARD | WU-12, WU-13, WU-14 | Controles negativos (§7) e documentação (§9), depois da execução final |
| WU-16 | DETERMINISTIC | WU-15 | git-diff-check final |

O gate autenticado roda dentro de `validate:integration`. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa.
