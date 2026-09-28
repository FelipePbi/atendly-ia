# Goal 071 — A conexão do WhatsApp pede consentimento e mantém o código válido

**Status: READY.** Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal063 ACCEPTED](../reviews/063-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v86, dividida do 063, com o mesmo ID e o mesmo título. A v87 precisa o escopo com evidência conferida no código: o painel de conexão é um só para o onboarding e para Configurações, o QR nunca é relido, e reler o QR no fork depois do limite abre uma sessão nova. A v87 também traz para cá **QA O-44** (layout da própria tela de conexão), que não tinha Goal.

## Baseline aceita

Baseline aceita: `0cb49b40154050e220e53c9b937f7b2dc7f7852c`

Goal anterior: 063 — A IA só liga depois do teste real

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal063 já integrado em `main` (origem `c2c628e401cad4761e6e7c978405678c51f00ad5`). **Duas rodadas**, com 10 e 0 blockers. **D-080** foi aceita e [FINAL_AUDIT §41](../FINAL_AUDIT.md) escrita sem reescrever §4 a §40. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O commit documental seguinte, `db9cfae`, só corrigiu o status do documento do Goal063 e não muda código. O 063 mudou ativação da IA, onboarding depois da conexão, Configurações › IA e o checklist da Home. Não tocou `WhatsAppConnectionPanel`, as rotas de WhatsApp do BFF nem a etapa de conexão. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review063](../reviews/063-review.md): `test:gate` **233**; `test:frontend` **83** arquivos e **793** testes; suíte unitária de `apps/scheduling-service` **35** arquivos e **484** testes; integração do Scheduling **16** arquivos e **124** testes; integração do BFF **50** arquivos e **402** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **70** testes e **0** retentativas.

## Objetivo e posição

Fazer a conexão do WhatsApp pedir o consentimento que o vault exige antes de conectar, por qualquer caminho, e manter válido na tela o QR e o código de vinculação enquanto a pessoa conecta. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA O-40** (ALTA): da introdução a tela vai direto para a conexão, sem consentimento e sem perguntar se o número é pessoal (vault, perguntas 867 a 871, vigentes).
- **QA O-45** (ALTA): o painel busca o QR uma vez e nunca mais. A Evolution gira o QR e, no quinto, força logout. A tela continua mostrando o primeiro QR com "Conectando" depois que a sessão morreu.
- **QA O-48** (MÉDIA): a visão de código é o código como texto solto, sem copiar, sem passos e sem estado de espera; as opções reusam o cartão de tom da IA, com altura vazia.
- **QA O-44** (MÉDIA, desde a v87): instrução do QR embaixo do cartão "Código", QR pequeno solto e dois CTAs primários concorrentes.

Posição: logo depois do 063 e antes do 064. Os demais achados da seção 2f/2g sem Goal (**QA O-41**, **O-42**, **O-43** e **O-50**) foram para o 065 na v87.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **Um painel só, dois caminhos.** `WhatsAppConnectionPanel` (`apps/frontend/src/features/whatsapp/WhatsAppConnectionPanel.tsx`) é usado pela etapa `whatsapp-conectar` do onboarding (`blocks/whatsapp.tsx`, `whatsappStepBody`) e por Configurações › WhatsApp (`features/settings/WhatsAppSettings.tsx`). Nenhum dos dois mostra consentimento. A introdução `whatsapp` mostra só os quatro pontos de "Orientação sobre número pessoal".
2. **O BFF conecta sem consentimento.** `POST /v1/whatsapp/connect` e `POST /v1/whatsapp/reconnect` (`apps/bff/src/modules/whatsapp/routes.ts`, `connectSchema`) aceitam só `mode` e `phone`. `connect` cria a instância na Evolution (`ensureInstance`) antes de qualquer outra coisa.
3. **O QR nunca é relido.** O painel guarda o QR da resposta do `connect`. O intervalo de 3 s relê `GET /v1/whatsapp`, que não devolve QR. O badge diz "Conectando" enquanto existe `payload`, sem olhar a idade do QR.
4. **Como o fork gira o QR.** Cada QR novo é gravado na instância; no quinto (`QRCODE_MAX_COUNT`, padrão 5, `pkg/config/config.go`), o fork faz logout, limpa o QR, apaga o cliente e emite `QRTimeout` (`apps/evolution-go/pkg/whatsmeow/service/whatsmeow.go:564-606`). `GET /instance/qr` devolve o QR mais recente gravado. **Sem cliente, ou com cliente já logado, ele inicia uma sessão nova** (`pkg/instance/service/instance_service.go:401-468`). Consequências: reler o QR depois do limite abre outra vinculação; reler o QR com o número conectado pode derrubar a sessão boa; reler o QR sem vinculação em curso abre uma vinculação que ninguém consentiu.
5. **A leitura do QR já existe no cliente.** `EvolutionClient.getQr` (`apps/bff/src/clients/evolution/index.ts`) já é usado por `connect`. Uma rota de leitura não precisa de chamada `this.http.` nova, e a contagem congelada em `apps/bff/src/clients/` segue **42**.
6. **O marcador de vinculação por QR.** `connect` no modo QR grava `status: "WAITING_QR"` e a coluna `qrcode`. `GET /v1/whatsapp` sobrescreve `status` com `CONNECTED` ou `DISCONNECTED` a cada leitura, então `status` não serve de marcador. A coluna `qrcode` só é escrita por `connect` e nunca é limpa: nem no modo código, nem quando o número conecta. `DELETE /v1/whatsapp` apaga a linha (`disconnect.ts:92`).
7. **O código expira pelo BFF.** No modo código, `connect` devolve `expiresAt` 160 s à frente. A tela mostra o código como texto mono solto e, ao expirar, "O código expirou".
8. **"Conectar agora" não leva aonde diz.** Em `whatsapp-concluido` o link aponta para `/configuracoes/whatsapp`. Com o onboarding aberto, a pessoa volta à etapa WhatsApp do onboarding (observação 5 do review063).
9. **O gate autenticado não mede a tela de WhatsApp.** `/configuracoes/whatsapp` não está em `AUTHENTICATED_ROUTES` (`apps/frontend/e2e/routes.ts`). O tenant do ensaio (`scripts/goal033-authenticated-ui-rehearsal.mjs`) conecta o WhatsApp por `POST /v1/whatsapp/connect` contra o dublê da Evolution, então a tela medida seria a de número conectado. O comentário "seven routes" em `apps/frontend/e2e/authenticated-matrix.spec.ts` está defasado (observação 6 do review063).
10. **O que o vault e o protótipo dizem.** Vault: confirmação específica antes de conectar, por checkbox obrigatório; perguntar se o número é pessoal; se for, reforçar a orientação sobre classificação e "Ignorar IA"; se for só comercial, não remover proteções (`04-Referencia/99-Perguntas-e-Respostas.md`, 867 a 871). Celular: código copiável e passo a passo; a tela detecta a conexão sozinha e mostra o número conectado, com troca antes de continuar (`02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md` §"Conexão"). Protótipo `Onboarding-3-IA-e-WhatsApp.dc.html`, 4.2 e 4.3; `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html` para o QR com quatro passos.

## Fora do escopo

- **Gravar o consentimento.** O aceite é exigido pelo BFF a cada vinculação, mas não é persistido. Consentimento legal, termos e LGPD seguem em `docs/product-vault/04-Referencia/03-Temas-Adiados.md`. D-081 declara esse limite.
- Guardar a resposta "número pessoal". Ela só muda a orientação na tela (vault 870 e 871) e não muda comportamento da IA.
- **QA O-41, O-42, O-43 e O-50** (introdução do WhatsApp e número inválido nos contatos ignorados): Goal065.
- Mudar o fork (`apps/evolution-go/`), `QRCODE_MAX_COUNT` ou o tempo de giro do QR.
- Mudar o teste real, a ativação da IA, `AiSettings`, a Home ou o checklist (Goal063).
- Mudar a desconexão, o estado pendente ou divergente do vínculo, a leitura de status (Goal059) ou a limpeza de instância órfã.
- Nome, Boas-vindas e o resto do onboarding (Goals 064 e 065), fidelidade visual fina à referência (Goal068).
- Editar o Product Vault ou o `QA_LOCAL_REVIEW.md`.
- As observações abertas dos reviews 059, 060, 061, 062, 063 e 070 listadas em [MIGRATION_STATUS](../MIGRATION_STATUS.md), exceto as 5 e 6 do review063, que são deste Goal. Se `goal008-agenda.test.ts` (observação 4 do review059) reprovar em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal059.

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas O-40, O-44, O-45 e O-48 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- no vault: `02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`, seções "Conexão" e "Orientação sobre número pessoal"; as perguntas 867 a 871 de `04-Referencia/99-Perguntas-e-Respostas.md`;
- no protótipo, só as seções 4.2 e 4.3 de `docs/design-reference/claude-design/prototype/project/Onboarding-3-IA-e-WhatsApp.dc.html` e a tela de QR de `Onboarding-3-IA-e-WhatsApp-Desktop.dc.html`;
- `apps/bff/src/modules/whatsapp/routes.ts`, `instance-link.ts` e `disconnect.ts`; `getQr` e `getStatus` em `apps/bff/src/clients/evolution/index.ts`;
- no fork, só leitura: `GetQr` em `apps/evolution-go/pkg/instance/service/instance_service.go` e o trecho do limite de QR em `pkg/whatsmeow/service/whatsmeow.go:540-700`;
- em `apps/bff/PUBLIC_API_V1.md`: a tabela de rotas e as seções "Status honesto do WhatsApp e da IA" e "Vínculo WhatsApp: estados ambíguos";
- `packages/public-api-contract/src/routes.ts` e os schemas de WhatsApp em `src/schemas.ts`;
- `apps/frontend/src/data/services/BffWhatsAppService.ts` e o tipo `WhatsAppConnectInput`;
- `apps/frontend/src/features/whatsapp/WhatsAppConnectionPanel.tsx`, `features/settings/WhatsAppSettings.tsx`, `features/onboarding/blocks/whatsapp.tsx`, `OnboardingScreen.tsx` (rodapés de `whatsapp`, `whatsapp-conectar` e `whatsapp-concluido`) e `scenarios.ts`;
- `apps/frontend/e2e/routes.ts` e o comentário de contagem em `e2e/authenticated-matrix.spec.ts`;
- o trecho de `scripts/goal033-authenticated-ui-rehearsal.mjs` que chama `POST /v1/whatsapp/connect`;
- os testes existentes que usam o painel ou as rotas de conexão: `apps/bff/tests/goal059-whatsapp-orphan.integration.test.ts` e, em `apps/frontend/tests/`, `goal059-whatsapp-status-view`, `goal018-onboarding-reachability`, `goal018-a11y`, `goal019-a11y`, `goal024-settings-shell-invariant` e `bff-http-client`.

## Pontos de implementação

- `apps/bff/src/modules/whatsapp/routes.ts` e, se precisar, `instance-link.ts`.
- `apps/bff/src/lib/errors.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `packages/public-api-contract/src/routes.ts` e `src/schemas.ts`, para a rota nova e o corpo de conexão.
- `apps/frontend/src/data/services/BffWhatsAppService.ts` e o tipo de entrada de conexão.
- `apps/frontend/src/features/whatsapp/` (o painel e, se o Developer dividir, componentes de consentimento, QR e código no mesmo módulo).
- `apps/frontend/src/features/onboarding/` (rodapé de `whatsapp-conectar`, link de `whatsapp-concluido`) e `apps/frontend/src/shared/styles/atendly.css`.
- `apps/frontend/e2e/routes.ts` e o comentário em `e2e/authenticated-matrix.spec.ts`.
- `scripts/goal033-authenticated-ui-rehearsal.mjs`: só acrescentar `consentAccepted: true` ao corpo de `POST /v1/whatsapp/connect`.
- Testes novos com prefixo `goal071-` em `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. O BFF só vincula com consentimento (BFF)

- `POST /v1/whatsapp/connect` e `POST /v1/whatsapp/reconnect` exigem `consentAccepted: true` no corpo, no padrão de `termsAccepted` do cadastro (`z.literal(true)`). Ausente ou diferente de `true`: `400 VALIDATION_ERROR`, **antes** de `ensureInstance`, de qualquer chamada à Evolution e de qualquer escrita. Nenhuma instância remota ou linha local nasce sem consentimento.
- O aceite não é gravado (§"Fora do escopo"). O corpo não leva a resposta "número pessoal".
- As demais recusas e respostas das duas rotas não mudam.

### 2. O QR é relido pelo que está valendo (BFF)

- Rota nova `GET /v1/whatsapp/qr`, com `requireTenantContext`, só sobre o vínculo do próprio negócio (`requireLinkedInstance`). Vínculo pendente ou divergente recusa com `409 CONFLICT`, como as demais rotas de WhatsApp.
- **Marcador de vinculação por QR em curso**, sem migration: a coluna `qrcode` passa a ser o marcador. `connect` e `reconnect` no modo QR a gravam, como hoje. O modo código a limpa. Qualquer leitura que observe o número conectado (`GET /v1/whatsapp` e a rota nova) a limpa. `DELETE /v1/whatsapp` já apaga a linha.
- Sem vinculação por QR em curso, a rota recusa com `409` e código próprio novo (por exemplo, `WHATSAPP_QR_NOT_IN_PROGRESS`) e **não chama `/instance/qr`**. Reler o QR nunca abre uma vinculação que um `connect` com consentimento não abriu.
- **Antes de ler o QR, a rota lê o status** (`getStatus`). Com o número conectado ou logado, ela responde o estado conectado, limpa o marcador e **não chama `/instance/qr`**, porque no fork isso pode derrubar a sessão boa (evidência 4).
- Com vinculação em curso e número não conectado, a rota lê o QR corrente pelo `getQr` que já existe e devolve `{ connection, qrcode }`. Se a Evolution disser que não há QR agora, a rota responde `200` com `qrcode: null`, e não erro genérico. Falha de transporte com a Evolution sobe como nas demais rotas.
- A resposta nunca traz credencial, JID, nome de instância nem texto cru da Evolution.
- Nenhuma chamada `this.http.` nova em `apps/bff/src/clients/`; a contagem segue **42**.
- **Limite declarado:** depois do quinto QR, a próxima leitura abre sessão nova no fork (evidência 4). A janela de renovação é da tela (§3). O BFF não guarda o início da vinculação, porque isso pediria migration; D-081 registra o limite.

### 3. Consentimento antes de conectar, dentro do painel (frontend)

- O consentimento mora em `WhatsAppConnectionPanel`, então vale no onboarding e em Configurações › WhatsApp com uma implementação só. Com o número não conectado, o primeiro estado do painel é "Antes de conectar", no conteúdo da seção 4.2 do protótipo:
  - checkbox **desmarcado**, obrigatório: "Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Atendly.", com "Saiba mais" para `/politica-de-privacidade`;
  - a pergunta "Você usa esse número também para conversas pessoais?", com "Sim, também" e "Não, só trabalho", **nenhuma pré-marcada**;
  - "Sim, também" revela o bloco "Tudo bem — você continua no controle", com as três linhas do protótipo (conversas separadas em Comercial, Não classificadas e Pessoal; contatos que a IA nunca responde; IA desativada em conversa pessoal e fora de cena quando você responde);
  - "Não, só trabalho" não revela o bloco e não desliga nenhuma proteção (vault 871).
- A ação que segue ("Continuar") só fica habilitada com o checkbox marcado **e** uma resposta escolhida. Nenhuma chamada a `connect` ou `reconnect` acontece antes disso.
- Toda chamada a `connect` e `reconnect` feita pelo painel envia `consentAccepted: true`, inclusive "Gerar novo QR Code" e "Gerar novo código" dentro da mesma vinculação. O aceite vale para a vinculação aberta na tela; sair da tela e voltar pede de novo.
- Com o número conectado, o painel não mostra o consentimento.
- O checkbox e as duas respostas são controles nativos com rótulo, alcançáveis por teclado, e a resposta escolhida é anunciada (`aria-pressed` ou `radio`).

### 4. QR válido enquanto a tela está aberta (frontend)

- Escolha de modo: no celular (até 760 px, regra atual) o padrão é código; no computador, QR. A troca é um controle compacto, sem reusar `settings-tone-card` e sem altura vazia (QA O-48).
- **Visão QR**, conforme a tela de QR do protótipo desktop: o QR com tamanho legível, e os quatro passos numerados ao lado ou logo abaixo **na mesma coluna do QR** ("Abra o WhatsApp no seu celular", "Toque em ⋮ ou Configurações › Dispositivos conectados", "Conectar dispositivo", "Aponte a câmera para este QR code"). Um CTA primário por estado (QA O-44).
- **Renovação:** com vinculação por QR em curso, a tela relê `GET /v1/whatsapp/qr` num intervalo **menor que o giro do QR** (o fork gira a cada 20 s depois do primeiro), sem leitura concorrente: a próxima só começa depois que a anterior termina. O QR na tela é sempre o último lido.
- A renovação para quando: o número conecta; o componente desmonta; a aba fica oculta (`document.visibilityState`), retomando ao voltar a ficar visível, dentro da janela; ou a **janela** acaba. A janela é uma constante nomeada no código, de no máximo **5 minutos** desde o início da vinculação nesta tela.
- Fim da janela, ou `qrcode: null` persistente além de um giro: a tela sai de "Aguardando conexão" e mostra "O QR Code expirou", com "Gerar novo QR Code" como ação principal, que chama `reconnect` com consentimento e reabre a janela. **Nunca** mostra QR com mais de um giro de idade sob "Aguardando conexão" ou "Conectando".
- A recusa `WHATSAPP_QR_NOT_IN_PROGRESS` leva ao mesmo estado de expirado, não a erro genérico.

### 5. Visão de código completa (frontend)

- Antes de gerar, o campo "Seu número de WhatsApp com DDD", com erro inline em português que explica o formato quando o número é curto ou o BFF recusa com `VALIDATION_ERROR`.
- Depois de gerar, conforme 4.3 do protótipo:
  - o código em tamanho grande, legível e selecionável;
  - "Copiar código", que copia pela área de transferência e confirma na tela ("Código copiado"); se a cópia falhar, a tela diz para copiar à mão, sem erro técnico;
  - os cinco passos numerados do protótipo;
  - "Aguardando conexão… detectamos sozinhos quando conectar.", enquanto o código vale;
  - "Abrir WhatsApp", como link que abre o aplicativo.
- O código expira pelo `expiresAt` que o BFF já devolve. Expirado, a tela diz isso e oferece "Gerar novo código", que chama `reconnect` com o mesmo número e o consentimento.
- A leitura de status de 3 s continua. Ao conectar, a tela mostra o número conectado, formatado como hoje (`formatBrazilianPhone`), com a opção de trocar antes de continuar (vault §"Conexão").

### 6. Onboarding (frontend)

- `whatsapp-conectar`: enquanto o número não está conectado, o rodapé não mostra CTA primário concorrente com o do painel. Conectado, o painel mostra o número, e "Continuar" é a ação principal, que segue para `contatos-ignorados` como hoje. O botão "Já conectei" não existe.
- `whatsapp-concluido`: "Conectar agora" leva à etapa de conexão do próprio onboarding (`/onboarding/whatsapp`), não a `/configuracoes/whatsapp` (observação 5 do review063). A conclusão do onboarding continua só no CTA "Ir para o início" (D-080).
- A introdução `whatsapp`, a ordem do fluxo (`onboardingFlow`) e a barra de progresso não mudam.

### 7. Gate renderizado

- `/configuracoes/whatsapp` entra em `AUTHENTICATED_ROUTES`, com `sessionMarker: "configuracoes"` e `contentMarker` no padrão das demais. O tenant do ensaio tem o número conectado, então a tela medida é a de número conectado.
- O comentário de contagem de rotas em `e2e/authenticated-matrix.spec.ts` passa a dizer a contagem real (observação 6 do review063).
- O ensaio `scripts/goal033-authenticated-ui-rehearsal.mjs` envia `consentAccepted: true` em `POST /v1/whatsapp/connect`, e nada mais muda nele.
- Nenhuma medida do gate é desligada, e nenhuma rota sai da lista.

### 8. Contrato público

- `apps/bff/PUBLIC_API_V1.md`, por acréscimo:
  - a tabela de rotas com `GET /v1/whatsapp/qr`;
  - uma seção nova com o consentimento exigido em `connect` e `reconnect`, a rota de leitura do QR, o marcador, a recusa nova, a leitura de status antes do QR e o limite do fork;
  - a correção de qualquer trecho que passe a mentir.
- `packages/public-api-contract/`: a rota nova com schema estrito da resposta e o corpo de conexão com `consentAccepted`. O teste de contrato do gate (Goals 035 e 036) continua passando sem exceção nova.

### 9. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e **a saída do vermelho vai colada no relatório**. Nenhum teste chama WhatsApp ou Evolution reais; a Evolution é dublê que conta chamadas por rota e gira o QR a cada leitura.

1. **BFF, contra PostgreSQL real** (suíte de integração do BFF):
   - `connect` sem `consentAccepted`, e com `consentAccepted: false`: `400`, **zero** chamadas à Evolution e nenhuma linha de `WhatsAppInstance`; `reconnect` sem consentimento: `400`, zero chamadas;
   - `connect` com consentimento no modo QR, depois duas leituras de `GET /v1/whatsapp/qr`: cada leitura devolve o QR corrente do dublê, diferente do anterior;
   - número conectado no dublê: `GET /v1/whatsapp/qr` responde conectado e **não chama** `/instance/qr`; o marcador fica limpo;
   - sem `connect` antes, e depois de `connect` no modo código: `409` com o código novo e **zero** chamadas a `/instance/qr`;
   - dublê sem QR disponível: `200` com `qrcode: null`;
   - depois de `DELETE /v1/whatsapp`: a rota não lê QR;
   - dois negócios: o QR de um nunca sai na leitura do outro;
   - a resposta não contém credencial, JID nem nome de instância.
2. **Frontend (jsdom, com relógio simulado):**
   - sem conexão, o painel mostra o consentimento primeiro, com checkbox desmarcado e nenhuma resposta marcada; "Continuar" desabilitado até checkbox e resposta; `connect` não é chamado antes; o corpo enviado tem `consentAccepted: true`;
   - "Sim, também" revela o bloco de controle; "Não, só trabalho" não revela;
   - o mesmo consentimento aparece no onboarding (`whatsapp-conectar`) e em Configurações › WhatsApp;
   - QR renovado: com o serviço devolvendo QR1 e depois QR2, o `src` da imagem troca sem ação da pessoa;
   - sem leitura concorrente; renovação parada ao desmontar, ao conectar e com a aba oculta, e retomada ao voltar a ficar visível;
   - fim da janela: estado "O QR Code expirou" com "Gerar novo QR Code", nenhum "Conectando" nem "Aguardando conexão"; a recusa `WHATSAPP_QR_NOT_IN_PROGRESS` leva ao mesmo estado;
   - visão de código: código grande, "Copiar código" escreve o código na área de transferência e confirma, falha de cópia tem texto próprio, os cinco passos, o texto de espera e "Abrir WhatsApp"; depois de `expiresAt`, "Gerar novo código" chama `reconnect` com o mesmo número;
   - um CTA primário por estado do painel;
   - `whatsapp-concluido`: "Conectar agora" aponta para a etapa do onboarding;
   - nenhum texto das telas tocadas contém "token", "API", "HTTP", "JID", "instância", "Evolution", "QRTimeout", "pairing" nem código cru.

Os testes existentes continuam passando. Só muda asserção que depende do corpo de `connect` sem consentimento, do QR lido uma vez, do painel sem consentimento ou do link de `whatsapp-concluido`; o relatório lista cada mudança com o motivo.

### 10. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório:

1. `connectSchema` deixa de exigir `consentAccepted`: o teste de consentimento do §9.1 reprova.
2. A rota do QR deixa de ler o status antes: o teste de número conectado do §9.1 reprova.
3. A rota do QR deixa de exigir vinculação em curso: o teste de `409` do §9.1 reprova.
4. O painel volta a ler o QR uma vez só: o teste de renovação do §9.2 reprova.
5. O painel chama `connect` sem passar pelo consentimento: o teste de consentimento do §9.2 reprova.
6. O fim da janela volta a mostrar o último QR: o teste de expiração do §9.2 reprova.

### 11. O que só uma pessoa confere

A conexão real depende de um WhatsApp de verdade e da Evolution real, que os testes não usam. Depois do aceite, uma pessoa confere na pilha local:

- que o QR renovado na tela conecta depois de 60 s aberto;
- que, depois da janela, "Gerar novo QR Code" conecta;
- que o código copiado conecta pelo celular;
- que ler o QR com o número já conectado não derruba a sessão.

O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 12. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o §8.
- [DECISIONS](../DECISIONS.md) ganha **D-081** em `PROPOSED`, no formato de D-076 a D-080. Ela diz que:
  - vincular o WhatsApp exige consentimento a cada vinculação, pelo BFF, por qualquer caminho; o aceite e a resposta sobre número pessoal não são gravados;
  - o QR é relido só com vinculação por QR em curso, e nunca com o número conectado;
  - a renovação tem janela limitada, com a tela aberta e visível;
  - limites: consentimento sem registro persistido; a janela é da tela, não do BFF; o fork abre sessão nova depois do quinto QR.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§42**, sem reescrever §4 a §41: **QA O-40, O-44, O-45 e O-48** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram:
  - o consentimento, a rota do QR e a renovação;
  - a rota nova no gate autenticado;
  - a conferência humana pendente;
  - as contagens da execução final de cada suíte tocada (arquivos e testes), de `test:gate` e do gate autenticado (`expected`/`unexpected`/`flaky`).
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) e o Product Vault não são editados.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Escreva a prosa **depois** da execução final, e só depois de `validate:integration` e dos seis controles terem rodado na árvore final (blockers 2, 3, 8 e 9 do review063). Documento que cita uma unidade ainda não executada ou um controle ainda não rodado reprova. **Rode `validate:core` antes de `test:gate`**: `test:gate` precisa do client Prisma que `validate:core` gera (blocker 10 do review063).

### 13. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/`, `tools/ia-loop/`, `docs/product-vault/` nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `packages/public-api-contract/`. Em `scripts/`, só o corpo de `connect` no ensaio do Goal033.
- Não cria migration.
- Não acrescenta chamada `this.http.` em `apps/bff/src/clients/`.
- Não muda o teste real, `AiSettings`, a Home, a desconexão nem a leitura de status além de limpar o marcador.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada, nenhuma medida do gate autenticado desligada e nenhuma rota tirada de `AUTHENTICATED_ROUTES`.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. `connect` e `reconnect` recusam sem consentimento antes de qualquer chamada à Evolution e de qualquer escrita. Provado por execução do §9.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. `GET /v1/whatsapp/qr` devolve o QR corrente só com vinculação por QR em curso, nunca lê o QR com o número conectado, recusa sem vinculação e isola negócios. Provado por execução do §9.1.
3. O painel pede consentimento antes de conectar nos dois caminhos, renova o QR dentro da janela, para fora dela e mostra expiração em vez de sessão morta. Provado por execução jsdom do §9.2.
4. A visão de código tem copiar, passos, espera, expiração e novo código; um CTA primário por estado; "Conectar agora" leva à etapa do onboarding. Provado por execução jsdom do §9.2.
5. Largura, toque, contraste, foco e movimento de `/configuracoes/whatsapp` no estado conectado são decididos pelo gate autenticado dentro de `validate:integration`. Os estados de consentimento, QR e código e `/onboarding/*` não são medidos pelo gate renderizado.
6. `PUBLIC_API_V1.md` e `packages/public-api-contract/` descrevem a rota nova e o corpo de conexão, e a contagem de `this.http.` em `apps/bff/src/clients/` segue **42**. Provado por diff e por execução de `test:gate`.
7. Os seis controles negativos do §10 reprovam com o defeito e passam sem ele, rodados depois da última edição de código, com a saída colada. Provado por execução.
8. Typecheck e lint de `apps/bff` e `apps/frontend` passam. Nenhuma suíte tem teste a menos que a baseline (`test:frontend` **83**/**793**; integração do BFF **50**/**402**; `test:gate` **233**). `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em mais de **70** testes (a rota nova soma medidas) e **0** retentativas. Provado por execução.
9. D-081 em `PROPOSED`, FINAL_AUDIT §42, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo depois da execução final, trazem as contagens dela e dizem que a conferência humana do §11 não foi feita. Provado por diff contra a execução.
10. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a conexão real funciona com WhatsApp e Evolution reais (§11);
- que o consentimento tem valor legal: ele não é gravado, e a revisão legal está nos temas adiados do vault;
- que os estados de consentimento, QR e código e `/onboarding/*` cumprem largura, toque, contraste, foco e movimento;
- que as telas batem com o protótipo aprovado (conferência humana, Goal068).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | BFF: consentimento em `connect`/`reconnect`, `GET /v1/whatsapp/qr` com marcador e leitura de status antes do QR, `errors.ts`, contrato em `packages/public-api-contract/`, `PUBLIC_API_V1.md`, corpo do ensaio do Goal033, testes `goal071-` do BFF e ajuste de `goal059-whatsapp-orphan` (§1, §2, §7, §8) |
| WU-02 | STANDARD | WU-01 | Painel: consentimento, renovação do QR com janela e visibilidade, visão de código, um CTA primário por estado, serviço de dados e testes jsdom (§3, §4, §5) |
| WU-03 | STANDARD | WU-02 | Onboarding (rodapé de `whatsapp-conectar`, link de `whatsapp-concluido`), `/configuracoes/whatsapp` no gate autenticado, comentário de contagem e ajuste dos testes existentes (§6, §7) |
| WU-04…WU-08 | DETERMINISTIC | WU-03 | typecheck e lint de `apps/bff` e `apps/frontend`, testes dirigidos `goal071` do frontend |
| WU-09 | DETERMINISTIC | WU-04…WU-08 | validate-core |
| WU-10…WU-12 | DETERMINISTIC | WU-09 | gate-tests, validate-ui e validate-integration |
| WU-13 | STANDARD | WU-10, WU-11, WU-12 | Controles negativos (§10) e documentação (§12), depois da execução final |
| WU-14 | DETERMINISTIC | WU-13 | git-diff-check final |

Os testes `goal071-` do BFF rodam dentro de `validate:integration`, que também roda o gate autenticado com a rota nova. Se `validate:integration` falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`.
