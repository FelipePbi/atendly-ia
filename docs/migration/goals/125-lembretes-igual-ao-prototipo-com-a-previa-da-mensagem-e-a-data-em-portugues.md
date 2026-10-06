# Goal 125 — Lembretes igual ao protótipo, com a prévia da mensagem que a cliente recebe e a data em português

**Status: READY.** Preparado em 2026-10-06 pelo Tech Lead Agent após [Goal124 ACCEPTED](../reviews/124-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: AG2

Linha do [MASTER_PLAN](../MASTER_PLAN.md) **criada e marcada READY na v149**, inserida depois do 124, sem renumerar nem remover ID. Origem: a reavaliação das lacunas visuais sem ID depois do 124. Configurações ficou com N2, N3, AG2 e W3 sem alvo. O AG2 é o único dos quatro com tela própria, rota no gate autenticado e contrato completo: tudo o que o quadro controla já é lido e gravado por `GET` e `PATCH /v1/settings/reminders`. A passada achou também um defeito concreto na mensagem que a cliente recebe: o lembrete sai com a data crua, "no dia 2026-09-16 às 14:30". A prévia do AG2 só é honesta se mostrar a mensagem real, por isso as duas mudanças vão juntas.

## Baseline aceita

Baseline aceita: `562f43b42f38c62d3417c23fc88411c7d910d83b`

Goal anterior: 124 — Desconectar o WhatsApp, reduzir a retenção e excluir a conta iguais ao protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal124 já integrado em `main` (origem `06cc8a57ccec049ecb460587b3d933f8fe5dd5ac`). Foram **duas rodadas**: a rodada 1 teve 4 blockers, resolvidos pela FIX-001; a rodada 2 terminou `CHANGES_REQUIRED` com 2 blockers só de documentação, que o IA Loop adiou para o fechamento, onde foram aplicados só em `docs/migration/`. **D-138** foi aceita: W2 e R2 na `ChatSheetShell` com o foco inicial na ação que não grava (prop opcional `initialFocusSelector`), o C2 como rota `/configuracoes/conta/excluir`, e nenhum passo de captura toca o botão que confirma uma ação gravada. A última contagem aceita: frontend **171** arquivos e **2210** testes, `goal124` **36** (2 arquivos), `visual-responses.test.mjs` **49**, `test:gate` **282**, `validate:core` 17 passos com 15 passando e 2 pulados, `validate:ui` **169** `passed` e 21 pulados, sem retentativa, `validate:integration` **36** de 36 passos, com o gate autenticado em **280** e 0 retentativas. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Critério: **a tela de Lembretes fica igual ao quadro AG2 nos quatro devices**, salvo as divergências declaradas, **com a prévia "Assim chega para a cliente" mostrando o texto que a IA de fato envia**, e **o lembrete e o aviso de alteração passam a dizer a data e a hora em português** ("na sexta-feira, 18/09, às 15h30"), nunca mais a data no formato `AAAA-MM-DD`. O que é gravado em `/v1/settings/reminders` não muda.

**Por que agora.** A fila não tem Goal PLANNED. `targets.json` tem 82 alvos, e 31 dos 113 quadros continuam sem alvo. Fora de Configurações, o que resta pede outra decisão: S1b (cor livre fora de `colorToken`), S5, S6, S8 e S9 (composição de D-114 e guarda de navegação), CL8 e CL9, H6 e NT3 (sinal de IA instável que não existe), NT2 e as etapas do onboarding. Em Configurações:

- **N2** (Negócio · pagamento) pede formas de pagamento e parcelamento que o contrato não tem (`settingsStateSchema` não tem campo de pagamento);
- **N3** (perguntas frequentes) pede o vínculo de cada pergunta a "Geral" ou a um serviço, que os documentos de conhecimento não têm;
- **W3** pede a leitura da lista de contatos ignorados (D-118, divergência 5);
- **AG2** é estado de uma tela que já existe (`/configuracoes/agenda/lembretes`, D-116), com contrato completo.

O lembrete é a única mensagem que a Avenly manda sozinha para a cliente, sem conversa antes. Uma data crua nessa mensagem é o defeito mais visível para quem recebe, e o H-10 já proíbe data ISO nas telas.

## O que a evidência desta passada mostra

Conferido no código da baseline `562f43b` e em `docs/design-reference/claude-design/prototype/project/Mais-Negocio-Agenda-IA.dc.html` (quadro "Agenda · lembretes"), com `Configuracoes-Tablet.dc.html` ("Configurações / Agenda · lembretes / Portrait" e "/ Landscape") e `Configuracoes-Desktop.dc.html` ("Configurações / Agenda · lembretes / Desktop").

1. **AG2 — Lembretes.** No mobile, tela empurrada com "‹", o título "Lembretes" centrado no cabeçalho e o rodapé fixo com "Salvar" (52 px, `#0F5F63`, texto `#F7F4EF`). O corpo, com 20 px entre os blocos:
   - "Lembrete 1 · quanto tempo antes" (13 px, 600, `#5F574E`) e as fichas "48 h", "24 h", "12 h", "2 h" e "Outro": 38 px de altura, raio 10, borda `#D6CEC2`; a marcada com borda de 1,5 px `#0F5F63`, fundo `#EDF4F3`, texto `#0B4A4E` e o check; "Outro" com borda tracejada `#B9B1A6` e texto `#0F5F63`;
   - "Adicionar segundo lembrete": 48 px, raio 14, borda tracejada de 1,5 px `#B9B1A6`, o "+" e o texto `#0F5F63`;
   - o bloco "Pedir confirmação de presença" com fundo `#EDF4F3`, raio 14, a caixa marcada de 24 px em `#0F5F63` e o texto "Se a cliente disser que não vem, a IA pergunta se quer cancelar ou remarcar. Sem resposta, o horário continua valendo.";
   - "Mostrar preço no lembrete" como controle segmentado: trilho `#EFEAE2` com raio 12, "Nunca" e "Só quando for fixo" com 38 px, a opção marcada em `#FFFDFA` com sombra;
   - o cartão "Assim chega para a cliente" (fundo `#FFFDFA`, borda `#E5DED4`, raio 14): o sobretítulo em 11 px maiúsculo `#716859`, o balão `#DCECEB` com texto `#0B2F32` e raio `14px 14px 14px 5px`, e a nota em 12 px `#716859` "Endereço só se ela perguntar. Sem preço, como configurado.".

   A nota do quadro diz: "A prévia mostra a mensagem no estilo da IA — a única forma honesta de configurar um texto que a cliente vai receber."
2. **O app hoje.** `ProductSettingsScreen` (cenário `calendar-reminders`) põe `ReminderSettingsSection` (`features/reminders/ReminderSettingsSection.tsx`) dentro de `SettingsPage`, com a descrição "Configure os lembretes enviados antes de cada agendamento." e um parágrafo de abertura. As fichas são `chip`. O campo "Personalizado (minutos)" aparece sempre. Há os botões "Desativar lembretes", "Remover segundo lembrete" e "Ativar lembretes". A confirmação é um `switch-row` com checkbox. O preço usa duas fichas. Não há prévia. O botão é "Salvar lembretes". Ao falhar a leitura, a seção devolve `null`.
3. **O contrato cobre todo o quadro.** `reminderSettingsSchema` tem `configured`, `confirmationEnabled`, `pricePolicy` (`NEVER` ou `WHEN_FIXED`) e `rules` com até dois itens (`FIRST` e `SECOND`, `leadMinutes` de 1 a 43 200). `rules: []` desliga os lembretes, e o app oferece isso hoje; o quadro não mostra como desligar.
4. **A mensagem real.** `apps/ai-orchestrator/src/modules/reminders/notification-message.ts` monta o texto sem modelo de linguagem: a saudação do estilo, as frases factuais iguais nos três estilos, "Valor: R$ …" quando há preço, e o pedido de confirmação ou o fechamento do estilo, separados por linha em branco. O estilo vem de `settings.ai.tone` (`PROFESSIONAL`, `BALANCED` ou `CASUAL`), com `BALANCED` quando é `null` (`DEFAULT_AI_CONVERSATION_STYLE`). O preço só sai com `pricePolicy` `WHEN_FIXED` e o acordo inteiro com preço fixo. O endereço nunca sai. O texto do balão do quadro ("Lembrete do seu Corte feminino amanhã…") não é o que a IA envia.
5. **A data crua.** `notificationFactualLines` escreve `no dia ${facts.date} às ${facts.time}`. O Scheduling manda `facts.date` como `AAAA-MM-DD` e `facts.time` como `HH:MM`, já no fuso do negócio (`instantToLocalDateTime` em `notification-dispatch-service.ts`). A cliente recebe "Passando para lembrar do seu atendimento de Corte e Escova no dia 2026-09-16 às 14:30." (`tests/reminders/notification-message.test.ts` e `notification-delivery.test.ts` afirmam esse texto). O aviso de alteração e o de cancelamento usam o mesmo trecho. Sem serviço e sem título, `subjectOf` devolve "seu atendimento", e a frase vira "do seu atendimento de seu atendimento".
6. **Leituras que a tela já tem.** `GET /v1/settings` (`settingsStateSchema`) traz `business.timezone` e `ai.tone`, e `ProductSettingsScreen` já tem `settings`. O catálogo de serviços é lido por `getProductServices().serviceCatalog.list()`. Nenhuma das duas precisa mudar.
7. **Rota e captura.** `/configuracoes/agenda/lembretes` está em `AUTHENTICATED_ROUTES` com `contentMarker: "Lembretes"`. `targets.json` não tem o AG2; o AG3 vizinho usa `clock: "13:45"` e nenhum `responses`.
8. **Testes existentes que afirmam o que muda:** `goal021-reminder-settings-section.test.tsx`, `goal021-shell-invariant.test.tsx` e `goal067-configuracoes-ia-conta.test.tsx` no frontend; `tests/reminders/notification-message.test.ts` e `tests/reminders/notification-delivery.test.ts` em `apps/ai-orchestrator`.

## Escolhas de desenho desta passada

1. **Portar, não reinterpretar.** O Developer porta o HTML e o CSS do quadro (valores inline de px, cor, fonte, raio e espaçamento), em cada device: `Mais-Negocio-Agenda-IA.dc.html` no mobile, `Configuracoes-Tablet.dc.html` em Portrait e Landscape, `Configuracoes-Desktop.dc.html` no desktop. A casca de Configurações (D-103, D-116) e a lista de 1024 px em diante, com "Agenda" marcada, não mudam. O CSS novo fica em `shared/styles/avenly-settings.css`, sem mudar o visual de AG1, AG3 e das outras telas de Configurações.
2. **A data e a hora em português na mensagem real** (`notification-message.ts`).
   - O trecho de quando passa de `no dia {date} às {time}` para `{artigo} {dia da semana}, {DD}/{MM}, às {hora}`: "na segunda-feira" a "na sexta-feira", "no sábado", "no domingo". Exemplo: "na sexta-feira, 18/09, às 15h30".
   - A hora vai sem zero à esquerda e com "h": "15h30", "9h05". Minuto zero some: "9h", "14h".
   - O dia da semana sai do próprio `AAAA-MM-DD`, por aritmética de calendário com inteiros (por exemplo, o algoritmo de Sakamoto). Sem `Date`, sem `Intl` e sem fuso, como o comentário do arquivo exige: a data já chega no fuso do negócio, e o arquivo continua sem formatar instante.
   - Se `facts.date` não for `AAAA-MM-DD` válido ou `facts.time` não for `HH:MM`, o trecho continua o de hoje, literal. A mensagem nunca inventa um dia.
   - Sem serviço e sem título, a frase do lembrete fica "Passando para lembrar do seu atendimento {quando}.", e as do aviso, "Seu atendimento {quando} foi cancelado." e "Seu atendimento foi alterado e agora está marcado {quando}.". A repetição "de seu atendimento" some. O resto das frases, as vozes dos três estilos, o preço, a regra de confirmação e o separador não mudam.
3. **A prévia mostra o texto real.**
   - Um módulo novo, `features/reminders/reminderPreview.ts`, monta o texto com as mesmas frases de `notification-message.ts` depois da escolha 2: as três vozes, as frases factuais, "Valor: R$ …" e a mesma regra de confirmação e fechamento.
   - O frontend não importa de `apps/ai-orchestrator`. A cópia é deliberada, e a escolha 9 manda os testes dos dois lados afirmarem o mesmo texto para os mesmos fatos.
   - Os fatos de exemplo:
     - a cliente "Ana";
     - o primeiro serviço ativo de `serviceCatalog.list()`, na ordem da lista de Serviços; sem serviço ou com a leitura falhada, sem serviço (a frase da escolha 2);
     - o dia seguinte ao de hoje no fuso do negócio (`settings.business?.timezone ?? "America/Sao_Paulo"`), às 15:30;
     - o preço do serviço só com `pricePolicy` `WHEN_FIXED` e o serviço com `priceType` `FIXED` e `price` preenchido;
     - o estilo `settings.ai.tone ?? "BALANCED"`;
     - a confirmação conforme a caixa marcada.
   - A prévia acompanha o que a pessoa marca na tela antes de salvar: confirmação, preço e lembretes ligados ou não.
   - O balão mostra as linhas em branco do texto (`white-space: pre-line`).
   - A nota abaixo do balão é "Endereço só se ela perguntar." seguida de "Sem preço, como configurado." com `NEVER`, ou de "Com o valor quando o serviço tem preço fixo." com `WHEN_FIXED`.
   - Com os lembretes desligados (`rules: []`), o balão dá lugar a "Nenhum lembrete é enviado.", no mesmo cartão.
4. **A tela.**
   - Abaixo de 1024 px, tela empurrada com "‹" para `/configuracoes/agenda`, o título "Lembretes" centrado e o rodapé fixo com "Salvar". A partir de 1024 px, o detalhe do quadro com o mesmo rodapé. Continua **uma chamada de `useShellConfig` por árvore renderizada** (D-030, D-031).
   - Saem a descrição de `SettingsPage` e o parágrafo de abertura da seção. Se `SettingsPage` não permitir o cabeçalho do quadro sem mudar as outras telas, o Developer monta a tela como o AG3 (`OfferRulesSettings`) monta a dele e registra em D-139.
   - "Lembrete 1 · quanto tempo antes" com as fichas 48 h, 24 h, 12 h, 2 h e "Outro". As fichas de horas mostram o check quando marcadas e continuam com `aria-pressed`.
   - "Outro" fica marcado quando `leadMinutes` não é um dos quatro valores; tocar nele marca e mostra o campo "Minutos antes", logo abaixo das fichas, com o mínimo de 1 e o máximo de 43 200. O campo fica escondido enquanto uma ficha de horas está marcada. Tocar numa ficha de horas troca o valor.
   - "Adicionar segundo lembrete" como o quadro. Com dois lembretes, o bloco "Lembrete 2 · quanto tempo antes" tem as mesmas fichas e, abaixo, o botão de texto "Remover segundo lembrete".
   - O botão de texto "Desativar lembretes" fica abaixo das fichas do Lembrete 1 e grava `rules: []` ao salvar, como hoje. Com os lembretes desligados, no lugar do Lembrete 1 aparece "Ativar lembretes" com a aparência de "Adicionar segundo lembrete". Os dois são divergências declaradas, porque o quadro não mostra como desligar e o contrato permite.
   - "Pedir confirmação de presença" como o bloco do quadro, com o texto do quadro ("continua valendo"). Continua um `checkbox` nativo com `aria-describedby`; a caixa de 24 px é só visual. Desmarcado, a caixa fica vazia com borda e o bloco continua com o fundo do quadro.
   - "Mostrar preço no lembrete" como o controle segmentado do quadro, com `aria-pressed` em cada opção.
   - O cartão da prévia (escolha 3), abaixo do preço.
5. **O que não muda no salvar.** O corpo do `PATCH` (`confirmationEnabled`, `pricePolicy` e `rules` com `slot` e `leadMinutes`), a validação de 1 minuto a 30 dias com a mensagem de hoje, "Salvando..." durante o pedido e as mensagens "Lembretes salvos." e "Não foi possível salvar os lembretes." em `role="status"`. O botão passa de "Salvar lembretes" a "Salvar". O estado de carregamento continua com `Skeleton`. A leitura falhada continua sem formulário.
6. **Alvo.** `targets.json` ganha o AG2, de `Mais-Negocio-Agenda-IA.dc.html`, com sessão:
   - rota `/configuracoes/agenda/lembretes`, `clock` como o AG3;
   - `responses` com `GET /v1/settings/reminders` devolvendo `configured: true`, `confirmationEnabled: true`, `pricePolicy: "NEVER"` e `rules: [{ "slot": "FIRST", "leadMinutes": 1440 }]`, como o BFF devolve;
   - sem `steps`. Nenhum passo toca "Salvar": `responses` só cobre `GET`, e o toque gravaria na conta visual;
   - as `notes` citam as divergências declaradas.
7. **Gate autenticado.** `/configuracoes/agenda/lembretes` já está em `AUTHENTICATED_ROUTES`. Se o `contentMarker` "Lembretes" deixar de achar a tela, o Developer o troca pelo título novo e nada mais em `e2e/` muda.
8. **Divergências declaradas.**
   - O texto do balão é o que a IA envia (escolha 3), não o do quadro: a saudação e o fechamento do estilo da conta, a frase "Passando para lembrar…" e a data sem "amanhã".
   - "Ativar lembretes", "Desativar lembretes" e "Remover segundo lembrete", que o quadro não mostra (escolha 4).
   - O campo "Minutos antes" de "Outro", que o quadro não abre.
   - A nota com preço, que o quadro não mostra.
   - A casca: a barra de status e o indicador de início do iPhone; o estado da casca na conta visual (o aviso "Atendimento automático parado" e as linhas do hub, como as `notes` do AG3).

   O Developer registra outras que encontrar nas `notes` do alvo e em D-139, com o motivo.
9. **Decisão.** O Developer propõe **D-139**, por acréscimo, depois das provas. D-139 cobre:
   - a tela como o AG2, com "Outro", ativar e desativar, e a prévia;
   - a regra de que a prévia é o texto real e que `reminderPreview.ts` e `notification-message.ts` mudam juntos, com os testes dos dois lados afirmando os mesmos textos;
   - a data e a hora em português no lembrete e no aviso, com a volta ao formato de hoje quando o fato não é válido;
   - a frase sem "de seu atendimento";
   - as divergências declaradas.

   D-139 revê D-116 só na tela de Lembretes, que passa a portar o AG2, e nada mais.

## Escopo obrigatório

### 1. A mensagem (`apps/ai-orchestrator`)

1. `src/modules/reminders/notification-message.ts`: a data e a hora da escolha 2 e a frase sem "de seu atendimento". O comentário do arquivo continua dizendo que nenhum instante é formatado aqui, agora com a nota de que o dia da semana sai da data local por aritmética.
2. `tests/reminders/notification-message.test.ts` e `tests/reminders/notification-delivery.test.ts`: o texto esperado passa a "na quarta-feira, 16/09, às 14h30" (2026-09-16 é quarta-feira). Testes novos:
   - os sete dias da semana com o artigo certo;
   - a virada de ano e o 29 de fevereiro;
   - "9h", "9h05" e "14h";
   - a data ou a hora inválidas mantendo o texto literal de hoje;
   - lembrete, aviso de alteração e cancelamento sem serviço e sem título, sem "de seu atendimento";
   - as mesmas frases factuais nos três estilos, como hoje.

### 2. O frontend (`apps/frontend/src`)

1. `features/reminders/reminderPreview.ts` (novo): a composição da escolha 3.
2. `features/reminders/ReminderSettingsSection.tsx`: a tela da escolha 4, com a prévia, recebendo de quem a monta o que a prévia precisa (`settings`).
3. `features/settings/ProductSettingsScreen.tsx`: o cenário `calendar-reminders` sem a descrição de `SettingsPage`, passando `settings`.
4. `shared/styles/avenly-settings.css`: o CSS do AG2.

### 3. A captura

1. `apps/frontend/e2e/visual/targets.json`: o AG2 (escolha 6).
2. `scripts/tests/visual-responses.test.mjs`: o AG2 entre os donos de `responses` em `Mais-Negocio-Agenda-IA.dc.html`, com o `GET` do próprio caminho. O teste de D-138, que recusa passo que confirma ação gravada, passa a recusar também `clickRole` com o nome "Salvar" em alvo com `responses`.
3. `apps/frontend/e2e/routes.ts`: só o `contentMarker` da rota, se preciso (escolha 7).

### 4. Provas

1. Testes novos em `apps/frontend/tests/goal125-*.test.tsx`:
   - a tela: o título, as fichas com 24 h marcada no padrão, "Outro" marcado com um valor fora das fichas e o campo "Minutos antes" visível só com "Outro", o segundo lembrete com "Remover segundo lembrete", "Desativar lembretes" e "Ativar lembretes", o bloco de confirmação e o controle de preço com `aria-pressed`;
   - o salvar: o `PATCH` com o mesmo corpo de antes, uma vez, com uma e com duas regras, desligado (`rules: []`) e com valor de "Outro"; a validação fora de 1 a 43 200 sem pedido; "Salvando..." e as duas mensagens;
   - a prévia, para os três estilos e `tone` `null`: o texto exato com e sem confirmação, com e sem preço, sem serviço, com a leitura do catálogo falhada, e "Nenhum lembrete é enviado." com os lembretes desligados; a data do dia seguinte no fuso do negócio com relógio fixo, inclusive num instante em que o fuso do negócio e o UTC caem em dias diferentes; a nota de preço nas duas políticas;
   - uma chamada de `useShellConfig` por árvore, abaixo e a partir de 1024 px.
2. **Os mesmos textos dos dois lados.** Para pelo menos um exemplo por estilo (com confirmação e sem, com preço e sem, com serviço e sem), o teste de `reminderPreview.ts` e o de `notification-message.ts` afirmam a mesma string, escrita literalmente nos dois. O relatório lista os pares.
3. `scripts/tests/visual-responses.test.mjs`: os testes do §3.2.
4. **Controles negativos, rodados depois da última edição de código e revertidos:**
   - (a) `notification-message.ts` voltando a escrever `no dia {date} às {time}` faz um teste do orquestrador reprovar;
   - (b) o artigo "na" no sábado faz um teste do orquestrador reprovar;
   - (c) uma frase do estilo `CASUAL` trocada só em `reminderPreview.ts` faz um teste do frontend reprovar;
   - (d) a prévia ignorando a caixa de confirmação faz um teste reprovar;
   - (e) o `PATCH` sem `confirmationEnabled` faz um teste reprovar;
   - (f) um passo de `targets.json` que toque "Salvar" no AG2 faz o teste da captura reprovar.

   O relatório traz o comando, o teste que reprovou, a mensagem e o `cmp` depois de reverter.
5. Os testes existentes continuam passando. Os ajustes nos arquivos da evidência 8 podem trocar o texto que este Goal muda ("Salvar lembretes", "Personalizado (minutos)", a data da mensagem). Nenhum ajuste pode afrouxar uma asserção de comportamento: corpo do `PATCH`, validação, regras de até dois lembretes, preço só com acordo fixo, confirmação só no lembrete, ou estilo sem mudar fato. Cada ajuste é listado no relatório.
6. **Fidelidade visual.** `npm run visual:compare -- --target AG2` e, para regressão, `--target AG1,AG3,M1,N1,IA1`, numa pilha descartável própria (banco num cluster PostgreSQL criado com `initdb` fora do repositório, como nos Goals 118 a 124). O Developer olha as capturas lado a lado (protótipo × app, 4 devices) e lista no relatório as diferenças que restam e por quê.

## Fora do escopo

- Qualquer mudança no BFF, no Scheduling, no contrato (`packages/public-api-contract`, `PUBLIC_API_V1.md`) ou em banco. Nenhuma mudança nos fatos que o Scheduling manda, no envio, no lease, na retentativa ou nas regras de quando o lembrete sai.
- As vozes dos estilos, a regra do preço e a regra da confirmação no orquestrador; só o trecho de quando e a frase sem serviço mudam.
- "Amanhã" ou outra data relativa na mensagem: o texto é montado na hora do envio, e a distância até o atendimento não é garantida.
- N2 (pede formas de pagamento no contrato), N3 (pede o vínculo da pergunta a um serviço), W3 e o resto das lacunas visuais sem ID (S1b, S5, S6, S8, S9, CL8, CL9, NT2, NT3, H6 e as etapas do onboarding), e as observações abertas dos reviews 116 a 124.
- Mover a `ChatSheetShell` para `shared/ui/` (observação 2 do review124).

## Documentação

Por acréscimo, depois das provas, no fim de cada arquivo:

- `docs/migration/DECISIONS.md`: **D-139** em `PROPOSED`, conforme a escolha 9. Se o número já estiver tomado, use o próximo livre e explique.
- `docs/migration/CURRENT_STATE.md`: o delta do Goal125.
- `docs/migration/VALIDATION_GATE.md`: a seção do Goal125, com:
  - as contagens da execução final de **todos** os gates que rodaram, inclusive `validate:core`, `validate:ui` e `validate:integration` com o gate autenticado;
  - os controles negativos e a rodada em que rodaram;
  - os pares de texto do §4.2;
  - o `visual:compare` (alvos, percentuais e diferenças que restam);
  - a lista dos testes ajustados.

O Developer não edita `docs/migration/goals/`, `docs/migration/reviews/`, `MIGRATION_STATUS.md` nem `MASTER_PLAN.md`.

## Validação e ordem

1. A pilha descartável própria, antes de editar.
2. A mensagem no orquestrador, com os testes.
3. `reminderPreview.ts`, com os testes e os pares de texto.
4. A tela, com os testes, o CSS e o alvo.
5. `visual:compare` do AG2, e de AG1, AG3, M1, N1 e IA1 para regressão.
6. Controles negativos do §4.4, revertidos.
7. Execução final, sobre a árvore completa:
   - typecheck e lint do frontend (com o RTK ligado, lint por `rtk proxy`), e o build do orquestrador;
   - testes do frontend, os testes de `apps/ai-orchestrator` e `node --test scripts/tests/visual-responses.test.mjs`;
   - `test:gate`, com o `prisma generate` de `apps/ai-orchestrator` já feito;
   - `validate:core`, `validate:ui` e `validate:integration` (com `BFF_TEST_DATABASE_URL` no banco descartável; sem `AI_TEST_DATABASE_URL` apontando para banco não migrado, observação 1 do review124);
   - `git diff --check`.

   Contagens no relatório e em VALIDATION_GATE.

## Critério de aceite

1. A tela de Lembretes igual ao quadro AG2 nos 4 devices, salvo as divergências declaradas: o cabeçalho, as fichas com o check, "Outro", "Adicionar segundo lembrete", o bloco de confirmação, o controle segmentado de preço, o cartão "Assim chega para a cliente" e o "Salvar" fixo. Provado em jsdom e pelo `visual:compare`.
2. O balão da prévia mostra o texto que `notification-message.ts` montaria para os mesmos fatos, no estilo da conta, e muda com a confirmação e o preço marcados antes de salvar. Os pares de texto do §4.2 são iguais dos dois lados.
3. O lembrete e o aviso de alteração dizem "{artigo} {dia da semana}, DD/MM, às {hora}", com o artigo certo nos sete dias, e nunca a data `AAAA-MM-DD` quando o fato é válido. Com fato inválido, o texto de hoje. Sem serviço e sem título, sem "de seu atendimento". As vozes, o preço e a confirmação como antes.
4. O `PATCH` de `/v1/settings/reminders` envia o mesmo corpo de antes, uma vez, só no "Salvar". Desligar e ativar lembretes, o segundo lembrete e "Outro" gravam o que gravavam. A validação e as mensagens são as de hoje. AG1, AG3, M1, N1 e IA1 iguais à captura de antes.
5. Nenhum passo de captura toca "Salvar" nem um botão que confirma ação gravada, e o teste da captura prova isso.
6. Os seis controles negativos reprovam e foram revertidos. Os testes existentes continuam passando, com os ajustes listados.
7. No gate autenticado de `validate:integration`, `/configuracoes/agenda/lembretes` passa nas cinco larguras (360, 390, 768, 1024 e 1440): sem overflow horizontal, com alvo de toque de 24 px no mínimo ("‹", as fichas, "Outro", "Adicionar segundo lembrete", a caixa de confirmação, as duas opções de preço e "Salvar"), contraste (inclusive `#716859` sobre `#FFFDFA`, `#0B2F32` sobre `#DCECEB` e `#0F5F63` sobre `#F7F4EF`), foco visível e `prefers-reduced-motion`. `validate:ui`, `validate:core` e `test:gate` passam.
8. Nenhum arquivo mudou fora de `apps/ai-orchestrator/src/modules/reminders/notification-message.ts`, `apps/ai-orchestrator/tests/reminders/`, `apps/frontend/src/`, `apps/frontend/tests/`, `apps/frontend/e2e/visual/targets.json`, `apps/frontend/e2e/routes.ts` (só o `contentMarker` da rota, se preciso), `scripts/tests/visual-responses.test.mjs` e dos três registros da seção "Documentação".
9. D-139 proposta, conforme a escolha 9.

## Plano de execução

1. **WU-01 — A data em português na mensagem.** `notification-message.ts` e os testes do orquestrador.
2. **WU-02 — A prévia.** `reminderPreview.ts` e os testes com os pares de texto.
3. **WU-03 — A tela do AG2.** `ReminderSettingsSection.tsx`, o cenário em `ProductSettingsScreen.tsx`, o CSS, os testes `goal125` da tela e os ajustes dos testes existentes.
4. **WU-04 — Captura, fidelidade, provas e registros.** O alvo AG2 e os testes da captura, o `visual:compare`, os controles negativos, D-139, CURRENT_STATE e VALIDATION_GATE.
5. Verificação determinística: typecheck, lint, testes alvo do frontend e do orquestrador, suíte do frontend, testes da captura, `test:gate`, `validate:core`, `validate:ui`, `validate:integration` e `git diff --check`.
