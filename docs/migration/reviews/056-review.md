# Review formal — Goal 056

**Decisão vigente — rodada 5: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-26, conforme o [Goal056](../goals/056-a-prosa-sai-do-fork-de-transporte.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–055) foi reaberto, reavaliado ou revertido. **Cinco rodadas**: as rodadas 1 a 4 terminaram `CHANGES_REQUIRED` com 4, 4, 3 e 1 blocker; a rodada 5, com zero.

A-24 estava registrado desde o [Goal042](../goals/042-o-elo-de-transporte-e-provado.md) ([FINAL_AUDIT §19](../FINAL_AUDIT.md), D-058) e ficou sem Goal por treze fechamentos: `send_service.go` compunha `"Ver Menu"` para `ListMessage.ButtonText` vazio, prosa de produto dentro do fork de transporte. Este diff tira a fallback do serviço, alinha a documentação do fork ao handler e deixa o guard de prosa ver um conjunto menor, computado. É o primeiro Goal da série desde o 042 que edita Go de produção.

## Escopo e identidade do diff

- Baseline aceita vigente: `5f33339d57375ed2ea3dbc6074b94c3d9625b15c` (fechamento do Goal055). Base imediata da implementação: `4041db270acc5a6687e67bd7b3f03c833a305b70`, HEAD da worktree `.ai-worktrees/goal-056`, inalterado nas cinco rodadas.
- Snapshot aceito, calculado pelo IA Loop: **14 arquivos**, hash do diff `52361f3fbe362e492733c436d6a53f99ae87fc19fee8fdaea35134d399063cfa`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Treze arquivos rastreados**, por `git diff --numstat 4041db2`: `send_service.go` (+5/−11; blob `8d37112`), `send_handler.go` (+1/−1, só comentário), `go_prose_test.go` (+16/−15), `off_relay_test.go` (+17/−18), `route_reach_test.go` (+75/−69), `docs/docs.go` (+2/−2), `docs/swagger.json` (+2/−2), `docs/swagger.yaml` (+2/−3), `docs/wiki/guias-api/api-interactive.md` (+3/−3) e os quatro documentos de `docs/migration/` por **acréscimo puro** — `DECISIONS.md` +193, `FINAL_AUDIT.md` +154, `CURRENT_STATE.md` +104, `VALIDATION_GATE.md` +32. **Um arquivo novo**: `pkg/sendMessage/service/send_service_list_test.go` (**34** linhas).
- `apps/ai-orchestrator/` tem diff zero, inclusive `product-transport-routes.txt` (**10** rotas). Nenhum arquivo de `apps/bff/`, `apps/frontend/`, `apps/scheduling/`, `packages/`, migration, `tools/ia-loop/` ou `apps/evolution-go/whatsmeow-lib/` foi tocado.

## Rodada 1 — CHANGES_REQUIRED (4 blockers)

O núcleo estava certo: `SendList` recusava antes de tocar dependência, o teste novo provava isso, swagger, `docs.go` e `@Description` estavam corretos. Os quatro blockers:

1. **Escopo §3 incompleto.** A tabela da wiki continuava marcando `title` e `footerText` como opcionais, e os documentos chamavam isso de "fora do escopo".
2. **Escopo §2 excedido.** `sectionsToString` ganhou uma recusa nova que o Goal não autorizava; o Goal mandava só retirar a fallback.
3. **Teste substituto vazio.** `TestGoal056RemovesTheProductProseLiteralFromTheTree` conferia só a posição fixa `send_service.go:1960`, já em branco, e não pegaria a fallback reintroduzida em outra linha. Trocar prova de isolamento por checagem posicional afrouxava o guard (§8).
4. **Evidência defasada.** Os documentos citavam `:1996` para `ListMessage.ButtonText`, não nomeavam a categoria computada e não registravam a contagem de arquivos de produção nem a viabilidade do segundo caso de teste (§4).

## Rodada 2 — CHANGES_REQUIRED (4 blockers)

Código de produção correto; blockers 1, 2 e 4-parcial da rodada 1 resolvidos. Abertos: o teste substituto ainda comparava pelo conteúdo digitado `"Ver Menu"`, e uma fallback com outro rótulo passaria; o comentário do teste e os documentos diziam "em lugar nenhum da árvore" quando o teste percorre só `GoProseLiteralsReachingTransport()`; as duas pendências do §4 seguiam sem registro; o controle negativo e o stat **+9/−11** descritos eram da rodada 1 (o real é **+5/−11**).

## Rodada 3 — CHANGES_REQUIRED (3 blockers)

O teste passou a checar **por campo** (`ButtonText` em `Fields`), e o reviewer reproduziu numa cópia que o rótulo `"Abrir"` reprova. A constante de conteúdo `"Ver Menu"` ficou como checagem extra, redundante e inofensiva. Abertos: a inviabilidade do segundo caso do §4 sem justificativa tirada do código (terceira rodada seguida); o controle negativo registrado em dois testes quando reprovam **quatro**; o stat **+83/−128** errado (o real, por `git diff 5f33339 --stat -- apps/evolution-go`, é **+123/−124**).

## Rodada 4 — CHANGES_REQUIRED (1 blocker)

Os três blockers da rodada 3 foram resolvidos no texto. Sobrou um erro de evidência: o controle negativo nos quatro documentos citava `:1960` e `:1996`, posições da baseline, quando a saída real do controle nomeia `:1955` e `:1991`.

## Rodada 5 — ACCEPTED

### Verificações próprias do reviewer

- **O serviço recusa em vez de preencher** (escopo §1). `SendList` devolve `button text is required` em `send_service.go:1953`–`:1955`, antes de cliente, instância ou rede; `ListMessage.ButtonText` em `:1990` lê `proto.String(data.ButtonText)`. O handler continua devolvendo `400` com a mesma mensagem.
- **A cópia sem chamador perdeu a fallback e não ganhou recusa** (escopo §2). `grep -rn sectionsToString` fora de `whatsmeow-lib/` acha só a declaração em `:1878`.
- **Nenhum `"Ver Menu"` em Go de produção** (critério 1): `grep -rn '"Ver Menu"' apps/evolution-go --include=*.go`, sem `whatsmeow-lib/` e `_test.go`, dá zero.
- **Os conjuntos do guard encolhem por execução** (escopo §5). `expectedGoProseLiterals` e `expectedProseLiteralsReachedFromRegisteredRoutes` vão de **27** para **26**, nas mesmas **5** rotas; as outras entradas mudam só de linha. `expectedOffRelaySources` perde `send_service.go:1996`/`SourceBranchDependent`: a escrita em `:1990` tem categoria computada `SourceRouteBody` (`value_from_route_body_parameter`), e `OffRelaySources` exclui essa categoria (`value_origin.go:520`). `expectedProseLiteralsReachedFromProductRoutes` segue vazio.
- **O controle negativo foi reproduzido por mim**, numa cópia no scratchpad, sem tocar a worktree (escopo §6). Com a fallback de quatro linhas mais `proto.String(buttonText)`, reprovam quatro testes: `go_prose_test.go:93` (`:1955`, `"Ver Menu"` em `[ButtonText]`), `off_relay_test.go:180` (`:1991`, `value_bound_differently_per_branch`), `route_reach_test.go:251` (`POST /send/list` → `:1955`) e `route_reach_test.go:292`/`:297`/`:321` (`:1955`). Com `"Abrir"`, os mesmos quatro reprovam, e o teste do Goal056 reprova pelo campo (`:297`), não pelo conteúdo (`:292`). As linhas e os deslocamentos de +1 batem com o que os quatro documentos dizem. Duas falhas extras na cópia vinham de caminho relativo para `apps/ai-orchestrator` e não existem na worktree real.
- **Sem resto do controle.** O blob de `send_service.go` na worktree é `8d37112`, o citado nos documentos; `git status` lista os 14 arquivos esperados.
- `go test ./pkg/transportguard/... ./pkg/sendMessage/...` passa na worktree, por execução minha.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutados por mim: os testes Go dos dois pacotes e o controle negativo. **Aceito pelos gates nativos da rodada, sem reexecução minha:** `gate-tests`, `validate-core` e `git-diff-check` passaram. Os números que os documentos registram — `go test ./...` com **62** testes de topo (**175** com subtestes), `validate:core` com **15** passos `passed` e **2** `skipped` (`test:bff`, `test:health-worker`), `test:gate` com **226**/**226** — vêm da execução do Developer. A contagem de **65** arquivos de produção na baseline e na árvore final vem de teste temporário do Developer, removido depois; a subida de **90** para **91** arquivos `.go` em `pkg/`+`cmd/` é o arquivo de teste novo. `validate:integration` não foi reexecutado; nada no diff toca banco ou infraestrutura.

### Observações não bloqueantes

Nenhuma afrouxa invariante, e nenhuma é condição do aceite.

1. **Os documentos listam só os deslocamentos dentro de `SendList`.** No controle negativo, as entradas de `send_service.go` a partir de `:2541` também deslocam +1. A leitura dos documentos continua correta; a lista é que não é exaustiva.
2. **A constante de conteúdo `"Ver Menu"` continua em `route_reach_test.go`**, como checagem extra ao lado da checagem por campo. É redundante com a checagem por campo e não afrouxa nada.
3. **`sectionsToString` segue sem chamador e com `Title: data.ButtonText` sem recusa.** Se ganhar chamador, entra no guard de alcance por rota; está em "Revisar se" de D-072.
4. **A série de rodadas veio de evidência documental, não de mecanismo.** Dos 12 blockers, 3 foram de código ou teste (recusa extra em `sectionsToString`, teste posicional vazio, teste por conteúdo digitado), 1 foi do contrato escrito do fork (tabela da wiki) e 8 foram de evidência em documento permanente: linha, número ou afirmação sem execução que a sustentasse. A regra do Goal054 §12 pegou todas, mas custou quatro rodadas; o próximo Goal que recompute `arquivo:linha` deve pedir que o controle negativo seja rodado **depois** da última edição de código e colado da saída.
5. **As observações abertas herdadas continuam abertas**: 1 a 3 do [review055](055-review.md) (as duas primeiras declaradas em D-071), as dos reviews 040, 041, 053 e 054. A correção em `tools/ia-loop/lib/deterministic-executor.mjs` segue sem aterrissar em `main`.

### O que este aceite não cobre

Não prova comportamento em runtime do serviço Go, conexão whatsmeow ou o que chega a um telefone, nem qual binário roda em produção. **M4** não fechou. Nenhum outro achado além de A-24 foi corrigido ou reclassificado. A rota `POST /send/list`, o payload aceito e as **10** rotas do produto não mudaram. Texto emitido pelo modelo continua fora do guardrail por **D-050**. A auditoria passa a **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP` e **6** `LIMITE-DECLARADO` ([FINAL_AUDIT §33](../FINAL_AUDIT.md)).

### Correções de registro feitas no fechamento

- **D-072 passa de `PROPOSED` a `ACCEPTED`**, com referência a este review e a contagem de rodadas, e ganha nota de fechamento com a observação 1. Nenhum outro texto de D-072 foi reescrito.
- **`FINAL_AUDIT §33`** passa a citar D-072 como `ACCEPTED` neste review, em vez de `PROPOSED`.
- **O status do documento do Goal056 passa de `READY` a `ACCEPTED`**, com a contagem de rodadas.
