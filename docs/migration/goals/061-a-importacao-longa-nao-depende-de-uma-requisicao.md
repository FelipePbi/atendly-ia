# Goal 061 — A importação longa não depende de uma requisição

**Status: READY.** Preparado em 2026-09-27 pelo Tech Lead Agent após [Goal060 ACCEPTED](../reviews/060-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

Linha do [MASTER_PLAN](../MASTER_PLAN.md) desde a v78, com o mesmo ID e o mesmo título. A v84 precisa o escopo com evidência conferida no código: a análise passa a ter lease, como a execução já tem; o ponto de corte entre "iniciar" e "trabalhar" já existe na execução; e a contagem de clientes some por uma condição de tela, não por falta de dado.

## Baseline aceita

Baseline aceita: `355ff9282b8947c37f897dd9b987ccca444b5c07`

Goal anterior: 060 — Importação com e-mail e senha

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal060 já integrado em `main` (origem `21224846945d002736b399449c0ea45efd43e879`). **Quatro rodadas**, com 4, 3, 3 e 0 blockers. **D-077** foi aceita e [FINAL_AUDIT §38](../FINAL_AUDIT.md) escrita sem reescrever §4 a §37. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Esse veredito conta os achados A-01…A-24 do Goal030 e não conta os da revisão local. O 060 mudou a conexão com a origem e apagou a credencial na conclusão; não mudou análise, execução, preview, conflitos, lease nem retomada. Partir desta baseline; não reabrir diff aceito.

Contagens da baseline, do [review060](../reviews/060-review.md): `test:gate` **233**; `test:frontend` **77** arquivos e **718** testes; suíte unitária de `apps/scheduling-service` **30** arquivos e **410** testes; `validate:core` **17** passos (**15** `passed`, **2** `skipped`); `validate:ui` **169** passando e **21** pulados; `validate:integration` **35** passos, com o gate autenticado em **65** testes e **0** retentativas; `final-production-audit` **34** checks (**33** `passed`, **1** `skipped`). A contagem da suíte de `apps/bff` na baseline é medida pelo Developer antes da primeira edição e registrada no relatório.

## Objetivo e posição

Fazer a análise e a execução da importação começarem numa requisição curta e terminarem no processo do Scheduling, com o andamento lido do banco. Nenhuma tela pode dizer que falhou uma operação que terminou, e nenhuma visita à tela pode reler a origem inteira sem pedido do dono. Fecha, do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) (IDs com prefixo `QA`, como decidido na v79):

- **QA IM-03** (ALTA): a análise real (~27 s para 2.338 itens) nunca chega à tela, porque o BFF corta chamada interna em 10 s. O Scheduling termina e grava `READY`, mas a tela mostra "Análise indisponível".
- **QA IM-07** (ALTA): "Importar tudo" levou 31,4 s; o proxy do Next desistiu em ~30 s e a tela disse "Não foi possível importar agora", com o botão ainda ativo, depois de gravar 2.327 registros.
- **QA IM-04** (MÉDIA): cada visita à tela refaz a análise inteira.
- **QA IM-08** (MÉDIA): 11 itens `FAILED` com `IMPORT_SERVICE_MAPPING_MISSING`, e a tela não diz o motivo.
- **QA IM-05** (BAIXA): a contagem de clientes some da revisão.

Posição: segundo da cadeia de importação (060 → 061 → 062). O 062 (lista completa de clientes, disponibilidade substituída, telefone E.164, preço zero) depende da análise que este Goal torna alcançável com uma conta real.

## O que a evidência desta passada mostra

Conferido no código da baseline:

1. **As duas rotas esperam a origem inteira.** `POST /internal/calendar/imports/:sessionId/analyze` (`apps/scheduling-service/src/modules/internal-api/routes.ts:1465`) aguarda `ImportPreviewService.analyze`, que chama `reader.getImportSnapshot` (`import-preview-service.ts:179`) com a janela de dez anos para trás e dez para frente (`importSnapshotWindow`, `routes.ts:2180`). `POST .../execute` (`routes.ts:1605`) aguarda `ImportExecutionService.execute`, que também relê a origem (`import-execution-service.ts:376`). O BFF chama as duas com `AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS)` (`apps/bff/src/clients/internal-http-client.ts:175`), default **10 000** ms (`apps/bff/src/config/env.ts:63`). O `rewrites` do Next (`apps/frontend/next.config.ts`) não declara `proxyTimeout`.
2. **A execução já tem o ponto de corte.** `execute` valida sessão, estado e `previewVersion` (`assertPreviewVersionCurrent`) e reivindica o lease com `status: "EXECUTING"` no mesmo `UPDATE` (`import-execution-service.ts:318-336`) **antes** de ler a origem. Tudo depois de `:337` é o trabalho longo. Falha que não é de item libera o lease e deixa a sessão em `EXECUTING` (`:356-358`), e `LEASABLE_IMPORT_STATUSES` inclui `EXECUTING` (`import-lease.ts:44-48`), então uma nova chamada retoma.
3. **A análise não tem lease.** `analyze` só confere `ANALYZABLE_STATUSES` (`import-preview-service.ts:93`) e grava tudo numa transação no fim (`:413-444`). `ANALYZING` existe no enum do Prisma (`schema.prisma:954`), no contrato público e em `STATUS_LABELS` do frontend, mas nenhum código de `apps/scheduling-service/src/` grava esse estado: aparece só em conjuntos de leitura. Duas análises simultâneas da mesma sessão incrementam `previewVersion` em paralelo. `acquireImportLease` já aceita `statuses` e `onClaim` (`import-lease.ts:110-143`), então a análise pode reivindicar com a mesma função.
4. **Os campos de estado já existem.** `ImportSession` tem `leaseOwner`, `leaseExpiresAt`, `leaseHeartbeatAt`, `errorCode` e `errorMessage` (`schema.prisma:1078-1101`). O detalhe por categoria vive em `ImportSessionCategory`, gravado pela análise. Nenhuma migration é necessária para guardar o andamento, a falha ou o preview.
5. **A tela reanalisa em toda montagem.** `ImportPreviewScreen.tsx:68-98` chama `analyzeImport` com chave de idempotência nova sempre que monta. Não existe rota que leia o preview gravado: o único caminho até `importPreviewSchema` é `POST .../analyze` (`packages/public-api-contract/src/routes.ts:181`).
6. **A tela trata incerteza como falha.** `handleExecute` (`ImportPreviewScreen.tsx:134-160`) mostra `executeErrorMessage` para qualquer erro, inclusive timeout de transporte, sem reler o estado. `retryPending` (`ImportRunScreen.tsx:249-265`) faz o mesmo. `ImportRunScreen` já lê `GET .../progress` a cada 3 s enquanto o estado é `EXECUTING` (`:30`, `:175`).
7. **O motivo do item falho não chega à tela.** `labels.ts:105` só traduz motivos de conflito (`CONFLICT_REASON_LABELS`). Os códigos de falha de item gravados pela execução — entre eles `IMPORT_SERVICE_MAPPING_MISSING`, `IMPORT_CUSTOMER_MAPPING_MISSING`, `IMPORT_APPOINTMENT_INTERVAL_INVALID`, `IMPORT_SOURCE_RECORD_INVALID`, `IMPORT_AVAILABILITY_COMPANY_MISSING` e `IMPORT_ITEM_FAILED` — não têm texto. A rota de progresso já carrega todos os itens da sessão (`routes.ts:1652`).
8. **A contagem de clientes some por condição de tela.** `ImportPreviewScreen.tsx:272` e `:340` só mostram `discoveredCount` quando `sourceSupported` é verdadeiro. Categoria com limitação declarada mostra só o texto da limitação, mesmo com itens descobertos.
9. **O padrão de trabalho em segundo plano já está decidido.** D-008: jobs no banco do dono e loops nos serviços existentes, com lease, sem fila externa nem serviço novo. `AutoCompleteLoop` (`apps/scheduling-service/src/modules/appointments/auto-complete-loop.ts`, ligado em `app/build-app.ts:49-57`) é a aplicação no Scheduling. A execução da importação já coordena pelo lease do banco (D-026).
10. **`/importacao` está fora do gate renderizado.** `apps/frontend/e2e/routes.ts:32` declara o motivo: uma URL, várias telas conforme o estado da sessão. Nenhuma medida de largura, contraste ou foco das telas de importação existe hoje.

## Fora do escopo

- **QA IM-06, IM-09, IM-10, IM-11, CL-04 e CL-05**: lista completa de clientes, disponibilidade somada, telefone sem código do país e preço zero. São do Goal062. O texto de limitação da categoria de clientes não muda aqui; só a contagem passa a aparecer (IM-05).
- A importação dentro do onboarding (U-09, Goal066).
- Loop, timer periódico, fila, worker ou processo novo. A retomada depois de queda é pedida pelo dono na tela (§4), não por varredura automática.
- Colocar `/importacao` no gate renderizado. As telas de importação continuam sem medida de largura, contraste e foco (§11).
- Mudar `INTERNAL_HTTP_TIMEOUT_MS`, o `rewrites` do Next, `IMPORT_LEASE_TTL_SECONDS` ou os timeouts do cliente da origem.
- As observações abertas do [review070](../reviews/070-review.md) e a 4 do [review059](../reviews/059-review.md) (`goal008-agenda.test.ts` intermitente). Se esse teste reprovar em `validate:integration`, o relatório nomeia o teste, a causa e a reexecução limpa, como no Goal059.
- Deploy e conta real. A conferência contra a conta de teste da Minha Agenda (U-05) é humana e fica fora da prova deste Goal (§9).

## Dependências e contexto mínimo

Leia só o necessário:

- as linhas IM-03, IM-04, IM-05, IM-07 e IM-08 do [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md);
- D-008 e D-026 em [DECISIONS](../DECISIONS.md), só a parte de lease e execução, e D-077 só nos Limites;
- em `apps/scheduling-service/src/modules/migrations/`: `import-lease.ts` inteiro, `execute` e `run` de `import-execution-service.ts`, `analyze` e `assertPreviewVersionCurrent` de `import-preview-service.ts`, e `COMPLETABLE_STATUSES`/`LIVE_STATUSES` de `import-completion-service.ts`;
- em `apps/scheduling-service/src/modules/internal-api/routes.ts`: as rotas de `/internal/calendar/imports` (`:1420-1685`), `buildMinhaAgendaReader`, `importSnapshotWindow` e `importPreviewSummaryDto`;
- `apps/scheduling-service/src/app/build-app.ts` e `auto-complete-loop.ts`, só como padrão de ciclo de vida no processo;
- `apps/bff/src/clients/scheduling/index.ts` (schemas e métodos de importação, `:334`, `:411`, `:1226-1350`) e as rotas de importação de `apps/bff/src/modules/calendar/routes.ts`;
- `packages/public-api-contract/src/schemas.ts` (`:1188-1400`) e `routes.ts` (`:179-187`);
- a seção de Importação de `apps/bff/PUBLIC_API_V1.md` (`:322-360`) e a linha 76;
- em `apps/frontend/src/features/imports/`: `ImportsScreen.tsx`, `ImportPreviewScreen.tsx`, `ImportRunScreen.tsx` e `labels.ts`; e os métodos de importação em `apps/frontend/src/data/services/`;
- os testes existentes que chamam `analyze` ou `execute` de forma síncrona: `apps/scheduling-service/tests/unit/import-routes.test.ts`, `import-preview-service.test.ts`, `import-execution-service.test.ts`, `import-lease.test.ts`; `apps/scheduling-service/tests/integration/goal010-import.test.ts`, `goal010-import-completion.test.ts`, `goal020-import-*.test.ts`; `apps/bff/tests/goal010-import-routes.integration.test.ts`, `goal020-import-state-routes.integration.test.ts`; `apps/frontend/tests/goal020-import-preview.test.tsx`, `goal020-import-run.test.tsx`, `goal020-imports-entry.test.tsx`, `goal020-schema.test.ts`.

## Pontos de implementação

- `apps/scheduling-service/src/modules/migrations/`: separar início e trabalho da análise e da execução, lease da análise, executor em segundo plano no próprio processo, gravação da falha.
- `apps/scheduling-service/src/modules/internal-api/routes.ts`: respostas de início, rota de leitura do preview e campos novos do progresso.
- `apps/scheduling-service/src/app/build-app.ts`: esperar os trabalhos em curso no `onClose`.
- `packages/public-api-contract/src/schemas.ts` e `routes.ts`, `apps/bff/src/clients/scheduling/index.ts`, `apps/bff/src/modules/calendar/routes.ts` e `apps/bff/PUBLIC_API_V1.md`.
- `apps/frontend/src/features/imports/` e o serviço de importação em `apps/frontend/src/data/services/`.
- Testes novos com prefixo `goal061-` em `apps/scheduling-service/tests/unit/`, `apps/scheduling-service/tests/integration/`, `apps/bff/tests/` e `apps/frontend/tests/`.

## Escopo obrigatório

### 1. Iniciar é uma requisição curta (scheduling-service)

`POST .../analyze` e `POST .../execute` passam a fazer, na requisição, só o que não depende da origem:

- conferir sessão, estado, conexão (`requireIntegration`) e, na execução, `previewVersion` e as configurações do calendário;
- reivindicar a sessão com `acquireImportLease`, gravando o estado novo no mesmo `UPDATE`: `ANALYZING` para a análise, `EXECUTING` para a execução, como a execução já faz;
- disparar o trabalho no próprio processo e responder **`202`** com `{ sessionId, status, previewVersion }`, sem esperar a origem.

Regras:

- **A requisição nunca chama a origem.** Nem o token, nem a leitura. Login recusado e origem indisponível passam a ser falha do trabalho (§3).
- **A análise reivindica o lease.** Estados de partida: os de `ANALYZABLE_STATUSES` (`DRAFT`, `ANALYZING` com lease vencido, `READY`, `PARTIAL`). Estado ao terminar: o mesmo que a baseline dá hoje para o estado de partida (`PARTIAL` continua `PARTIAL`; os demais viram `READY`). Como `ANALYZING` apaga o estado de partida, o Developer escolhe como recuperá-lo sem migration e prova os três casos.
- **Análise e execução se excluem pelo banco.** Com a sessão em `ANALYZING`, iniciar a execução é recusado; com a sessão em `EXECUTING`, iniciar a análise é recusado. Nova tentativa enquanto o lease está vivo é recusada com `IMPORT_SESSION_LEASE_HELD` (409), o código que a execução já usa. Concluir continua exigindo `READY` ou `PARTIAL`.
- **Idempotência igual à de hoje.** `withImportIdempotency` continua envolvendo o início. A mesma chave devolve a mesma resposta de início e não dispara um segundo trabalho.
- **Nada novo de infraestrutura.** Sem loop, timer periódico, fila, worker nem processo novo. O disparo é uma promessa do próprio processo, registrada num conjunto em memória só para que `app.close()` e os testes possam esperar os trabalhos em curso. Quem decide quem trabalha é o lease do banco (D-008, D-026), não o conjunto em memória.
- **Nenhuma migration e nenhum campo novo no schema.** Os campos do §4 da evidência bastam. Se o Developer concluir que não bastam, para e registra no relatório, em vez de criar migration.

### 2. O trabalho só grava enquanto tem o lease

- O trabalho renova o lease durante a leitura da origem e durante o lote, com `ImportLeaseHolder`, pelo relógio do banco.
- **Fencing:** a transação final da análise e cada escrita da execução só valem se a sessão ainda tem o mesmo `leaseOwner` e o estado esperado. Sessão substituída (`replace` em `POST /internal/calendar/imports`), integração apagada ou lease tomado por outra instância fazem o trabalho parar sem escrever nada de sessão, como a execução já faz ao perder o lease.
- A execução continua como hoje: itens, checkpoint, contagens relidas do banco, `PARTIAL` ou `READY` no fim, nunca `COMPLETED`.

### 3. Falha do trabalho fica gravada e tem causa

- Falha que não é de item (login recusado, origem indisponível, resposta fora da forma, erro nosso) grava `errorCode` sanitizado e libera o lease. A análise volta ao estado de partida. A execução fica em `EXECUTING` sem lease, como hoje, e é retomável.
- `errorMessage` nunca leva segredo, credencial, e-mail, senha, token nem corpo cru da origem.
- **Preview obsoleto descoberto pelo trabalho** (a origem mudou entre a análise e a execução) segue o contrato de hoje: nada é importado, a sessão volta a um estado analisável e o código gravado é `IMPORT_PREVIEW_STALE`.
- Iniciar de novo limpa `errorCode` e `errorMessage` no mesmo `UPDATE` da reivindicação, como a execução já faz.

### 4. Ler o andamento, o preview e a interrupção (scheduling-service)

- **Rota nova de leitura do preview**: `GET /internal/calendar/imports/:sessionId/preview`, só humano, sem efeito e sem `Idempotency-Key`. Devolve o preview da versão vigente lido de `ImportSession` e `ImportSessionCategory`, sem ler a origem. Sessão sem análise concluída (`previewVersion` 0) é recusada com código próprio. `changesSincePreviousVersion` não é gravado hoje; a rota nova não o devolve, e o contrato diz isso.
- **Campos novos em `GET .../progress`, por acréscimo:**
  - `interrupted`: verdadeiro quando a sessão está em `ANALYZING` ou `EXECUTING` com lease vencido **pelo relógio do banco**, ou sem lease. O frontend nunca compara relógio próprio;
  - `lastError`: `{ code }` ou `null`, com `code` num conjunto fechado declarado no contrato. A mensagem não é exposta;
  - `failedReasons` por categoria: `[{ reasonCode, count }]` dos itens `FAILED`, calculado dos itens que a rota já carrega.
- Os mesmos `interrupted` e `lastError` entram em `session` de `GET /internal/calendar/imports`, por acréscimo, para a tela saber o que mostrar ao montar.

### 5. Contrato público e BFF

- `POST /v1/calendar/imports/:sessionId/analyze` e `POST .../execute` passam a responder `202` com um schema novo de início, no lugar de `importPreviewSchema` e `importExecutionSchema`. O único consumidor é o frontend, atualizado no mesmo diff. `importExecutionSchema` sai do registro de rotas se nenhuma rota o usar mais.
- `GET /v1/calendar/imports/:sessionId/preview` nasce, com schema próprio.
- `importProgressSchema` e `importLiveSessionSchema` ganham os campos do §4.
- `apps/bff/src/clients/scheduling/index.ts` valida as respostas novas. As rotas do BFF repassam sem regra própria de estado.
- `apps/bff/PUBLIC_API_V1.md`: seção de Importação com o início assíncrono, a leitura do preview, os campos novos, a recusa por lease vivo e os códigos de `lastError`. **Junto, a observação 1 do review060:** a linha 76 deixa de dizer que `enableWrites` é recusado com `409 INTEGRATION_WRITES_NOT_SUPPORTED`; desde o Goal060 é `VALIDATION_ERROR` (400).

### 6. A tela acompanha, em vez de esperar (frontend)

- **Montar não reanalisa.** Com a sessão em `READY` ou `PARTIAL` e `previewVersion` maior que zero, a tela lê o preview gravado (§4). A análise só é iniciada sozinha quando a sessão está em `DRAFT` sem preview. Reler a origem fora disso é o botão "Analisar de novo", pedido pelo dono.
- **Sessão em `ANALYZING`** mostra "Analisando seus dados" e lê o estado a cada `PROGRESS_POLL_MS` até sair de `ANALYZING`. Ao chegar em `READY` ou `PARTIAL`, lê o preview.
- **"Importar tudo"** inicia a execução, sai da tela assim que o início é aceito e passa ao acompanhamento que `ImportRunScreen` já faz. Não fica ativo enquanto a sessão está em `EXECUTING`.
- **Incerteza não é falha.** Se o início da análise ou da execução falhar sem resposta do servidor (timeout, rede, 5xx de transporte), a tela relê o estado. Se a sessão estiver em `ANALYZING` ou `EXECUTING`, ou tiver avançado, mostra o andamento, não o erro. O texto de erro só aparece quando o estado relido mostra que nada começou.
- **Interrompida** (`interrupted`): a tela diz que a análise ou a importação parou no meio, que nada do que já entrou se perdeu, e oferece "Continuar", que inicia de novo.
- **Falha com causa** (`lastError`): texto distinto por classe — login recusado ("a senha pode ter mudado"), origem indisponível ("nada foi alterado, tente mais tarde"), preview obsoleto (o estado "Seus dados mudaram" que já existe) e falha nossa. Nenhum texto contém "token", "OAuth", "API", "HTTP", "lease" nem código cru.
- **Motivo do item falho (IM-08):** "O que ainda não entrou" mostra, por categoria, os motivos de `failedReasons` em linguagem leiga, com a contagem. `IMPORT_SERVICE_MAPPING_MISSING` diz que o serviço do atendimento não veio da Minha Agenda (por exemplo, porque foi apagado lá). Todo código conhecido tem texto; código desconhecido cai num texto genérico, nunca no código cru.
- **Contagem de clientes (IM-05):** a revisão e a escolha mostram `discoveredCount` também em categoria com limitação, junto do texto da limitação.

### 7. Provas que reprovam na baseline

Cada teste novo é rodado primeiro contra o código da baseline, e a saída do vermelho vai colada no relatório. A origem é sempre um leitor de teste ou um servidor local. Nenhum teste chama a Minha Agenda real.

1. **Scheduling, contra PostgreSQL real** (suíte de integração do Scheduling), com uma **origem que só responde quando o teste a libera** (trava controlada pelo teste; equivale a uma origem de mais de 30 s sem esperar 30 s de relógio):
   - `POST .../analyze` responde `202` com `ANALYZING` enquanto a origem está travada; o banco mostra `ANALYZING` com lease; liberada a origem, a sessão chega a `READY` e o preview lido pela rota nova bate com o gravado;
   - o mesmo para `POST .../execute`, com `EXECUTING` durante a trava e `PARTIAL` ou `READY` no fim, e os itens gravados;
   - com a análise travada, iniciar a execução é recusado; com a execução travada, iniciar a análise é recusado; um segundo início com chave nova é recusado com `IMPORT_SESSION_LEASE_HELD`; a mesma chave devolve a mesma resposta e não dispara segundo trabalho;
   - reanálise de sessão `PARTIAL` termina `PARTIAL`; de `DRAFT` e `READY`, termina `READY`;
   - `replace` com a análise travada: liberada a origem, o trabalho antigo não grava nada na sessão substituída nem na nova;
   - lease vencido em `ANALYZING` e em `EXECUTING` aparece como `interrupted` em `progress` e em `GET /internal/calendar/imports`, e um novo início retoma;
   - duas sessões de negócios diferentes não se enxergam em nenhuma das rotas novas.
2. **Scheduling, unitário:** login recusado, origem indisponível e erro nosso no trabalho gravam `errorCode` do conjunto fechado, liberam o lease e devolvem a análise ao estado de partida; `errorMessage` não contém a senha, o e-mail nem o token usados no teste; `failedReasons` conta por motivo; preview de sessão sem análise é recusado com o código próprio.
3. **BFF:** as rotas de início repassam `202` e passam no schema novo; a rota de preview e os campos novos de `progress` e de `GET /v1/calendar/imports` passam no schema do contrato; `IMPORT_SESSION_LEASE_HELD` chega como `UPSTREAM_ERROR` com `details.upstreamCode`.
4. **Frontend (jsdom), com erros montados no formato real do BFF** (`code: "UPSTREAM_ERROR"` e o código em `details.upstreamCode`):
   - montar a tela três vezes com sessão `READY` e preview gravado não chama `analyzeImport` nenhuma vez e mostra o preview lido;
   - sessão `DRAFT` sem preview inicia a análise uma vez; sessão `ANALYZING` não inicia e lê o estado até `READY`;
   - "Importar tudo" com falha de transporte, e o estado relido em `EXECUTING`, mostra o andamento e nenhum texto de erro; com o estado relido sem início, mostra o erro;
   - `interrupted` mostra "Continuar"; cada classe de `lastError` mostra o seu texto;
   - `failedReasons` com `IMPORT_SERVICE_MAPPING_MISSING` mostra o texto leigo e a contagem; código desconhecido mostra o genérico;
   - categoria com limitação mostra a contagem;
   - nenhum texto de erro ou de motivo contém "token", "OAuth", "API", "HTTP", "lease" nem código cru.

Os testes existentes continuam passando. Só muda asserção de teste que espera a resposta síncrona de `analyze` ou `execute`, e o relatório lista cada uma dessas mudanças com o motivo. Teste que dependia do resultado síncrono passa a esperar o trabalho terminar (pelo conjunto em memória ou pelo estado do banco), não a ser apagado.

### 8. Controles negativos, rodados depois da última edição de código

Aplique cada controle numa cópia, ou reverta-o no mesmo passo. Cole a **saída real** no relatório, como nos Goals 059, 060 e 070:

1. A rota de análise volta a aguardar o trabalho antes de responder: o teste de origem travada do §7.1 reprova.
2. A análise deixa de reivindicar o lease: o teste de análise e execução simultâneas do §7.1 reprova.
3. A transação final da análise deixa de conferir o `leaseOwner`: o teste de `replace` do §7.1 reprova.
4. `interrupted` passa a ser calculado pelo relógio do processo e não pelo do banco, ou deixa de considerar lease vencido: o teste de interrupção do §7.1 reprova.
5. A tela volta a chamar `analyzeImport` ao montar com sessão `READY`: o teste jsdom do §7.4 reprova.
6. `handleExecute` volta a mostrar o erro sem reler o estado: o teste jsdom de falha de transporte do §7.4 reprova.

### 9. O que só uma pessoa confere

Depois do aceite, com a pilha local e a conta de teste de U-05, uma pessoa confere que a análise e a importação de uma conta real terminam e que a tela acompanha até o fim. O relatório e os documentos dizem que essa conferência **não foi feita** por este Goal.

### 10. Documentação

No mesmo diff, por **acréscimo**:

- `apps/bff/PUBLIC_API_V1.md`: o §5.
- [DECISIONS](../DECISIONS.md) ganha **D-078** em `PROPOSED`, no formato de D-073 a D-077. Ela diz que:
  - análise e execução da importação começam numa requisição curta e terminam no processo do Scheduling, coordenadas só pelo lease do banco;
  - a análise passa a ter lease e exclui a execução pelo estado;
  - a retomada depois de queda é pedida pelo dono, sem loop nem varredura;
  - `interrupted` é decidido pelo relógio do banco;
  - a falha do trabalho fica gravada com código de conjunto fechado, sem mensagem exposta;
  - a tela lê o preview gravado e só relê a origem por pedido do dono.

  Limites da D-078: trabalho em curso numa instância que cai só é retomado quando alguém pede; `/importacao` segue fora do gate renderizado; a conferência humana do §9 não foi feita. D-078 aplica D-008 à importação e diz isso, sem reescrever D-008 nem D-026.
- [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§39**, sem reescrever §4 a §38: **QA IM-03, IM-04, IM-05, IM-07 e IM-08** corrigidos, com a ressalva de que são achados da revisão local e não entram na contagem A-01…A-24. O veredito segue **0/7/6**, recontado por execução.
- [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram o início assíncrono, o lease da análise, a leitura do preview, os campos novos, a conferência humana pendente e as contagens da execução final. As contagens incluem as suítes de `apps/scheduling-service` (unitária e de integração), `apps/bff` e `apps/frontend` (arquivos e testes), `test:gate` e o `expected`/`unexpected`/`flaky` do gate autenticado.
- [D-008](../DECISIONS.md) ganha só uma nota de aplicação ("aplicada à importação no Goal061, ver D-078"), sem mudar status nem texto.
- O [QA_LOCAL_REVIEW](../QA_LOCAL_REVIEW.md) não é editado.

**A regra do Goal054 §12 continua valendo:** toda afirmação de contagem, linha, conjunto ou evidência em documento permanente nomeia a execução ou o ramo de código que a sustenta, conferida contra a execução final. Escreva a prosa **depois** da execução final.

### 11. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/evolution-go/`, `tools/ia-loop/`, migrations, schema Prisma nem `QA_LOCAL_REVIEW.md`. Em `packages/`, só `packages/public-api-contract/`.
- Não muda a conexão com a origem (D-077), a leitura da origem, a classificação de itens, os conflitos, a conclusão nem a remoção da credencial.
- Não muda `INTERNAL_HTTP_TIMEOUT_MS`, o `rewrites` do Next, `IMPORT_LEASE_TTL_SECONDS` nem timeouts do cliente da origem. O defeito se resolve por não esperar, não por esperar mais.
- Não cria loop, timer periódico, fila, worker nem processo.
- Não afirma largura, contraste, foco nem movimento das telas de importação: `/importacao` não é medida pelo gate renderizado.
- Não chama a Minha Agenda real em teste, ensaio ou gate.
- Não afrouxa gate: nenhuma exceção nova em `KNOWN_*`, nenhum passo a menos em `validate:integration` ou `validate:core`, nenhuma regra de `final-production-audit.mjs` relaxada e nenhuma medida do gate autenticado desligada.
- Não remove teste, não pula teste e não encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. Análise e execução respondem `202` sem chamar a origem e terminam no processo, com o estado do banco em `ANALYZING` e `EXECUTING` durante o trabalho. Provado por execução do §7.1 contra PostgreSQL real, dentro de `validate:integration`, com o vermelho da baseline colado.
2. Análise e execução se excluem, o segundo início é recusado, a mesma chave não dispara segundo trabalho, e o trabalho sem lease não grava. Provado por execução do §7.1.
3. Reanálise preserva o estado de partida como a baseline, e falha do trabalho grava código do conjunto fechado sem segredo. Provado por execução do §7.1 e do §7.2.
4. `interrupted` vem do relógio do banco e a retomada funciona. Provado por execução do §7.1.
5. O preview é lido sem reler a origem, e montar a tela com sessão `READY` não reanalisa. Provado por execução do §7.1 e do §7.4.
6. Nenhuma tela declara falha de operação que começou; "Importar tudo" não fica ativo durante a execução; interrupção, causa da falha, motivo do item falho e contagem de clientes aparecem como no §6. Provado por execução jsdom do §7.4. Largura, toque, contraste, foco e movimento das telas medidas continuam decididos por `validate:ui`; as de importação não são medidas (§11).
7. Contrato público, BFF e `PUBLIC_API_V1.md` descrevem as rotas e campos novos, e a linha 76 não afirma mais `INTEGRATION_WRITES_NOT_SUPPORTED`. Provado por diff e por execução do §7.3 e de `test:gate`.
8. Os seis controles negativos do §8 reprovam com o defeito e passam sem ele. A saída está colada, e os controles rodaram depois da última edição de código. Provado por execução.
9. Typecheck e lint de `apps/scheduling-service`, `apps/bff` e `apps/frontend` passam. As suítes não têm teste a menos que a baseline (`test:frontend` **77** arquivos e **718** testes; unitária do Scheduling **30** arquivos e **410** testes). `test:gate` não tem teste a menos que **233**. `validate:core`, `validate:ui` e `validate:integration` passam, este com o gate autenticado em **65** testes ou mais e **0** retentativas. Provado por execução.
10. D-078 em `PROPOSED`, FINAL_AUDIT §39, CURRENT_STATE, VALIDATION_GATE e `PUBLIC_API_V1.md` foram escritos por acréscimo, trazem as contagens da execução e dizem que a conferência humana do §9 não foi feita. Provado por diff contra a execução.
11. `git status --porcelain=v1 -uall` lista só os arquivos declarados, sem resto de controle negativo nem artefato de `e2e-results/`. Provado por execução.

**O que o aceite não prova:**

- que a análise e a importação de uma conta real terminam. Isso é a conferência humana do §9;
- que as telas de importação cumprem largura, toque, contraste, foco e movimento, porque `/importacao` não está no gate renderizado;
- que a tela bate com o protótipo aprovado, o que é conferência humana (Goal069);
- a base inteira de clientes, a disponibilidade substituída e o telefone normalizado, que são do Goal062.

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | COMPLEX | — | Início curto, lease da análise, trabalho em segundo plano no processo, fencing e falha gravada no scheduling-service (§1 a §3), com os testes `goal061-` do §7.1 e do §7.2 que cobrem início, exclusão, idempotência, fencing e falha |
| WU-02 | STANDARD | WU-01 | Rota de leitura do preview e campos `interrupted`, `lastError` e `failedReasons` (§4), com os testes de preview, interrupção, isolamento e `failedReasons` |
| WU-03 | STANDARD | WU-01, WU-02 | Contrato público, cliente e rotas do BFF e `PUBLIC_API_V1.md` (§5), com os testes `goal061-` do BFF (§7.3) |
| WU-04 | STANDARD | WU-03 | Telas de preview e execução, textos de causa e de motivo, contagem de clientes (§6), com os testes jsdom (§7.4) |
| WU-05 | STANDARD | WU-01, WU-02, WU-03, WU-04 | Controles negativos (§8) e documentação (§10) |
| WU-06…WU-19 | DETERMINISTIC | WU-05 | typecheck e lint dos três apps, testes dirigidos (`goal061`) nos três, gate-tests, git-diff-check, validate-core, validate-ui e validate-integration |

A unidade `validate-integration` roda a suíte de integração do Scheduling (onde fica o §7.1), a do BFF e o gate autenticado contra bancos descartáveis. Os testes dirigidos do Scheduling pulam o §7.1 sem banco, como no Goal060; os critérios 1 a 4 exigem a saída de `validate:integration`. Se ela falhar em passo sem relação com o diff, o relatório nomeia o passo, a causa e a reexecução limpa, como o Goal059 fez com `goal008-agenda`.
