# Goal 056 — A prosa sai do fork de transporte: o serviço Go deixa de compor o rótulo `"Ver Menu"` (A-24)

**Status: READY.** Preparado em 2026-09-26 pelo Tech Lead Agent após [Goal055 ACCEPTED](../reviews/055-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

A linha 056 nasce na [v77 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 055, sem renumerar para trás e sem remover ID.

## Baseline aceita

Baseline aceita: `5f33339d57375ed2ea3dbc6074b94c3d9625b15c`

Goal anterior: 055 — A isenção é provada pelo que o descarte abandona: ocorrência isenta cuja região abandonada produz saída deixa de ser isenta em silêncio

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal055 já integrado em `main` (origem `abe9c3f73e326fc5a698ac7709d45dac5cafb645`). **Duas rodadas**: `CHANGES_REQUIRED` com 9 blockers e o aceite na segunda, com zero. **D-071** foi aceita e [FINAL_AUDIT §32](../FINAL_AUDIT.md) escrita sem reescrever §4 a §31. Veredito vigente da auditoria: **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

**A-24** é o único achado `PENDENCIA-POS-MVP` da auditoria que o repositório consegue fechar sozinho. Os outros sete (A-04 a A-08, A-13, A-14) dependem de deploy real, credencial da origem Minha Agenda, número WhatsApp real, provider de e-mail ou conhecimento de operação — nenhum tem reprodução que um Goal de código resolva. A-24 está registrado desde o [Goal042](042-o-elo-de-transporte-e-provado.md) ([FINAL_AUDIT §19](../FINAL_AUDIT.md), D-058), foi convertido em condição vigiada pelo Goal043 e ficou **sem Goal atribuído** por treze fechamentos seguidos.

O achado: `apps/evolution-go/pkg/sendMessage/service/send_service.go:1960` substitui `ButtonText` vazio por `"Ver Menu"` e entrega esse rótulo em português ao número da cliente, dentro de `ListMessage.ButtonText`. É prosa de produto composta no fork de transporte — o que o `AGENTS.md` de `apps/evolution-go/` proíbe ("Não adicione lógica de negócio") e o que o guard de prosa do Goal042 existe para pegar.

### Por que agora, e não mais um nível da maquinaria de descarte

As duas observações do [review055](../reviews/055-review.md) que ficaram como candidatas a Goal foram **medidas nesta passada** sobre `apps/ai-orchestrator/tests/support/http-egress-sites.ts` na baseline, por sondagem própria em AST (`typescript` do workspace, script fora do repositório):

- **Voltas seguintes abandonadas** (observação 2): das **23** ocorrências de `break` e de `return` dentro de laço, só **uma** tem produção no trecho do corpo do laço **antes** da ocorrência — `:2037` (`break`, `matchEnvVars` em `:2031`) — e ela já exige registro desde o Goal054. **Zero** fail-open vigente.
- **Closure local que grava em coleção capturada** (observação 1): as chamadas a `addBinding` e `countOut` aparecem só em regiões de `continue` dos laços de `:1741` e `:2155`, que já exigem registro ou já trazem produção direta, como o review055 registrou. **Zero** fail-open vigente.

Os dois limites continuam declarados em D-071 e seguem candidatos. A-24, ao contrário, é defeito de produto presente na árvore, fechável com mudança pequena e verificável pelo guard que já existe.

### O que a baseline já mostra, conferido nesta passada

1. **A fallback é inalcançável pela rota HTTP, e mesmo assim existe.** O handler `SendList` (`pkg/sendMessage/handler/send_handler.go:579`) recusa `ButtonText` vazio com `400` e `"button text is required"` (`:615`–`:618`) antes de chamar o serviço. O guard de alcance é sobre-aproximado de propósito (D-058: toda declaração que o handler chama) e atribui o literal a `POST /send/list`. O literal é código que a próxima mudança do handler reativa em silêncio.
2. **Há uma segunda cópia fora do guard.** `sectionsToString` (`send_service.go:1878`) repete a fallback em `:1936`–`:1939`. A função não tem chamador (`grep -rn sectionsToString` só acha a declaração); por isso o guard, que parte das rotas, não a enumera.
3. **A documentação do fork afirma o contrário do handler.** `send_handler.go:568` (`@Description`), o comentário do campo em `send_service.go:256`, `docs/docs.go` (`:2644`, `:4423`), `docs/swagger.json` (`:2636`, `:4415`), `docs/swagger.yaml` (`:629`, `:8373`) e `docs/wiki/guias-api/api-interactive.md:200` dizem que `buttonText` vazio cai em `"Ver Menu"`; a tabela da wiki ainda marca `buttonText`, `title` e `footerText` como opcionais, e o handler exige os três.
4. **O produto não usa a rota.** Nenhum arquivo de `apps/bff/src`, `apps/ai-orchestrator/src` ou `apps/frontend/src` contém `send/list` ou `SendList`; o conjunto de **10** rotas do produto (`apps/ai-orchestrator/tests/support/product-transport-routes.txt`) não a contém; `expectedProseLiteralsReachedFromProductRoutes` (`pkg/transportguard/route_reach_test.go:50`) é vazio. Nenhuma cliente recebe `"Ver Menu"` hoje, e nenhum consumidor do repositório muda de comportamento.
5. **O guard fixa o literal em três conjuntos exatos.** `expectedGoProseLiterals` (`pkg/transportguard/go_prose_test.go:56`, **27** entradas), `expectedProseLiteralsReachedFromRegisteredRoutes` (`route_reach_test.go:80`, **27** entradas de **5** rotas, com o comentário "twenty-seven" em `:55`) e a escrita de `ListMessage.ButtonText` em `off_relay_test.go:112` (`send_service.go:1996`, categoria `SourceBranchDependent`). Os três asseram `arquivo:linha`, então toda linha de `send_service.go` depois da mudança se desloca.

### O que este Goal não é

- Não é Goal de maquinaria de descarte: `apps/ai-orchestrator/` não é tocado.
- Não muda protocolo nem rota: `POST /send/list` continua existindo e continua exigindo os mesmos campos que o handler já exige.
- Não reclassifica nem fecha outro achado além de A-24.
- Não amplia o guard de prosa nem o de alcance; ele só passa a ver um conjunto menor, computado.

## Dependências e contexto mínimo

Ler, e só isto: `apps/evolution-go/AGENTS.md`; `send_service.go` em `:250`–`:262`, `:1878`–`:1952` e `:1954`–`:2000`; `send_handler.go:560`–`:626`; os três testes de `pkg/transportguard/` citados acima, nas entradas de `send_service.go`; [FINAL_AUDIT §19](../FINAL_AUDIT.md) na entrada de A-24 e §20 na parte que vigia A-24; D-058 em [DECISIONS](../DECISIONS.md). Não ler o Product Vault nem a maquinaria de `assistant.service.test.ts`.

## Pontos de implementação

`apps/evolution-go/pkg/sendMessage/service/send_service.go`, `apps/evolution-go/pkg/sendMessage/handler/send_handler.go` (só comentário), um arquivo de teste novo em `apps/evolution-go/pkg/sendMessage/service/`, os três testes de `apps/evolution-go/pkg/transportguard/` citados, `apps/evolution-go/docs/docs.go`, `docs/swagger.json`, `docs/swagger.yaml`, `docs/wiki/guias-api/api-interactive.md` e os documentos de `docs/migration/` do escopo §7. Arquivo fora desta lista que a execução mostrar necessário é declarado no relatório com o motivo, antes de ser tocado.

## Escopo obrigatório

### 1. O serviço não compõe texto para `ButtonText`

Em `SendList`, a fallback de `:1958`–`:1961` sai. `ButtonText` vazio no serviço devolve erro **antes** de qualquer uso de cliente, instância ou rede, com a mesma mensagem que o handler já usa (`button text is required`); valor não vazio segue sem transformação para `ListMessage.ButtonText`. Mensagem de erro devolvida ao chamador da API não é campo portador e não chega à cliente.

### 2. A cópia sem chamador também perde a fallback

Em `sectionsToString`, as linhas `:1936`–`:1939` saem e o valor recebido segue sem transformação. A função **não** é apagada: remover código morto não pertence a este Goal. Declarar no relatório que ela continua sem chamador.

### 3. O contrato escrito passa a dizer o que o handler faz

O comentário do campo (`send_service.go:256`) e o `@Description` do handler (`:568`) dizem que `buttonText` é obrigatório e que vazio devolve `400`. `docs/docs.go`, `docs/swagger.json` e `docs/swagger.yaml` recebem o mesmo texto nas duas posições de cada um; se `swag` estiver disponível, regenerar e conferir que o diff dos três se limita a essas descrições; se não estiver, editar à mão e declarar. A tabela de `/send/list` em `docs/wiki/guias-api/api-interactive.md` passa a marcar como obrigatório todo campo que o handler exige (`number`, `title`, `description`, `footerText`, `buttonText`, `sections`). O exemplo de `docs/wiki/guias-api/api-messages.md:705`, em que o **chamador** manda `"buttonText": "Ver Menu"`, não é prosa do fork e fica.

### 4. O comportamento é provado por teste Go

Teste novo no pacote `send_service`: `SendList` com `ButtonText` vazio devolve erro sem tocar cliente (valor zero de `sendService` basta, porque o retorno vem antes de qualquer dependência). Se for viável sem cliente WhatsApp, um segundo caso prova que valor não vazio chega intacto ao ponto de montagem; se não for, declarar no relatório e não fabricar dependência. O arquivo de teste é `_test.go` e fica fora da enumeração de produção do guard (`pkg/transportguard/sources.go:60`); conferir por execução que a contagem de arquivos de produção não mudou.

### 5. Os conjuntos do guard encolhem por execução, não por edição de expectativa

- `expectedGoProseLiterals` e `expectedProseLiteralsReachedFromRegisteredRoutes` perdem a entrada de `"Ver Menu"`; as demais entradas de `send_service.go` depois do trecho alterado mudam **só de linha**, com conteúdo, campo e rota idênticos. As contagens finais — hoje **27** e **27** de **5** rotas — vêm da execução, e o comentário em inglês de `route_reach_test.go:55` e o de `go_prose_test.go:31` são reescritos para o número e a lista computados, dizendo que o rótulo português saiu por este Goal.
- A entrada de `off_relay_test.go` para `ListMessage.ButtonText` (hoje `:1996`, `SourceBranchDependent`) recebe a linha e a **categoria que a execução computar**. A expectativa é que o valor passe a ser o corpo recebido, sem ramo que o troque; se a categoria computada for outra, registrar qual e por quê, sem forçar.
- As outras entradas de `off_relay_test.go` depois do trecho mudam só de linha.
- `expectedProseLiteralsReachedFromProductRoutes` continua vazio, e o conjunto de **10** rotas do produto não muda.

### 6. Controle negativo: o guard ainda morde

Com a mudança aplicada, reintroduzir temporariamente a fallback `"Ver Menu"` em `SendList` e executar `go test ./pkg/transportguard/...`: o guard de prosa e o de alcance **reprovam** nomeando `send_service.go:<linha>` e o conteúdo. Reverter e executar de novo: passam. As duas saídas vão para o relatório. Nenhum resto do controle fica na árvore.

### 7. Documentação

No mesmo diff, por **acréscimo**: [DECISIONS](../DECISIONS.md) ganha **D-072**, em `PROPOSED`, no formato de D-054 a D-071 — o fork de transporte é editado para retirar prosa composta, o serviço recusa em vez de preencher, e a documentação do fork segue o handler; [FINAL_AUDIT](../FINAL_AUDIT.md) ganha **§33**, sem reescrever §4 a §32, com A-24 **corrigido** e o veredito recontado pela execução (esperado: **0** `BLOQUEADOR-MVP`, **7** `PENDENCIA-POS-MVP`, **6** `LIMITE-DECLARADO`); [CURRENT_STATE](../CURRENT_STATE.md) e [VALIDATION_GATE](../VALIDATION_GATE.md) registram os conjuntos novos do guard com as contagens da execução. Onde `CURRENT_STATE` hoje diz que o fork compõe `"Ver Menu"`, o texto anterior não é apagado: o acréscimo diz o que passou a valer e desde quando.

**A regra do Goal054 §12 continua valendo:** cada afirmação de alcance, contagem, categoria ou evidência escrita em documento permanente nomeia a saída da execução ou o ramo do código que a sustenta. Toda contagem é conferida contra a execução final antes de ser escrita.

### 8. O que este Goal não pode fazer

- Não toca `apps/ai-orchestrator/`, `apps/bff/`, `apps/frontend/`, `apps/scheduling/`, `packages/`, migrations, `tools/ia-loop/` nem `apps/evolution-go/whatsmeow-lib/`.
- Não muda rota, método, payload aceito, status de sucesso nem outro campo do fork; não mexe nas fallbacks de título de linha e de seção (`" "`), que são marca de formatação e não prosa.
- Não afrouxa nenhum guard do `transportguard`: nenhum conjunto esperado ganha entrada, nenhuma categoria é renomeada, nenhuma recusa é removida.
- Não apaga `sectionsToString` nem faz limpeza fora do escopo.
- Não remove teste nem encolhe suíte.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução.

1. `grep -rn '"Ver Menu"' apps/evolution-go --include=*.go`, excluindo `whatsmeow-lib` e `_test.go`, não acha literal em código de produção — provado por execução.
2. `SendList` com `ButtonText` vazio devolve erro antes de tocar dependência, e o handler continua devolvendo `400` com `button text is required` — provado pelo teste do escopo §4 e por diff.
3. `sectionsToString` não compõe texto para `buttonText` e continua declarada, sem chamador — provado por diff.
4. Os conjuntos de prosa e de alcance por rota registrada perdem exatamente a entrada de `"Ver Menu"`; todas as outras entradas mudam no máximo de linha — provado por diff dos três testes e por execução.
5. A escrita de `ListMessage.ButtonText` tem linha e categoria vindas da execução, registradas em documento com o motivo — provado por execução.
6. `expectedProseLiteralsReachedFromProductRoutes` continua vazio e o conjunto de **10** rotas do produto não muda — provado por execução.
7. O controle negativo do escopo §6 reprova com a fallback e passa sem ela, com as duas saídas no relatório — provado por execução.
8. Swagger, `docs.go`, comentário do campo, `@Description` e tabela da wiki dizem que `buttonText` é obrigatório e que vazio devolve `400` — provado por diff.
9. `go build ./...`, `go vet ./...` e `go test ./...` em `apps/evolution-go` passam, via `npm run validate:core` — provado por execução.
10. `npm run test:gate` passa sem teste a menos que a baseline (**226**) — provado por execução.
11. D-072 em `PROPOSED`, FINAL_AUDIT §33 com A-24 corrigido e veredito recontado, `CURRENT_STATE` e `VALIDATION_GATE` com as contagens da execução — provado por diff contra a execução.
12. `git status --porcelain=v1 -uall` lista exatamente os arquivos declarados; nenhum resto do controle negativo.
