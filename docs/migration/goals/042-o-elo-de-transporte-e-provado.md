# Goal 042 — O elo de transporte é provado: texto que sai do serviço Go e origem fora do relé

**Status: ACCEPTED** na rodada 2, conforme o [review042](../reviews/042-review.md) — uma rodada `CHANGES_REQUIRED` com 9 blockers antes do aceite com zero blockers. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-21 pelo Tech Lead Agent após [Goal041 ACCEPTED](../reviews/041-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 042 nasce na [v63 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 041, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `da0f06d9431bdd73e33c4eb301e5edefd7df986a`

Goal anterior: 041 — O canal único é provado: saída de texto fora da porta e cadeia de trânsito de um elo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal041 já integrado em `main` (origem `25478784d6da5c2ea414631cee615ba810c4de7d`), com `discoverHttpEgressSites` enumerando **9** sítios de egresso HTTP das duas árvores TypeScript com resíduo zero e **um** em `product_prose_to_client_number`, o egresso genérico fail-closed pelos chamadores, `followTransitChain` percorrendo até raiz classificada com ciclo reportado, e o [review041](../reviews/041-review.md) aceito na rodada 5 com zero blockers. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

A série tem uma forma constante, e cada passada fecha o nível anterior e declara em uma frase o nível que não tocou. O 038 fechou a **classe** dentro de cada extrator. O 039 fechou o **escopo** de leitura. O 040 fechou o **canal**, derivando da porta os métodos portadores. O 041 fechou o **egresso**: nenhum `fetch(` das duas árvores TypeScript escapa da enumeração, e a cadeia de trânsito é seguida até raiz classificada. O limite que o 041 declarou, por escrito, no aceite e em **D-057 item 5**, é de outra natureza: **é uma fronteira de serviço**.

O produto não entrega texto ao WhatsApp. Ele entrega texto ao serviço Go, e o serviço Go entrega ao WhatsApp. Todo o trabalho dos Goals 034 a 041 prova propriedades do lado de cá da fronteira — qual texto o produto compõe, por qual porta ele sai, por qual egresso HTTP ele parte, e que só existe um. Do lado de lá, `apps/evolution-go/` tem **53** arquivos `.go` de produção em `pkg` e `cmd`, **19** sítios de `.SendMessage(` em 4 arquivos e **69** literais `waE2E.*Message{` em 3 arquivos, e **nenhum guard do repositório lê essa árvore**. A afirmação "o serviço Go é um relé" nunca foi verificada por execução nenhuma: ela é prosa em documento, e o aceite do 041 a registra explicitamente como limite declarado, não como fato provado.

**O que existe hoje, conferido sobre esta baseline, é um relé e uma exceção.** A cadeia do produto atravessa a fronteira por um valor: `EVOLUTION_SEND_TEXT_PATH` vale `/send/text` (`apps/ai-orchestrator/src/config/env.ts:83` e `apps/ai-orchestrator/.env.example:21`), o Go registra `eng.Group("/send")` mais `routes.POST("/text", …, r.sendHandler.SendText)` (`pkg/routes/routes.go:136` e `:141`), o handler liga o corpo a `send_service.TextStruct` e recusa corpo sem `Text`, e `sendTextWithRetry` escreve `Text: &data.Text` (`pkg/sendMessage/service/send_service.go:611-612`). Isso é relé puro: o campo portador recebe o campo do corpo recebido, sem composição. A exceção é `pkg/whatsmeow/service/whatsmeow.go:1803-1810`: no auto-rejeite de chamada, o serviço envia `ExtendedTextMessage{Text: &mycli.Instance.MsgRejectCall}` **ao número que ligou**, e a origem desse texto não é o corpo recebido — é configuração de instância (`pkg/instance/model/instance_model.go:33`, default `''`). Conferido: **nenhum** arquivo de `apps/bff/src` ou de `apps/ai-orchestrator/src` menciona `msgRejectCall` ou `rejectCall`, de modo que o produto nunca preenche esse campo e nada sai hoje. Nada em gate nenhum notaria se deixasse de ser assim.

Conferido, e é o que faz este Goal ser fechamento de fronteira e não conserto: **hoje não há violação real**. Nenhuma prosa literal composta em Go chega à cliente — os únicos literais em campo portador de texto são **21** `proto.String("")` de `QuotedMessage`. O resultado esperado é achado zero. A regra existe para o dia em que houver, que é o dia em que ninguém vai reler este documento — e vale lembrar que o `AGENTS.md` de `apps/evolution-go/` já proíbe lógica de produto nesse fork, sem que nada verifique a proibição.

O risco próprio deste Goal é o das passadas anteriores, deslocado mais uma vez, e agora com uma língua a mais: **descobrir demais**. Uma árvore Go de transporte tem envio de recibo, de presença, de histórico, de mídia, de enquete e de reação; tratar tudo como canal de texto à cliente transforma a árvore inteira em resíduo. E há um risco novo, específico da fronteira: **provar o lado errado**. Nada aqui prova comportamento em runtime do serviço Go, nem que o binário em produção é o desta árvore; o que se prova é o que a árvore de código diz, lida por AST.

Seis decisões de planejamento já estão tomadas e **não** são do Developer:

- **O guard mora em pacote Go novo, só de teste, e nenhum arquivo Go de produção muda.** O `AGENTS.md` de `apps/evolution-go/` manda evitar alterar o fork sem necessidade explícita: ler a árvore não é alterá-la. O pacote novo não é importado por `cmd/evolution-go`, e o `go build ./...` e o `go vet ./...` de `validate:core` passam a cobri-lo.
- **O reconhecimento é por forma, com AST, nunca por nome de arquivo, pasta, função, rota ou receptor.** `go/parser` e `go/ast` da biblioteca padrão; **nenhuma dependência nova em `go.mod`**. Esta é a família de blocker dos Goals 036 a 041 e é blocker aqui também: allowlist por nome em qualquer regra reprova o Goal.
- **O campo portador de texto é derivado, não digitado.** O conjunto de campos que carregam texto sai das declarações de `whatsmeow-lib/proto/waE2E/WAWebProtobufsE2E.pb.go` — campo `*string` de struct de mensagem —, o mesmo movimento que `parseWhatsAppProviderMethods` fez no Goal040 com a porta `WhatsAppProvider`. Lista de nomes de campo escrita à mão dentro do guard é blocker.
- **Sítio de saída sem categoria reprova; não avisa.** Todo sítio cai em exatamente uma categoria nomeada, com o motivo escrito junto no código. Forma não reconhecida vira erro com `arquivo:linha`, nunca passagem silenciosa. Resíduo zero sobre a árvore real é exigência, e a enumeração vai no relatório.
- **A fronteira é atravessada por valor, e cada lado é lido na língua que o parseia.** O lado Go não parseia TypeScript e o lado TypeScript não parseia Go. O encontro é o valor de `EVOLUTION_SEND_TEXT_PATH`, lido de `apps/ai-orchestrator/.env.example` como `CHAVE=VALOR` pelo guard Go e computado de `apps/ai-orchestrator/src/config/env.ts` pelo guard TypeScript. Chave ausente reprova — fail-closed —, nunca pula o teste.
- **`apps/*/src/` não é editado e `PRODUCT_OWN_TEXTS` não muda.** Achado zero é o resultado esperado e **não** é o critério de sucesso: o que prova o Goal é o descobridor funcionando sobre a árvore real com resíduo zero **e** os controles negativos mordendo. Violação real encontrada em código de produção vira **achado a partir de A-24**, com classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) — não vira correção silenciosa, e não vira edição do fork.

## Dependências e contexto mínimo

- Goals 001 a 041 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [review041](../reviews/041-review.md): a seção "O que este aceite não cobre", em especial *"`apps/evolution-go/` continua fora do alcance do descobridor"*, que é a frase que este Goal endereça; e as observações não bloqueantes, em especial a do harness (abaixo).
- [DECISIONS](../DECISIONS.md): **D-050** (o guardrail vale sobre texto próprio do produto, não sobre texto do modelo), **D-054** (reconhecimento por forma exige resíduo declarado), **D-055** (escopo computado), **D-056** (conjunto derivado da porta) e **D-057**, cujo **item 5** é o limite que este Goal fecha. Todas continuam valendo inteiras.
- [FINAL_AUDIT §18](../FINAL_AUDIT.md): o veredito vigente — **0 `BLOQUEADOR-MVP`, 7 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`** — e o registro de que nenhum achado novo entrou a partir de A-24.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e os checks dos Goals 035 a 041.
- [AGENTS.md](../../../AGENTS.md) e `apps/evolution-go/AGENTS.md`: o guardrail de produto e a regra de que o fork é transporte e não recebe lógica de produto.
- **Harness, declarado e não consertado aqui:** a correção de `scopeRelativePattern` em `tools/ia-loop/lib/deterministic-executor.mjs` existe **só na worktree do Goal041**. Enquanto não for integrada, o gate `targeted-tests` reprova com `No test files found, exiting with code 1`. Isso é **declarado no relatório**, com a execução manual equivalente como prova, e **não** é consertado dentro deste Goal. Reverter, reintroduzir ou editar qualquer arquivo de `tools/ia-loop/` é blocker — as rodadas 2 a 4 do 041 se perderam exatamente nesse laço.
- **Product Vault:** não é necessário. Nenhuma regra de negócio, nenhuma copy e nenhuma decisão de produto são tocadas aqui.

### Fatos já confirmados na baseline, sem precisar redescobrir

Os números abaixo vêm de **busca textual** sobre esta baseline. A enumeração por AST é a que vale: se ela divergir, a divergência é **declarada no relatório e na decisão nova**, e o número do AST vence. Copiar número deste documento para dentro de teste ou de documento sem conferir na árvore foi blocker nas rodadas 1 a 4 do Goal041.

- `apps/evolution-go/pkg` e `cmd` têm **53** arquivos `.go` de produção (fora `_test.go`) e **17** arquivos `_test.go`. `whatsmeow-lib/` é biblioteca vendorizada e **não** é árvore de produto: é lida apenas como fonte das declarações de proto.
- **19** sítios de `.SendMessage(` em 4 arquivos: `pkg/chat/service/chat_service.go`, `pkg/message/service/message_service.go`, `pkg/sendMessage/service/send_service.go` e `pkg/whatsmeow/service/whatsmeow.go`. Parte deles é chamada ao wrapper interno `s.SendMessage(...)` (`send_service.go:2021`) e parte é chamada ao cliente whatsmeow — distinguir os dois é trabalho do descobridor, não premissa.
- **69** literais `waE2E.*Message{`: 63 em `send_service.go`, 4 em `message_service.go`, 2 em `whatsmeow.go`.
- Cadeia de `/send/text`, elo a elo: `env.EVOLUTION_SEND_TEXT_PATH` com default `/send/text` (`apps/ai-orchestrator/src/config/env.ts:83`), o mesmo valor em `apps/ai-orchestrator/.env.example:21`; `EvolutionProvider.ts:53` monta a URL e `:73` faz o `fetch`; `pkg/routes/routes.go:136` abre `eng.Group("/send")` e `:141` registra `routes.POST("/text", …, r.sendHandler.SendText)`; `pkg/sendMessage/handler/send_handler.go:45` liga o corpo a `*send_service.TextStruct` e recusa `Text` vazio; `pkg/sendMessage/service/send_service.go:594` chama `sendTextWithRetry`, que em `:611-612` escreve `Text: &data.Text`.
- Origem de texto que **não** é o relé: `pkg/whatsmeow/service/whatsmeow.go:1803-1810` envia `Instance.MsgRejectCall` ao `evt.CallCreator` quando `Instance.RejectCall` está ligado. O campo é `MsgRejectCall string` com default `''` (`pkg/instance/model/instance_model.go:33`), gravado por `pkg/instance/service/instance_service.go:187` a partir de `AdvancedSettings`. Nenhum arquivo de `apps/bff/src` nem de `apps/ai-orchestrator/src` menciona `msgRejectCall` ou `rejectCall`.
- **21** ocorrências de `proto.String("")` em campo portador de texto, todas em `QuotedMessage` de `send_service.go`. São os únicos literais de string em campo portador na árvore de produção Go.
- `whatsmeow-lib/proto/waE2E/WAWebProtobufsE2E.pb.go` tem **24862** linhas e **252** declarações de struct; campos portadores de texto são os `*string`, como `ExtendedTextMessage.Text` (`:7505`).
- `validate:core` executa `build:evolution-go`, `vet:evolution-go` e `test:evolution-go` (`cd apps/evolution-go && go test ./...`), então o guard novo entra no gate global sem script novo. Go 1.25.0 em `go.mod`.
- Números do lado TypeScript, para comparar depois: `tests/assistant/assistant.service.test.ts` com **66** testes; `npm run test:gate` com **226 pass, 0 fail**; `audit:static` com **34** checks; `validate:integration` com **35** passos; `apps/ai-orchestrator/tests/support/` com **quatro** arquivos (`http-egress-sites.ts`, `send-text-sites.ts`, `notification-message-sites.ts`, `vocabulario-de-espera.ts`).

## Pontos de implementação

- `apps/evolution-go/pkg/` — diretório novo para o pacote de guard, só de teste, com o descobridor e os testes que o exercitam. Nenhum arquivo Go existente é alterado.
- `apps/ai-orchestrator/tests/support/http-egress-sites.ts` — o lado TypeScript do encontro por valor: o default de `EVOLUTION_SEND_TEXT_PATH` computado de `config/env.ts` e comparado ao `.env.example`.
- `apps/ai-orchestrator/tests/assistant/assistant.service.test.ts` — a afirmação permanente desse encontro, junto das que já existem.

## Escopo obrigatório

### 1. O conjunto de saídas de texto do transporte é computado

Um descobridor novo, em Go, lê `apps/evolution-go/pkg` e `cmd` inteiros — todos os `.go` de produção, sem `_test.go` e sem `whatsmeow-lib/` — e enumera **todo sítio que coloca texto no fio em direção a um número de WhatsApp**. O reconhecimento é por forma: literal composto de mensagem do pacote de proto com pelo menos um campo portador escrito, e a chamada de envio que o consome. O conjunto de campos portadores é **derivado** das declarações de `waE2E`, nunca digitado. Sítio cuja forma não é reconhecida vira erro com `arquivo:linha`; resíduo zero sobre a árvore real é exigência, e a enumeração completa vai no relatório.

Distinguir chamada ao wrapper interno de chamada ao cliente whatsmeow é parte do trabalho: as duas existem no mesmo arquivo, e a categoria de cada uma é nomeada.

### 2. A origem de cada texto é classificada, e origem fora do relé é conjunto asserido

Para cada campo portador escrito, o descobridor resolve **de onde vem o valor**, dentro do bloco da função que o contém e dos parâmetros dela, e classifica em categoria nomeada com motivo escrito junto. No mínimo: texto vindo do corpo recebido pela rota (relé), texto vindo de configuração de instância, literal escrito em Go, placeholder vazio, e valor resolvido no chamador. Categoria nova é permitida; categoria implícita não.

Duas asserções permanentes saem daí:

- **Literal de prosa em Go que chega a número de cliente reprova.** Literal vazio é categoria própria e declarada, e não é prosa.
- **O conjunto de sítios cuja origem não é o relé é asserido, elemento a elemento.** Hoje ele tem **um** membro, o de `MsgRejectCall`, classificado como configuração de instância. Um segundo membro derruba o teste, com arquivo e linha, mesmo que o texto dele seja legítimo — a decisão de aceitá-lo passa a ser explícita e escrita.

### 3. A fronteira é atravessada por valor, nos dois lados

- **No Go:** o descobridor computa o caminho completo de cada rota registrada — prefixo do grupo mais caminho do registro, resolvidos por AST, não por concatenação escrita à mão —, lê `EVOLUTION_SEND_TEXT_PATH` de `apps/ai-orchestrator/.env.example` como `CHAVE=VALOR`, e afirma que esse valor é uma rota registrada cujo encadeamento — registro, handler, serviço — termina em sítio de saída com origem **relé**. Chave ausente, rota não registrada ou encadeamento que termine em outra origem reprovam, com o caminho impresso.
- **No TypeScript:** o default de `EVOLUTION_SEND_TEXT_PATH` é computado de `apps/ai-orchestrator/src/config/env.ts` e comparado ao valor de `.env.example`. Divergência entre os dois reprova. O valor não é digitado dentro do teste.

O que isso prova, e o que não prova, vai escrito: prova que o caminho que o produto usa é o caminho que o transporte trata como relé **nesta árvore de código**; não prova runtime, não prova qual binário roda em produção, e não prova que a variável de ambiente do ambiente real vale o default.

### 4. Controle negativo: cada invariante morde

Cinco controles obrigatórios. Cada um exercita **o artefato que o critério nomeia**, sobre árvore sintética montada em diretório temporário — nunca quebrando a árvore real e nunca deixando resíduo. Os controles 1 a 3 trazem **as duas saídas**: a mesma entrada contra a baseline aceita (onde o guard não existe, o que é declarado assim) e contra a árvore final, vermelha.

1. Literal de prosa em Go em campo portador de texto, entregue a um número: reprova com arquivo, linha e categoria.
2. Segunda origem de configuração de instância em campo portador: reprova por conjunto asserido, com arquivo e linha.
3. Campo portador alimentado por forma não reconhecida: vira resíduo nomeado com arquivo e linha, nunca passagem silenciosa.
4. O mesmo sítio movido para arquivo e pasta de outro nome: classificação **idêntica**. Nenhuma regra decide por nome.
5. A travessia por valor morde nos dois lados: caminho de `.env.example` que não corresponde a rota registrada reprova no Go; chave ausente reprova em vez de pular; e default de `config/env.ts` divergente do `.env.example` reprova no TypeScript.

### 5. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não alterar nenhum arquivo Go de produção de `apps/evolution-go/`**, nem `go.mod`, nem `go.sum`. O guard é pacote novo, só de teste, com biblioteca padrão. Nenhuma dependência nova.
- **Não mudar código de produção de `apps/frontend/src/`, `apps/bff/src/` nem `apps/ai-orchestrator/src/`.** As árvores de produção são **lidas**, nunca editadas. Violação real encontrada vira **achado a partir de A-24**, com impacto de produto em uma frase.
- **Não mudar uma letra de copy** e não alterar `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` nem `VOCABULARIO_DE_ESPERA`.
- **Não mudar comportamento da IA:** nenhum prompt, nenhuma regra de `MAIN_RULES`, nenhum bump de `PROMPT_TEMPLATE_VERSION`.
- **Não mudar o contrato público** nem o que as rotas devolvem, em nenhum dos dois serviços: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go, nenhuma migration e nenhum `schema.prisma`.
- **Não enfraquecer `audit:static`:** nenhum check removido, nenhuma regra afrouxada, nenhuma allowlist nova. `scripts/final-production-audit.mjs` fica intocado; o escopo deste Goal é camada de teste.
- **Não mudar o comportamento dos gates renderizados:** `retries: 1` inalterado nos dois `playwright.*.config.ts`, `flaky` continua não reprovando, `scripts/lib/playwright-report.mjs`, `scripts/validate-ui.mjs` e `scripts/goal033-authenticated-ui-rehearsal.mjs` intocados. Nenhuma tela, componente, texto de interface ou CSS.
- **Não tocar `apps/scheduling-service/` nem `apps/health-worker/`.**
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real, nenhuma conexão whatsmeow aberta, nenhuma requisição de rede acrescentada a suíte nenhuma. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não afirmar comportamento de runtime do serviço Go.** O que se prova é o que a árvore de código diz, lida por AST. Documento que disser mais do que isso é blocker.
- **Não corrigir nem reclassificar achado aberto:** A-04 a A-08, A-11 a A-17 e A-19 não são tocados; A-01 a A-03, A-09, A-10, A-18 e A-20 a A-23 continuam fechados e não são reabertos.
- **Não remover, renomear nem pular teste existente**, em Go ou em TypeScript, e não encolher a lista de 35 passos de `validate:integration`.
- **Não mexer em `tools/ia-loop/`**, em nenhum arquivo e em nenhuma rodada. Harness que impeça a execução é **declarado no relatório**, com execução manual equivalente.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha**, e nenhum `//nolint` em Go.
- **Não reabrir, reverter nem reexecutar aceite anterior.**

**Permitido, e opcional:** as três observações restantes do [review040](../reviews/040-review.md) — tipo de parâmetro importado de outro arquivo, `text: string | undefined` e `interface X extends Base`. Se alguma for endereçada, é mudança que **preserva** a direção do erro (resíduo nomeado, nunca classificação silenciosa), e o relatório diz o que mudou.

### 6. Prova

- `validate:core` exit 0 sobre a árvore final, com `build:evolution-go`, `vet:evolution-go` e `test:evolution-go` verdes e `audit:static` mantendo os 34 checks.
- `go test ./...` em `apps/evolution-go` com a contagem antes e depois — nenhuma suíte encolheu, nenhum teste pulado.
- `npm run test:gate` exit 0, com a contagem antes e depois. A suíte do `ai-orchestrator` verde, com a contagem de `assistant.service.test.ts` antes e depois (baseline: 66).
- Os cinco controles negativos executados, cada um com a saída real, e revertidos; os controles 1 a 3 com **as duas saídas**.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente, isso é **declarado como tal**, nunca apresentado como verde.
- A enumeração completa: cada sítio de saída de texto do transporte com arquivo, linha, categoria e origem; o conjunto de origens fora do relé, elemento a elemento; e o caminho completo da travessia por valor, dos dois lados.

### 7. Documentação

Escrita **depois** da última mudança de árvore, inclusive depois dos controles negativos e da reversão deles. Nas rodadas 2 a 4 do Goal041 o aceite travou porque a documentação afirmava um conjunto de arquivos que não era o da árvore. Aqui é critério de aceite, não recomendação: a documentação descreve o conjunto **real** de arquivos alterados, conferido por `git status --porcelain=v1` **depois** da última edição de código, com os números que a árvore final mostra.

- [CURRENT_STATE](../CURRENT_STATE.md): delta042 — que o serviço de transporte passou a ser lido por guard, quais categorias de origem existem, qual é o conjunto asserido de origens fora do relé, e como a travessia por valor funciona nos dois lados.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a regra nova decide **agora** e o que continua não decidindo — em especial que nada aqui prova runtime do serviço Go, que `whatsmeow-lib/` é vendorizada e fora do alcance, e que texto emitido pelo modelo continua fora do guardrail por **D-050**.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada (**§19**), no padrão de §8 e §10 a §18 e **sem reescrever** §4 a §18, registrando o fechamento, o veredito recontado (que **não** muda por este Goal, salvo achado novo) e os achados a partir de **A-24** quando houver. O que não for reexecutado é declarado como não reexecutado.
- [DECISIONS](../DECISIONS.md): **D-058**, no formato das anteriores, cobrindo por que o guard atravessa a fronteira de serviço em vez de continuar declarando limite, por que o campo portador é derivado das declarações de proto, por que a fronteira é atravessada por valor com cada lado lido na sua língua, e o que continua fora — runtime, binário de produção e `whatsmeow-lib/`.
- [MIGRATION_STATUS](../MIGRATION_STATUS.md) e [MASTER_PLAN](../MASTER_PLAN.md): atualizados **pelo commit de fechamento**, com o Goal042 no status resultante e o SHA aceito. Dezoito fechamentos seguidos omitiram isso; este não omite.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Todo sítio de saída de texto de `apps/evolution-go/pkg` e `cmd` é enumerado a cada execução, por AST, sem lista escrita à mão, e cai em categoria nomeada com motivo escrito junto; a enumeração completa está no relatório.
2. O resíduo sobre a árvore real é **zero**, e forma não reconhecida derruba o teste com `arquivo:linha` — provado pelo controle 3, com as duas saídas.
3. O conjunto de campos portadores de texto é derivado das declarações de `waE2E`; nenhum nome de campo está digitado dentro do guard.
4. Nenhuma allowlist por arquivo, pasta, função, rota, receptor ou linha entrou em nenhuma regra — provado pelo controle 4, com a classificação idêntica após mover o sítio.
5. Literal de prosa em Go em campo portador que chega a número de cliente derruba o teste — provado pelo controle 1, com as duas saídas. Literal vazio é categoria própria e declarada.
6. O conjunto de sítios com origem fora do relé é asserido elemento a elemento; hoje tem **um** membro, o de `MsgRejectCall`, classificado como configuração de instância. Membro novo derruba o teste — provado pelo controle 2, com as duas saídas.
7. O caminho completo de cada rota registrada é computado por AST, incluindo o prefixo do grupo, e não por string escrita à mão.
8. O valor de `EVOLUTION_SEND_TEXT_PATH` é lido de `apps/ai-orchestrator/.env.example` pelo guard Go e corresponde a rota registrada cujo encadeamento termina em saída com origem relé; chave ausente reprova em vez de pular — provado pelo controle 5.
9. O default de `EVOLUTION_SEND_TEXT_PATH` é computado de `apps/ai-orchestrator/src/config/env.ts` e comparado ao `.env.example`; divergência reprova — provado pelo controle 5. O valor não está digitado dentro do teste.
10. O guard Go vive em pacote novo, só de teste, não importado por `cmd/evolution-go`; `go.mod` e `go.sum` não mudaram e nenhuma dependência nova entrou.
11. Nenhum arquivo Go de produção de `apps/evolution-go/` mudou, provado por diff.
12. Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/` mudou; nenhum de `apps/scheduling-service/` ou `apps/health-worker/`; nenhuma migration e nenhum `schema.prisma`; **nenhum arquivo de `tools/ia-loop/`**.
13. `PRODUCT_OWN_TEXTS`, `VERIFIED_CLIENT_TEXTS` e `VOCABULARIO_DE_ESPERA` são idênticos aos da baseline, provado por diff, e nenhuma copy mudou.
14. Os **9** sítios de egresso HTTP e as categorias do Goal041 continuam classificados com resíduo zero, e as 2 cadeias de trânsito continuam terminando em raiz classificada.
15. O contrato público não mudou: `packages/public-api-contract/src/schemas.ts` e `routes.ts` intocados, nenhuma rota, verbo ou campo novo ou removido no BFF nem no Go.
16. Nenhum prompt, nenhuma regra de `MAIN_RULES` e nenhuma versão de template mudou.
17. `audit:static` continua com 34 checks e não perdeu regra; `public_api_route_coverage` continua imprimindo uma única rota sem chamador.
18. `retries: 1` continua inalterado nos dois `playwright.*.config.ts`, `flaky` continua terminando com sucesso, nenhum teste do gate renderizado foi pulado, marcado `fixme`, removido ou teve tolerância aumentada, e a matriz continua com as cinco larguras.
19. Os cinco controles negativos obrigatórios existem, cada um exercita o artefato que o critério nomeia, a saída real de cada um está no relatório, os controles 1 a 3 trazem as duas saídas, e nenhuma quebra sobrou na árvore.
20. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado; `validate:integration` continua com os mesmos 35 passos, a suíte Go não encolheu e `assistant.service.test.ts` não encolheu abaixo dos 66 testes da baseline.
21. Nenhum achado de A-04 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado, e nenhum achado fechado foi reaberto; violação encontrada em código de produção virou achado a partir de **A-24**.
22. Nenhum documento afirma que **M4** foi fechado, que a fidelidade visual está provada, que a verificação de resposta roda em produção, nem que o comportamento de runtime do serviço Go foi provado.
23. `validate:core` exit 0 e `npm run test:gate` exit 0 sobre a árvore final.
24. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
25. Falha do gate `targeted-tests` por caminho do harness é declarada como defeito conhecido do IA Loop, com execução manual equivalente no relatório, e **nenhum** arquivo de `tools/ia-loop/` foi editado em rodada nenhuma.
26. A documentação de §7 foi escrita **depois** da última mudança de árvore e descreve o conjunto real de arquivos alterados, conferido por `git status --porcelain=v1`; [DECISIONS](../DECISIONS.md) tem **D-058** no formato das anteriores; a seção nova de [FINAL_AUDIT](../FINAL_AUDIT.md) é **§19** e nenhuma seção anterior foi reescrita.
27. Números copiados deste documento que divergirem da árvore são declarados como divergência, com o número do AST prevalecendo.
28. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum diretório temporário de controle negativo sobrou.

## Entrega

Relatório do Developer com: a enumeração de cada sítio de saída de texto do transporte, com arquivo, linha, categoria e origem, e a saída real sobre a árvore Go; a derivação do conjunto de campos portadores a partir das declarações de proto, com a contagem computada; o conjunto de origens fora do relé, elemento a elemento; o caminho completo da travessia por valor nos dois lados, com o valor lido de cada fonte; as duas saídas dos controles 1 a 3 — baseline e árvore final — e a saída real dos controles 4 e 5; o critério que distingue sítio de saída de chamada interna, com os casos excluídos nomeados; a prova por diff de que nenhum arquivo Go de produção, nenhum `src/` dos três apps, nenhum `go.mod`/`go.sum` e nenhum arquivo de `tools/ia-loop/` foi tocado; o resultado por passo de `validate:core`, `go test ./...`, `test:gate` e `validate:integration`, com pré-condição ausente declarada quando for o caso; e o que ficou declaradamente fora — com **M4**, fidelidade visual, runtime do serviço Go, `whatsmeow-lib/` e A-04 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
