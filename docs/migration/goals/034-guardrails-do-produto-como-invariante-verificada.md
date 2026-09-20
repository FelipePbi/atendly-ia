# Goal 034 — Guardrails do produto como invariante verificada

**Status: ACCEPTED.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal033 ACCEPTED](../reviews/033-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 034 nasce na [v55 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 033, sem renumerar para trás e sem remover ID. Ela existe porque, depois de A-01 (Goal031) e A-02 (Goal033), sobraram exatamente **três achados que este repositório consegue fechar sozinho**, e os três são da mesma classe: um guardrail de [AGENTS.md](../../../AGENTS.md) que o produto promete e que **nada deixa vermelho** quando é violado.

## Baseline aceita

Baseline aceita: `090ee2897835142b59c979ddb24d4372c2f4398e`

Goal anterior: 033 — Gate renderizado nas telas autenticadas

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal033 já integrado em `main` (origem `d6db9e246b5b7f59292522f7e34de423128a819f`), com o gate renderizado alcançando as sete telas autenticadas, a régua extraída para `apps/frontend/e2e/measure.ts`, o [review033](../reviews/033-review.md) e a documentação de fechamento. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fazer três guardrails de produto pararem de depender de **default de ambiente**, de **ausência na árvore** ou de **nada**, e passarem a depender de código e de gate.

- **A-10 — grupos.** `AGENTS.md:51` diz "Grupos não são atendidos pela IA no MVP". Hoje o descarte é `if (message.isGroup && env.EVOLUTION_IGNORE_GROUPS)`, com default `true`. A própria [FINAL_AUDIT §4](../FINAL_AUDIT.md) registra a linha como fechada **com achado**: "o default seguro é o que sustenta a regra hoje". Uma variável trocada por engano coloca a IA respondendo em grupo, e nenhum gate fica vermelho.
- **A-09 — mensagem técnica de espera.** `AGENTS.md:69` diz que a IA "não envia mensagens técnicas de 'aguarde enquanto consulto'". A §4 é explícita sobre o estado: "não sei nomear nada que fique vermelho se o modelo passar a anunciar consulta". A regra não está no prompt nem em teste.
- **A-18 — tema claro.** O MVP é tema claro, e isso é hoje a **ausência** de `dark` e de `prefers-color-scheme` na árvore. Ninguém fica vermelho se alguém introduzir tema escuro.

O risco próprio deste Goal é de uma classe só, e é o mesmo dos Goals 031, 032 e 033 com outra roupa: **afirmar invariante que não existe**. Trocar `env.EVOLUTION_IGNORE_GROUPS` por uma constante não é invariante se nada ficar vermelho quando alguém reintroduzir a condição. Escrever uma frase no prompt não é garantia: **eval com modelo roteirizado não prova que o modelo real obedece ao prompt** — um eval que "prova" A-09 mandando o dublê não dizer "aguarde" é uma prova fabricada, porque quem escolheu a fala foi o teste. Por isso o A-09 é fechado explicitamente em **duas partes separadas**: o que o **código garante** (o que o produto emite por conta própria) e o que o **prompt orienta** (o que o modelo diz), com o limite escrito em vez de escondido. Tudo aqui é medido por esse critério.

## Dependências e contexto mínimo

- Goals 001 a 033 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [FINAL_AUDIT §4](../FINAL_AUDIT.md) (as três linhas do inventário de guardrails), **A-09**, **A-10** e **A-18** em §6, e o veredito recontado em §10.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, o que `audit:static` decide e a pré-condição de bancos descartáveis de `validate:integration`.
- [DATA_MIGRATION §18](../DATA_MIGRATION.md): o ensaio da resposta automática do Goal032, que este Goal estende com um elo.
- [AGENTS.md](../../../AGENTS.md): as três regras de produto que este Goal materializa; ele **não** inventa guardrail novo.
- **Product Vault:** consulta dirigida (1–3 notas) só se precisar confirmar a regra de produto de grupo ou de espera. Não abrir o vault inteiro.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `090ee289`. Não gastar rodada redescobrindo:

- **`EVOLUTION_IGNORE_GROUPS` tem oito ocorrências, todas dentro de `apps/ai-orchestrator/`:** `src/config/env.ts:90` (`boolEnv(true)`), `src/modules/channel/InboundMessageProcessor.ts:239`, `.env.example:25`, `docker-compose.yml:19`, e quatro em testes — `tests/security/webhook-credential-transition.test.ts:26` (`vi.stubEnv`) e `tests/session/message-graph-session.test.ts:451`–`:459`, cujo caso se chama **"ignora grupos apenas enquanto a configuracao mandar"** e, portanto, codifica o defeito como comportamento esperado. **Nenhuma ocorrência em `render.yaml`.**
- **O descarte acontece cedo e já é testado nesse ponto.** `InboundMessageProcessor.ts:239` retorna `{ ok: true, action: "ignored_group" }` antes de resolver conversa, idempotência ou automação; `tests/channel/inbound-message-processor.test.ts:117` e `tests/session/message-graph-session.test.ts:247` já afirmam que nada é persistido nem enviado.
- **`isGroup` nasce no mapper do transporte.** `src/modules/channel/adapters/evolution/EvolutionInboundMapper.ts:224`: `booleanValue(info.IsGroup) || chatId.endsWith("@g.us")`.
- **A resposta da IA sai por uma porta única.** `src/modules/graph/message-graph.ts:1164`–`:1166` chama `provider.sendText({ ... })`. Os outros chamadores de `sendText` são caminhos distintos e **não são deste Goal**: `internal/routes.ts:705` (envio humano), `reminders/NotificationDeliveryService.ts:318` (lembrete), `activation-test/ActivationTestReplySender.ts:120` e `channel/platform/PlatformWhatsAppSender.ts:98` (teste de ativação pela instância da plataforma).
- **Os textos que o produto emite por conta própria são enumeráveis e poucos.** `src/modules/assistant/assistant.service.ts:271` (`defaultHandoffMessage`), `:484`, `:671`, `:1447`, `:1560`, `:1575`, `:1589`, `:1601` (saudação de estilo), `:1646` (conversão de resposta não-JSON) e o fallback de `composeReplyText` em `:1656`–`:1666`. Esse conjunto é o que o **código** pode garantir; o resto do que chega à cliente vem do modelo.
- **O prompt é versionado de propósito.** `src/modules/prompts/system.ts:64`–`:82` (`MAIN_RULES`, quinze itens) e `:104` (`PROMPT_TEMPLATE_VERSION = "v5"`), com o comentário de `:82`–`:103` explicando que o identificador "só muda quando alguém decide, de propósito, que o prompt ganhou um novo significado". `derivePromptVersion` em `:197` compõe o hash do conteúdo, e `promptVersion` é gravado por execução (`assistant.service.ts:465`, `:933`, `:967`) — mudar a versão é **aditivo**, não exige migration.
- **Buscar `aguarde`, `um momento`, `vou consultar` e `espera` em `src/modules/prompts/` não retorna nada.** `tests/evals/tool-failure-vocabulary.eval.test.ts` cobre vocabulário de **falha de tool**, que é outro caso, e é o padrão a seguir para a eval nova: `createEvalWorld`, `proibirRede()`, turnos roteirizados e asserção sobre o que voltou ao modelo e o que saiu para a cliente.
- **A regra estática já tem casa e padrão.** `scripts/final-production-audit.mjs` expõe funções puras de busca (`findLegacyMigrationRouteReferences`, `findMinhaAgendaWriterReferences`, …) e registra cada resultado com `check(name, ok, details)`; `scripts/tests/final-production-audit-legacy-regression.test.mjs` prova cada regra **nos dois sentidos**, com árvore sintética que passa e árvore sintética que falha. `scripts/validate-core.mjs:67` roda o script como o passo `audit:static`.
- **Os onze arquivos CSS de `apps/frontend/src` não têm nenhuma ocorrência de `prefers-color-scheme` nem de seletor de tema escuro.** A regra de A-18 nasce verde e precisa de caso negativo para valer alguma coisa.
- **`test:ai-orchestrator` roda em `validate:core`** (`scripts/validate-core.mjs:28`), junto de `audit:static` e `test:gate-scripts`. `rehearse:goal032-auto-reply` é o 34º passo de `validate:integration` (`scripts/validate-integration.mjs:612`) e `scripts/tests/validate-integration.test.mjs` afirma a lista exata de **35** passos.

## Pontos de implementação

- `apps/ai-orchestrator/src/config/env.ts`, `src/modules/channel/InboundMessageProcessor.ts`, `src/modules/graph/message-graph.ts`: a invariante de grupo nas duas pontas.
- `apps/ai-orchestrator/src/modules/assistant/` e `src/modules/prompts/`: o conjunto enumerável de textos do produto e a regra nova no prompt.
- `apps/ai-orchestrator/tests/`: testes e a eval nova.
- `apps/ai-orchestrator/.env.example` e `apps/ai-orchestrator/docker-compose.yml`: retirada da chave.
- `scripts/final-production-audit.mjs` e `scripts/tests/final-production-audit-legacy-regression.test.mjs` (ou arquivo irmão no mesmo padrão): as regras estáticas e seus casos negativos.
- `scripts/goal032-auto-reply-rehearsal.mjs` e `scripts/tests/goal032-auto-reply-rehearsal.test.mjs`: o elo novo do ensaio.
- `docs/migration/`: conforme §8.

**Nenhum arquivo fora de `apps/ai-orchestrator/`, `scripts/` e `docs/migration/` deve mudar.** Nenhuma migration, nenhum `schema.prisma`, nenhuma rota nova, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/scheduling-service/`, `apps/evolution-go/` ou `apps/frontend/`. A regra de A-18 **lê** o CSS do frontend; ela não o edita, e o gate renderizado do Goal033 continua exatamente como está.

## Escopo obrigatório

### 1. A-10, ponta de entrada: o descarte de grupo não é configuração

- `EVOLUTION_IGNORE_GROUPS` **deixa de existir**: sai de `config/env.ts`, do `.env.example`, do `docker-compose.yml` e do caminho de decisão. Mensagem de grupo é descartada **sempre**, no mesmo ponto em que é descartada hoje — antes de idempotência, conversa e automação — e continua devolvendo `action: "ignored_group"`.
- Os quatro testes que hoje mencionam a variável são **corrigidos, não apagados**. O caso "ignora grupos apenas enquanto a configuracao mandar" é substituído por um caso que prova o oposto: o descarte acontece **independentemente de qualquer variável de ambiente**. Reduzir cobertura aqui é blocker de review.
- Retirar a chave não pode quebrar a paridade que `audit:static` já confere entre `config/env.ts` e `.env.example`. Se algum check de paridade reclamar, a correção é remover a chave dos dois lados — nunca afrouxar o check.

### 2. A-10, ponta de saída: a IA não responde para destino de grupo

- O despacho da **resposta da IA** (`message-graph.ts`, a chamada de `provider.sendText`) recusa destino de grupo com erro nomeado e log próprio, em vez de enviar. Um jid de grupo chegando ali é estado impossível: significa que a ponta de entrada falhou, e falhar alto é melhor que responder em grupo.
- A recusa é **só** desse caminho. Envio humano, lembrete e teste de ativação não são tocados, e o motivo fica escrito no código: o guardrail proíbe a **IA** de atender grupo, não o profissional de usar o WhatsApp dele.
- O predicado de "é grupo" é **um só**, compartilhado com o mapper, nunca uma segunda regra copiada. Duas definições de grupo divergindo é blocker de review.

### 3. A-10, gate: a condição não pode voltar

- Regra estática nova em `scripts/final-production-audit.mjs`, no padrão das existentes: o descarte de grupo **não** pode estar condicionado a leitura de `env` e a chave `EVOLUTION_IGNORE_GROUPS` não pode reaparecer em `apps/**`. A regra é função pura exportada, exercitada **nos dois sentidos** pelo teste de regressão — árvore sintética limpa passa, árvore sintética com a condição de volta falha.
- O check aparece nomeado na saída de `audit:static`, que já roda em `validate:core`.

### 4. A-10, prova na pilha real: um elo novo no ensaio do 032

- `scripts/goal032-auto-reply-rehearsal.mjs` ganha **um elo de controle**: um evento de **grupo** entrando por `POST /webhooks/evolution`, pelo mesmo caminho durável dos demais, não produz `Message` `OUTBOUND` nenhuma, não chama o dublê do modelo e não produz envio ao transporte.
- O elo é afirmado por **leitura do banco e pelo que o transporte recebeu**, no padrão dos quatro elos já existentes, e o guard correspondente entra no teste permanente de `scripts/tests/`.
- O ensaio continua sendo o 34º passo de `validate:integration` e **nenhum passo é criado, removido ou renomeado**: a lista de 35 passos afirmada por `scripts/tests/validate-integration.test.mjs` permanece a mesma.

### 5. A-09, o que o código garante: os textos do produto

- Os textos que o **produto** emite por conta própria — os enumerados nos fatos confirmados — passam a ser um conjunto **nomeado e enumerável** em um só lugar, sem mudar uma vírgula do que cada texto diz. Mover texto não é reescrever texto: qualquer alteração de copy neste Goal é blocker de review.
- Teste permanente afirma que **nenhum** texto desse conjunto anuncia espera ou consulta em andamento, com o vocabulário declarado no próprio teste no padrão de `VOCABULARIO_DE_INFRA` de `tool-failure-vocabulary.eval.test.ts`.
- O mesmo teste prova que o conjunto é **fechado**: um texto novo que o produto passe a emitir e que não esteja no conjunto deve ficar vermelho. Lista que envelhece em silêncio não é invariante.

### 6. A-09, o que o prompt orienta: a regra entra versionada

- `MAIN_RULES` ganha a regra, em português direto, no vocabulário do produto: não anunciar consulta em andamento nem pedir para esperar; consultar e responder, ou dizer o que já dá para dizer.
- `PROMPT_TEMPLATE_VERSION` sobe para `v6`, com o parágrafo de justificativa no mesmo padrão dos de v2 a v5, dizendo o que mudou de **significado**. Os testes de prompt existentes que afirmam versão ou conteúdo são atualizados junto.

### 7. A-09, a eval, e o limite dela

- Eval nova em `apps/ai-orchestrator/tests/evals/`, no padrão de `tool-failure-vocabulary.eval.test.ts` (`createEvalWorld`, `proibirRede()`), cobrindo o caso que A-09 nomeia: a cliente pergunta algo que exige consulta, o modelo chama a tool e o que chega à cliente é a **resposta**, não um aviso de espera. Ela prova, em particular, que o **turno de tool não emite mensagem nenhuma por conta própria** — quem consulta é o produto, em silêncio.
- O cabeçalho da eval declara, por escrito, o que ela **não** prova: com modelo roteirizado, aderência do modelo real ao prompt não é demonstrável. Esse limite vai também para a documentação de §8. Declarar A-09 "provado por eval" é blocker de review.

### 8. A-18: o tema claro vira regra

- Regra estática nova em `audit:static`: nenhum CSS de `apps/frontend/src` contém `prefers-color-scheme` nem seletor de tema escuro. Função pura exportada, caso negativo obrigatório no teste de regressão, e escopo escrito (o que ela lê e o que ela não lê).
- A regra **não** edita nem reformata nada do frontend, e não toca o gate renderizado do Goal033.

### 9. Controle negativo: cada invariante morde

No padrão dos Goals 031, 032 e 033, com saída real no relatório e reversão obrigatória. **No mínimo cinco controles**, e estes cinco são obrigatórios:

1. **Grupo, entrada.** Reintroduzir a condição de ambiente no descarte derruba `audit:static` com o check nomeado.
2. **Grupo, saída.** Remover a recusa de destino de grupo no despacho da IA derruba o teste que a cobre.
3. **Grupo, pilha real.** Fazer o elo novo do ensaio aceitar resposta a grupo derruba o ensaio com falha nomeada.
4. **Espera.** Trocar um texto do produto por um que anuncia espera derruba o teste do conjunto enumerável.
5. **Tema escuro.** Introduzir `prefers-color-scheme: dark` em um CSS do frontend derruba `audit:static`.

Cada controle é provado nos dois sentidos: íntegro passa, quebrado cai com falha nomeada. **Nenhuma quebra pode sobrar na árvore final.**

### 10. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não afirmar invariante que não existe.** Constante no lugar de variável, sem gate que fique vermelho quando a condição voltar, não fecha A-10.
- **Não fabricar prova de A-09.** Eval com dublê não demonstra aderência do modelo real; o limite é escrito em todo documento que tocar o assunto.
- **Não mudar copy do produto.** Os textos são movidos e cobertos, nunca reescritos, encurtados ou "melhorados".
- **Não alargar o guardrail de grupo para o humano.** Envio manual, lembrete e teste de ativação seguem intocados.
- **Não tocar `apps/frontend/`, `apps/bff/`, `apps/scheduling-service/` nem `apps/evolution-go/`**, nem migration, schema, rota ou contrato público. Se a invariante só couber com mudança nesses lugares, isso é **achado relatado** e o Goal para ali — a decisão é do Tech Lead.
- **Não chamar serviço externo real.** Nenhum provedor de LLM real, nenhum WhatsApp real. **M4** continua aberto como gate operacional e este Goal não o fecha nem afirma tê-lo fechado.
- **Não corrigir achado fora destes três.** A-03 a A-08, A-11 a A-17 e A-19 não são corrigidos, reclassificados nem tocados. Defeito encontrado fora do escopo vira achado relatado, com identificador novo em sequência a partir de **A-20**, classificação no vocabulário fechado de [FINAL_AUDIT §6](../FINAL_AUDIT.md) e impacto de produto em uma frase.
- **Não enfraquecer gate nenhum**, não encolher a lista de passos de `validate:integration` e não marcar teste como skip em silêncio.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha.**
- **Não reabrir, reverter nem reexecutar aceite anterior.**

### 11. Prova

- `validate:core` exit 0 sobre a árvore final, com `audit:static` mostrando os checks novos nomeados e `test:ai-orchestrator` verde.
- `npm run test:gate` exit 0, com as regressões novas nos dois sentidos.
- Os cinco controles negativos executados, cada um com a saída real, e revertidos.
- `validate:integration` executado inteiro pelo Developer contra cluster descartável, com o resultado por passo — e, se a pré-condição de banco não existir no ambiente de execução, isso é **declarado como tal**, nunca apresentado como verde. O elo novo do ensaio aparece na saída real.
- `validate:ui` executado sobre a árvore final, provando que o gate renderizado continua verde e inalterado.

### 12. Documentação

Escrita **depois** da última mudança de árvore:

- [CURRENT_STATE](../CURRENT_STATE.md): delta034 — o que passou a ser invariante e o que continua sendo orientação.
- [DATA_MIGRATION](../DATA_MIGRATION.md): seção nova (§20) no padrão das anteriores, descrevendo o elo acrescentado ao ensaio do Goal032 e o que ele prova.
- [VALIDATION_GATE](../VALIDATION_GATE.md): os checks estáticos novos, o que cada um decide e o que continua não decidindo.
- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada fechando **A-09**, **A-10** e **A-18**, no padrão de §8 e §10 — **sem reescrever** §4, §6, §7, §8, §9 ou §10 —, com o veredito recontado, os achados novos a partir de **A-20** quando houver, e a declaração explícita de que a aderência do modelo real ao prompt não é provada por eval.
- [DECISIONS](../DECISIONS.md): **D-050**, no formato das anteriores, cobrindo o guardrail absoluto sustentado por invariante em vez de configuração, a separação entre o que o código garante e o que o prompt orienta, e por que a recusa de destino de grupo vale só para a resposta da IA.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `EVOLUTION_IGNORE_GROUPS` não existe mais em `apps/**` — nem em código, nem em `.env.example`, nem em `docker-compose.yml`, nem em teste.
2. Mensagem de grupo é descartada sempre, no mesmo ponto do fluxo, com `action: "ignored_group"`, sem persistir, sem chamar automação e sem enviar.
3. O caso de teste que afirmava o descarte "apenas enquanto a configuracao mandar" foi substituído por um que prova o descarte incondicional; nenhum teste de grupo foi removido.
4. O despacho da resposta da IA recusa destino de grupo com erro nomeado, coberto por teste, e o predicado de grupo é único e compartilhado com o mapper.
5. Envio humano, lembrete e teste de ativação não foram alterados, e o motivo está escrito no código.
6. `audit:static` tem check nomeado que falha se o descarte de grupo voltar a depender de `env` ou se a chave reaparecer, e o teste de regressão o exercita nos dois sentidos.
7. O ensaio do Goal032 tem elo novo provando, na pilha real, que evento de grupo não vira `Message` `OUTBOUND` nem envio ao transporte, com o guard coberto por teste permanente.
8. A lista de passos de `validate:integration` continua com os mesmos 35 passos, sem criação, remoção ou renomeação.
9. Os textos que o produto emite por conta própria estão em um conjunto nomeado e enumerável, com o texto de cada um **idêntico** ao da baseline.
10. Teste permanente reprova vocabulário de espera em qualquer texto desse conjunto e fica vermelho se um texto novo do produto ficar de fora dele.
11. `MAIN_RULES` contém a regra de não anunciar consulta em andamento, e `PROMPT_TEMPLATE_VERSION` subiu para `v6` com a justificativa escrita no padrão das anteriores.
12. Existe eval nova cobrindo o caso de A-09, que prova que o turno de tool não emite mensagem por conta própria, e o cabeçalho dela declara o que ela não prova.
13. Nenhum documento afirma que A-09 está provado por eval, nem que o modelo real obedece ao prompt por causa deste Goal.
14. `audit:static` tem check nomeado que falha com `prefers-color-scheme` ou seletor de tema escuro em CSS de `apps/frontend/src`, com caso negativo no teste de regressão.
15. Nenhum arquivo de `apps/frontend/`, `apps/bff/`, `apps/scheduling-service/` ou `apps/evolution-go/` foi modificado; nenhuma migration, schema, rota ou contrato público mudou.
16. Os cinco controles negativos obrigatórios existem, cada um derruba o gate ou o ensaio com falha nomeada, a saída real de cada um está no relatório e nenhuma quebra sobrou na árvore.
17. Nenhum passo, suíte, check ou teste existente foi removido, renomeado, pulado ou condicionado.
18. Nenhum achado de A-03 a A-08, A-11 a A-17 ou A-19 foi corrigido ou reclassificado; **A-09**, **A-10** e **A-18** só são declarados fechados com a verificação executada.
19. Nenhum documento afirma que **M4** foi fechado nem que a fidelidade visual está provada.
20. `validate:core` exit 0, `npm run test:gate` exit 0 e `validate:ui` exit 0 sobre a árvore final.
21. `validate:integration` executado com resultado por passo declarado; pré-condição de banco ausente é declarada como ausente, nunca como verde.
22. A documentação de §12 foi escrita depois da última mudança de árvore, [DECISIONS](../DECISIONS.md) tem **D-050** no formato das anteriores, e nenhuma seção anterior de [FINAL_AUDIT](../FINAL_AUDIT.md) foi reescrita.
23. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
24. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.

## Entrega

Relatório do Developer com: a lista das oito ocorrências de `EVOLUTION_IGNORE_GROUPS` e o que foi feito com cada uma; o ponto exato das duas pontas da invariante de grupo, com o teste que cobre cada uma; a saída real de `audit:static` com os checks novos nomeados; a saída real do elo novo do ensaio, com a leitura de banco e o que o transporte recebeu; o conjunto enumerável de textos do produto, com a confirmação de que nenhum texto mudou; a regra nova do prompt e a justificativa de `v6`; o que a eval de A-09 prova e o que ela não prova, em uma frase cada; a saída real dos cinco controles negativos, com a confirmação de que foram revertidos; o resultado por passo de `validate:core`, `test:gate`, `validate:ui` e `validate:integration`, com pré-condição ausente declarada quando for o caso; os achados de produto encontrados e **não** corrigidos, com identificador a partir de A-20; e o que ficou declaradamente fora — com **M4**, fidelidade visual, A-03 a A-08, A-11 a A-17 e A-19 nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real e a força de cada evidência.
