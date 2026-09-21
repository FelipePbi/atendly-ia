# Review formal — Goal 044

**Decisão vigente — rodada 4: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-09-21, conforme o [Goal044](../goals/044-a-completude-do-conjunto-e-fail-closed.md). Aceite restrito ao diff identificado abaixo; nenhum aceite anterior (001–043) foi reaberto, reavaliado ou revertido. Quatro rodadas: `CHANGES_REQUIRED` com 5 blockers, `CHANGES_REQUIRED` com 3, `CHANGES_REQUIRED` com 1, e o aceite na quarta, com zero.

O Goal existia para fechar as duas bordas que o [review043](043-review.md) tinha registrado como observação não bloqueante: o chamador de um sítio `caller_resolved_base_url_via_*` lido **só no arquivo do próprio sítio**, e a superfície do cliente HTTP interno reconhecida por **três nomes de método fixos** (`request`, `requestWithStatus`, `requestBinary`). Nas duas, uma rota nova sairia do conjunto de 10 com um motivo escrito que afirmava mais do que a leitura tinha feito — a forma branda da falha de subconjunto próprio que reprovou a rodada 1 do Goal043.

A descoberta da série de rodadas é que **a borda não estava no mecanismo novo, e sim na forma que ele não reconhecia**. Os blockers de maior peso das rodadas 1 a 3 são o mesmo defeito em lugares diferentes: a leitura encontrava uma construção que não sabia converter, **desligava a varredura em silêncio** e devolvia um motivo computado que afirmava exaustividade inexistente. Foi por isso que três rodadas foram necessárias depois que os dois mecanismos já funcionavam.

## Escopo e identidade do diff

- Baseline aceita vigente: `3ea06738a8833a3b28801258f4626632c5888983` (fechamento do Goal043). Base imediata da implementação: `3ae502dffca2c2b4d8331de46a13e8c5172c648d`, HEAD da worktree `.ai-worktrees/goal-044`, inalterado nas quatro rodadas.
- Snapshot aceito, calculado pelo IA Loop: **6 arquivos**, hash do diff `6764180603824f5063e442bf2c9449c62aceca0c7e5eb9651926aefb3def569b`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- **Seis arquivos rastreados**, +2802/−107: `tests/assistant/assistant.service.test.ts` (+1366/−0), `tests/support/http-egress-sites.ts` (+968/−107), e a documentação de `docs/migration/` — `DECISIONS.md` +177, `CURRENT_STATE.md` +133, `FINAL_AUDIT.md` +123, `VALIDATION_GATE.md` +37, todos por append (o único trecho não-append de VALIDATION_GATE acrescenta, ao parágrafo das duas bordas, a frase que aponta o fechamento, sem apagar o registro original). Fora do snapshot aceito, o commit de fechamento acrescenta este review, vira o status do Goal044 para ACCEPTED e faz as correções de registro descritas abaixo.
- **Nenhum arquivo novo**, nenhum arquivo removido, e nenhum diretório temporário de controle negativo sobrou: `git status --porcelain=v1 -uall` lista exatamente os seis modificados.
- **Nenhum arquivo Go mudou** — nem de produção, nem de teste. `go.mod` e `go.sum` intocados, nenhuma dependência nova em nenhuma das duas línguas. **Nenhum arquivo de `apps/frontend/src/`, `apps/bff/src/` ou `apps/ai-orchestrator/src/`**, nenhum de `apps/scheduling-service/` ou `apps/health-worker/`, nenhuma migration, nenhum `schema.prisma`, `packages/public-api-contract/` intocado, nenhuma rota, verbo ou campo novo ou removido, nenhuma tela, componente, texto de interface ou CSS, nenhum prompt, nenhuma copy. **Nenhum arquivo de `tools/ia-loop/` foi tocado em rodada nenhuma.**
- `apps/ai-orchestrator/tests/support/product-transport-routes.txt` está **intocado**: o conjunto de **10** rotas e o de **27** literais que os Goals 042 e 043 asseriam continuam idênticos aos da baseline. Este Goal mexe em como a leitura recusa, nunca no critério que decide o conjunto.
- As 107 linhas removidas estão todas em `http-egress-sites.ts` e pertencem às assinaturas e aos ramos que a extensão substituiu.
- Inspecionado o patch contra a worktree, não contra o relatório do Developer. Nas rodadas 1 a 3, cada blocker foi **reproduzido por execução própria** — `jiti` carregando `discoverGoServiceHttpRequests` da worktree sobre árvore sintética em diretório temporário, fora da worktree. Nenhum arquivo de código foi editado pelo reviewer.

## Rodada 1 — CHANGES_REQUIRED (5 blockers)

Os dois mecanismos já existiam e funcionavam nas formas que os testes exercitavam: a resolução de chamador atravessava arquivo por import relativo com alias, a superfície era computada por alcançabilidade com delegação transitiva, ciclo derrubava com `arquivo:linha`, e os três nomes de método tinham sumido de regex e de constante. O que reprovou foi o **fail-closed**, que é o objeto do Goal.

1. **Borda 1 ainda aberta e silenciosa.** `resolveModuleExportForm` só reconhecia `export function` / `export async function` / `export default function`. Para `function f(…) {}` seguido de `export { f };` devolvia `undefined`, e `discoverCallerResolvedGoBoundRequests` caía num ramo vazio — um `continue` mudo, exatamente o que §1 proíbe. Reproduzido: chamador Go-bound em outro arquivo, `requests: []`, e o motivo escrito afirmando "1 chamador(es) lido(s) em 1 arquivo(s)" onde havia 2 em 2.
2. **Borda 2 ainda aberta e silenciosa.** `methodNameSpanAtBrace` derivava o nome andando para trás do `(`; para `sendIt = async (options) => {…}` o nome derivado era `async`, e nada o validava. Reproduzido: método público em forma de propriedade-arrow delegando ao `private perform` que tem o `fetch` — `POST /instance/create` sumia do conjunto sem throw e sem registro. É literalmente o cenário do controle 2 do próprio Goal.
3. **Chamada a membro fora da superfície — caminho de saída sem registro.** `this.<campo>.<outro>(` sobre um cliente apontado ao serviço Go não casava o `callPattern`: não virava requisição, não virava `countOut`, não derrubava.
4. **A enumeração exigida por §2/§3 não existia na saída.** `excludedMembers` era preenchido e **nunca lido**; não saía do descobridor e nenhum teste o consumia. Os critérios que exigem membro enumerado com motivo escrito não eram verificáveis por teste algum.
5. **O controle negativo 2 não exercitava o cenário que o Goal nomeia, e a documentação afirmava que exercitava.** O "antes" chamava o membro `private` direto — cenário que o próprio TypeScript recusa e que continua não reconhecido depois da correção —, então não provava borda aberta. FINAL_AUDIT §21 e VALIDATION_GATE descreviam outra coisa.

## Rodada 2 — CHANGES_REQUIRED (3 blockers)

Os cinco blockers fecharam, cada um confirmado por reprodução do cenário exato. Sobre a árvore real, `internalClientSurfaces` passou a reportar 3 membros alcançando `fetch` e 3 excluídos com motivo (`constructor`, `credential`, `perform` private), e `callerResolutions` de `checkHealth` a reportar 205 arquivos varridos, 3 chamadores e 1 requisição. O que restou era a mesma família de defeito, um nível adiante:

1. **Forma de exportação ainda desligava a varredura quando o módulo tem duas ligações.** `resolveModuleExportForm` devolvia **uma** forma e o laço fazia `continue` no primeiro casamento: construção `export` posterior sobre o mesmo nome era pulada, inclusive outra ligação importável e inclusive forma que deveria derrubar.
2. **O motivo do egresso genérico afirmava zero chamadores onde existia um.** A varredura do primitivo genérico era por nome solto; um helper cujo único chamador estava em outro arquivo **sob alias** caía em `egresso genérico "X": N chamador(es) … nenhum com destino no serviço Go`, com N errado.
3. **A documentação atribuía ao controle 1 um cenário que ele não exercitava** — import nomeado sem alias no teste, alias no texto de FINAL_AUDIT §21 e de CURRENT_STATE. Mesma família do blocker 5 da rodada 1.

## Rodada 3 — CHANGES_REQUIRED (1 blocker)

Os três fecharam, de novo por reprodução própria. Restou um caso homônimo:

1. **A varredura por alias do egresso genérico era desligada para o segundo primitivo homônimo, e o motivo escrito afirmava uma varredura que não aconteceu.** `scannedPrimitiveNames` era indexado só pelo **nome** da função, e o `countOut` recuperava a varredura também por nome: o sítio declarado no segundo arquivo recebia o relatório do primeiro. Um chamador sob alias com destino no serviço Go, no segundo módulo, ficava invisível — e o motivo dizia que a varredura tinha ocorrido.

## Rodada 4 — ACCEPTED

`discoverHttpEgressSites` passou a indexar a varredura **por declaração** (`${filePath}:${line}`), `scannedPrimitiveNames` deixou de existir, a resolução de alias roda por primitivo, e o consumidor do motivo casa por sítio de declaração (`entry.filePath === site.filePath && entry.line === site.line`), derrubando com erro quando não há varredura registrada para aquele sítio. O teste de regressão existe e nomeia o blocker: dois `requestJson` homônimos, com o chamador sob alias do **segundo** arquivo passando `EVOLUTION_GO_BASE_URL`, derruba a leitura.

### Verificações próprias do reviewer

- **A superfície é derivada, não listada.** `computeInternalClientMemberSurface` marca alcance a `fetch` direto ou por delegação `this.<membro>(` transitiva; ciclo derruba nomeando o membro; membro que não alcança é enumerado com motivo; `private`/`protected` que alcança sai da superfície com motivo escrito; superfície vazia derruba. **Nenhum** dos três nomes de método aparece em regex ou constante de regra em `http-egress-sites.ts` — as ocorrências restantes são texto de árvore sintética e categoria computada, não regra.
- **Nenhum motivo afirma o que a leitura não fez.** O motivo de `notGoBound` para `caller_resolved_base_url_via_*` passou a ser computado: contagem de chamadores, de arquivos lidos, de arquivos varridos e forma de exportação.
- **O conjunto não se mexeu.** `product-transport-routes.txt` intocado; as 10 rotas e os 27 literais continuam os mesmos.
- **Suíte alvo:** `npx vitest run tests/assistant/assistant.service.test.ts` → **113** testes, 0 falhas (baseline do Goal: 85; nenhuma suíte encolheu, nada renomeado ou pulado). `npm run test:gate` → **226 pass, 0 fail, 0 skipped**, idêntico à baseline. Suíte completa de `apps/ai-orchestrator` → **837** passando, 88 pulados (baseline: 809 e 88).
- **Árvore limpa:** `git status --porcelain=v1 -uall` sem artefato não rastreado e sem resíduo de árvore sintética.

### Gates conferidos, e o que aceitei sem prova própria

Reexecutados por mim: a suíte alvo, `test:gate` e a suíte completa de `apps/ai-orchestrator`. **Aceito sem prova própria:** `npm run lint` e `npm run typecheck`; `npm run validate:core` → `PASSED`, 15 passos verdes, 2 pulos declarados (`test:bff`, `test:health-worker`), `audit:static` mantendo os **34** checks; e `go test ./...` em `apps/evolution-go` — que este diff não poderia afetar, por não tocar arquivo Go algum. `validate:integration` recusa com `exit 2` e `validate:integration REFUSED — BFF_TEST_DATABASE_URL is not set`: nenhum dos **35** passos chegou a rodar, declarado como pré-condição ausente, nunca como verde.

### Correções de registro feitas no fechamento

Três, todas factuais, todas dentro de `docs/migration/`:

- **A contagem de testes estava um a menos em dois documentos.** CURRENT_STATE e D-060 declaravam **112** testes na suíte alvo (85 + 27) e **836** na suíte completa. A execução devolve **113** e **837**; o caso a mais está no bloco do egresso genérico varrido por alias, que tem **4** testes e não 3 — é o teste de regressão do blocker da rodada 3, acrescentado na rodada 4 sem o número ser recontado. Os dois documentos passaram a 113, 28 e 837, com a repartição corrigida para 7 + 9 + 4 + 8.
- **D-060** passou de `proposta` para `ACCEPTED no review044`, no formato das anteriores.
- **D-059** continuava marcada como `proposta` embora o Goal043 tivesse sido aceito: omissão do fechamento do Goal043, a mesma que já tinha exigido o commit `5526fd1` para o status do documento daquele Goal. Corrigida aqui.

## Observações não bloqueantes

- **`discoverGoBoundInternalClientRequests` ainda deduplica classe de cliente por nome** (`classSurfaces.has(classSpan.name)`), herdado do `scannedClassNames` do Goal043 já aceito. Com duas classes de cliente homônimas em arquivos diferentes, a segunda não teria superfície própria computada nem entraria no relatório de superfícies, e seus membros seriam avaliados contra a superfície da primeira. Não morde aqui: a varredura de instanciação é por nome e cobre as duas, membro não declarado derruba, a árvore real tem uma classe só, e nenhum motivo escrito afirma varredura que não ocorreu. É a mesma família do blocker fechado na rodada 4, um nível acima — candidato natural a Goal futuro.
- **O reconhecimento continua limitado à forma, por decisão.** `export =`, `module.exports`, alias de caminho não relativo (`@app/…`), reexportação em cadeia, import dinâmico e acesso computado (`this["campo"][membro]`) **derrubam a leitura** em vez de resolver. Recusar não é resolver — mas recusa em voz alta é o que o Goal pede, e é o que a árvore faz.
- **As quatro rodadas foram gastas na mesma falha.** Mecanismo que encontra forma desconhecida e se desliga em silêncio, ou documento que afirma que um controle exercita o que ele não exercita. Vale como sinal para o próximo Goal desta série: o risco não está em construir o mecanismo, está em enumerar as formas em que ele recusa.
- **As três observações opcionais do [review040](040-review.md) continuam abertas**, e a do [review043](043-review.md) sobre a sobre-aproximação dos campos portadores continua valendo — todas errando na direção de resíduo nomeado.
- **FINAL_AUDIT continua com a linha órfã "Pré-condição de banco ausente, declarada como ausente."** no fim de §20, herdada do Goal042. Cosmético e preexistente; §21 não a reescreve.

## O que este aceite não cobre

- **Runtime do serviço Go.** Nada aqui executa o serviço, abre conexão whatsmeow, envia mensagem ou observa o que chega a um telefone. O que se prova é o que a árvore de código diz, lida por AST e por forma de declaração.
- **Qual binário roda em produção.** A árvore lida é a desta worktree; nada liga esse código ao artefato implantado.
- **`whatsmeow-lib/`**, biblioteca vendorizada, fora do alcance.
- **O valor real de variável de ambiente nenhuma.** Só o default do schema TypeScript e o `.env.example` são lidos.
- **A-24 não foi corrigido.** Continua `PENDENCIA-POS-MVP`; `"Ver Menu"` continua escrito em `pkg/sendMessage/service/send_service.go:1960`. Nenhum arquivo Go de produção deste fork foi editado por este Goal, e a condição do `Revisar se` de D-058/D-059 não é revisitada.
- **O conjunto de 10 rotas e o de 27 literais não foram ampliados nem reduzidos.** Este diff fecha duas bordas de leitura do lado TypeScript, nunca o critério que decide o conjunto.
- **Texto emitido pelo modelo continua fora do guardrail por [D-050](../DECISIONS.md)**, e a verificação de resposta continua sem rodar em produção por [D-051](../DECISIONS.md).
- **M4 — envio real a número real — continua aberto** como gate operacional. Nenhuma chamada saiu, neste diff, para provedor de LLM real nem para WhatsApp real.
- **A persistência continua validada só por `validate:integration`**, que não rodou neste ambiente.
- **Fidelidade visual à referência aprovada** continua sendo conferência humana, como nos reviews [033](033-review.md) a [043](043-review.md). Nenhum arquivo de `apps/frontend/src/` mudou.
- **Os demais achados abertos.** A-04 a A-08, A-11 a A-17, A-19 e A-24 não foram corrigidos, reclassificados nem tocados; nenhum achado fechado (A-01 a A-03, A-09, A-10, A-18, A-20 a A-23) foi reaberto, e nenhum achado novo apareceu — não houve **A-25**. O veredito de [FINAL_AUDIT](../FINAL_AUDIT.md) continua em **0 `BLOQUEADOR-MVP`, 8 `PENDENCIA-POS-MVP`, 6 `LIMITE-DECLARADO`**, a mesma contagem de §20.
