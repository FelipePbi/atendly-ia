# Goal 025 — Ciclo de vida da conta

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-16 pelo Tech Lead Agent após [Goal024 ACCEPTED](../reviews/024-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

Este Goal foi planejado como **024B** no primeiro planejamento após o [review024](../reviews/024-review.md) e **renumerado para 025** na segunda passada do mesmo planejamento, registrada na v46 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento). O motivo é operacional, não de escopo: o contrato `PlanningDecision` do IA Loop exige `nextGoalId` de três dígitos, então `024B` seria recusado e nunca despachado — a mesma correção que o Goal019 recebeu quando era `018B`. **Nada do escopo, das dependências ou dos critérios abaixo mudou.** As linhas antes numeradas 025 (retirada do legado e ensaio de release) e 026 (auditoria final do MVP) passaram a **026** e **027**.

## Baseline aceita

Baseline aceita: `d24d68146617ffe1ebb7eedb6617947a843a9bb8`

Goal anterior: 024 — Configurações completas e conhecimento editável

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal024 já integrado em `main` (origem `457708636e7baf2320698e31d3604f80fc909398`), incluindo a implementação das duas rodadas, o review e a documentação de fechamento. Baseline anterior: `70d5a8825732d5a6326b5a1db564b80479f9d650` (fechamento023). O diff inicial desta execução contra `d24d6814` deve conter, no máximo, artefatos preexistentes de `graphify-out/`, a reconciliação administrativa de `docs/migration/` feita neste planejamento e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-29 na metade que sobrou** — a conta — construindo a **segunda máquina irreversível da plataforma**: exclusão da própria conta com período de recuperação de sete dias, automações desligadas e WhatsApp desconectado no início, cancelamento dentro do prazo, e purga efetiva quando o prazo vence. A regra de produto é literal em [Privacidade e Retenção](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md), seção "Exclusão da conta", e hoje **não existe em camada nenhuma**: o bloco "Excluir conta" de `features/settings/AccountSettings.tsx` é um botão desabilitado cuja copy diz que a exclusão "faz parte de uma etapa futura do produto".

Este Goal entra agora, e nesta ordem, por duas razões já registradas na v44 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento): a seção Conta **já é módulo próprio** desde o Goal024, então o ciclo de vida nasce no lugar certo em vez de ser escrito dentro de um monolito e reescrito em seguida; e ele é o último trabalho funcional antes da retirada do legado (026), que depende dele.

**Uma constatação da baseline governa o desenho e não pode ser descoberta tarde:** desligar automação neste produto **não é gravar um booleano**. `reconcileAiActivation` (`apps/bff/src/lib/ai-activation.ts`) religa a IA em **qualquer requisição** quando existe execução de teste real `SUCCEEDED` não superada e o calendário responde `aiActivationReady` — é justamente o que o Goal019 construiu. E `DELETE /v1/whatsapp` (`apps/bff/src/modules/whatsapp/routes.ts`) desconecta a Evolution e apaga a linha local **sem chamar nenhum método do cliente da IA**: `provisionEvolutionChannel` só tem os dois chamadores do caminho de conexão. Logo, uma exclusão que apenas grave `enabled: false` e chame a desconexão existente é **revertida sozinha na requisição seguinte**, sem ninguém pedir. O Goal precisa fechar esse caminho por construção e provar que fechou.

Este Goal **não** faz: exportação de dados antes da exclusão (o vault não a pede no MVP); exclusão de dado de cliente por solicitação, que o próprio vault remete a especificação jurídica posterior; exclusão administrativa por operador; suspensão por inadimplência, cobrança ou plano; retirada de rota ou contrato legado (026); mudança em retenção configurável (023), lembretes (021), central de notificações (022) ou conhecimento (024). Não reabre nenhum aceite de 001–024.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-008** (trabalho durável no PostgreSQL, laço batido no processo, sem broker novo), **D-010** (BFF dono do desejado, IA informa o efetivo), **D-030**/**D-031** (fundação visual e decomposição por módulo) e **D-040** (Configurações decomposta) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 003, 019, 021, 022, 023 e 024 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Consultar seletivamente no Product Vault apenas a seção **"Exclusão da conta"** de [Privacidade e Retenção](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md), a seção "Mais / Configurações" de [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md) e [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md). Não abrir o vault inteiro.
- Consultar `docs/design-reference/claude-design/prototype/project/` apenas na tela de Conta e nos padrões de confirmação destrutiva, e só para resultado visual. Instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-29 na parte de conta** é o alvo único.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções de Autenticação, Configurações e WhatsApp. Usar Graphify apenas para confirmar consumidores de `reconcileAiActivation`, de `DELETE /v1/whatsapp` e das rotas internas de purga; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **Uma conta é um usuário e um negócio.** `POST /v1/auth/register` cria `User`, `Tenant`, `TenantMember` com `role: OWNER`, `BusinessProfile`, `AiSettings` e `LegalAcceptance` numa transação só. Não há caminho que crie um segundo membro de tenant; "excluir a minha conta" é, portanto, excluir o negócio inteiro.
- **`reconcileAiActivation` é ativa, não relatora.** Roda em `GET /v1/status` (e nos demais chamadores), liga a IA a partir de execução `SUCCEEDED` e desliga quando `supersededByChannelChange`. Na IA, `supersededByChannelChange` é `true` quando **não há canal ativo** (`apps/ai-orchestrator/src/modules/internal/routes.ts`), o que torna a derrubada do canal na IA o caminho correto — e verificável — para que a ativação não volte.
- **`DELETE /v1/whatsapp` já faz logout na Evolution, apaga a instância remota e apaga a linha local**, tolerando falha remota. O que ele **não** faz é tocar a IA.
- **O vocabulário de intenção de notificação já cobre automação desligada.** `AppointmentNotificationReason` tem `AI_NOT_ENABLED` (dispensa) e `CHANNEL_NOT_CONNECTED` (falha auditável), ambos fechados por constraint SQL. Não é preciso motivo novo para exclusão em curso — é preciso garantir qual dos dois um negócio em exclusão produz.
- **O formato de trabalho de fundo já existe e é o do Goal023.** `RetentionSweepState` guarda lease com `leaseToken`/`leaseExpiresAt` em `TIMESTAMPTZ` e fencing por token; `RetentionSweepWorker` é timer `unref`, desligado por default por variável de ambiente, nunca lança para fora e é exercitado em teste chamando a função diretamente, sem subir o worker.
- **A purga multistore já tem forma de contrato.** O BFF chama `POST /internal/retention/conversation-content` na IA (`apps/bff/src/clients/ai-orchestrator/index.ts`) e o equivalente no Scheduling; as rotas internas passam pela mesma autenticação interna das demais `/internal/`.
- **Nem a IA nem o Scheduling têm tabela raiz de tenant.** O escopo é coluna `tenantId` espalhada — 120 ocorrências no schema do Scheduling e 80 no da IA. Não existe cascata a partir de um tenant nesses dois bancos, então a purga por negócio é **enumeração**, e é por isso que a cobertura precisa ser derivada do schema e não escrita à mão.
- **No BFF há raiz:** `Tenant` cascateia `TenantMember`, `BusinessProfile`, `AiSettings`, `WhatsAppInstance`, `RetentionSettings`, `RetentionSweepState`, `TenantNotification`, `NotificationPreference` e `NotificationSyncState`; `User` cascateia `UserSession`, `PasswordResetToken`, `LegalAcceptance` e `WhatsAppInstance`.
- **Sessão é revogável no servidor e consultada a cada requisição** desde o Goal003; `revokeAllUserSessions` já tem três chamadores (troca de senha, reset e `POST /v1/auth/logout-all`, do Goal024).
- **A seção Conta é módulo próprio** (`features/settings/AccountSettings.tsx`, Goal024) e contém o bloco desabilitado que este Goal substitui. O shell já consome `GET /v1/status`.
- Gates: `scripts/validate-core.mjs` (builds e suítes sem banco), `scripts/validate-integration.mjs` (banco descartável) e `validate:ui` (Playwright nas cinco larguras).

## Pontos de implementação

- `apps/bff/prisma/schema.prisma` e `apps/bff/prisma/migrations/` — estado durável da exclusão.
- `apps/bff/src/modules/account/` — módulo novo: máquina de estados, efeitos, rotas públicas e orquestração da purga.
- `apps/bff/src/lib/ai-activation.ts` — guarda contra religar automação de conta em exclusão.
- `apps/bff/src/modules/status/routes.ts` — o estado da exclusão no read model que o shell já lê.
- `apps/bff/src/clients/ai-orchestrator/` e `apps/bff/src/clients/scheduling/` — chamadas de purga por negócio.
- `apps/ai-orchestrator/src/modules/internal/routes.ts` e `apps/scheduling-service/src/modules/internal-api/routes.ts` — purga por negócio em cada banco.
- `apps/frontend/src/features/settings/AccountSettings.tsx` e `apps/frontend/src/shared/` — pedir, acompanhar e cancelar a exclusão.
- `apps/bff/PUBLIC_API_V1.md` e os documentos de §11.

## Escopo obrigatório

### 1. Estado durável da exclusão

Modelo novo no BFF, uma linha por negócio, guardando no mínimo: negócio, usuário que pediu, instante do pedido, instante em que o prazo vence, instante do cancelamento, instante da conclusão da purga e estado (`SCHEDULED`, `CANCELLED`, `PURGED`), mais os campos de lease necessários à retomada, no formato de `RetentionSweepState` (`leaseToken` + `leaseExpiresAt` em `TIMESTAMPTZ`, fencing por token).

**A linha sobrevive à purga.** Ela não pode ser filha cascateada de `Tenant`, porque então a prova de que a exclusão aconteceu desapareceria junto com o dado excluído e uma segunda passada não teria como saber que já terminou. Depois da purga ela guarda identificadores e instantes, e **nenhum dado pessoal**: sem e-mail, sem nome de negócio, sem telefone, sem conteúdo.

O prazo de sete dias é **regra de produto**, constante declarada em código — não variável de ambiente, não campo de configuração, não parâmetro de chamador. O que é injetável é o relógio, como no Goal023, para o teste poder envelhecer o prazo sem esperar sete dias.

Migration nova, aditiva, no padrão das anteriores: sem remoção de coluna existente, sem backfill que dependa de dado ausente, e retomável.

### 2. Iniciar a exclusão: pedido, reautenticação e efeitos

Rota pública sob sessão e CSRF, que **exige a senha atual** do usuário autenticado — o mesmo grau de reautenticação que `PATCH /v1/auth/password` já pratica — e nunca aceita `userId`/`tenantId` do corpo: a identidade vem só da sessão. Senha errada recusa sem iniciar efeito nenhum.

Ao aceitar, e nesta ordem, com o estado gravado de forma que uma falha no meio seja **retomável e não deixe automação ligada**:

1. grava a exclusão como `SCHEDULED` com o vencimento calculado;
2. desliga a IA desejada do negócio — `enabled: false` **e** `activatedByRunId: null` — e projeta o desejado para a IA;
3. derruba o canal do negócio na IA, de modo que a IA deixe de ter canal ativo para aquele negócio;
4. desconecta o WhatsApp pelo caminho que já existe: logout autenticado quando possível, remoção da instância na Evolution e remoção da linha local, tolerando falha remota como o caminho vigente já tolera.

**Idempotente:** pedir duas vezes não cria duas exclusões nem repete efeito; a segunda chamada devolve o estado vigente ou recusa com código próprio, e o relatório diz qual foi a escolha.

A sessão **não** é revogada por pedir exclusão: cancelar exige entrar, e derrubar o acesso tornaria o prazo de recuperação decorativo.

### 3. Automação não volta sozinha

Enquanto houver exclusão `SCHEDULED`, nenhum caminho do produto pode religar a IA do negócio. Em particular, `reconcileAiActivation` **não ativa** nesse estado, e isso é afirmado por teste que falha se a guarda for removida. Reconciliar continua funcionando para todo o resto.

O Developer precisa determinar e declarar, com evidência no código e não por suposição, **o que acontece com as intenções de notificação pendentes** do negócio em exclusão: elas não podem ser entregues, e devem terminar com motivo honesto do vocabulário fechado que já existe — `AI_NOT_ENABLED` quando a IA desligada for avaliada primeiro. Se a ordem de avaliação vigente produzir `CHANNEL_NOT_CONNECTED`, isto é, **falha auditável** e alerta na central para uma conta que o próprio dono mandou excluir, o Goal corrige a ordem ou suprime o alerta para esse negócio — e o relatório nomeia o que foi feito e por quê. O vocabulário de motivos **não ganha valor novo**.

### 4. Cancelar dentro do prazo

Rota pública que cancela a exclusão enquanto o prazo não venceu e o estado é `SCHEDULED`. Fora do prazo ou em estado terminal, recusa com código próprio e não faz nada.

**Cancelar não restaura automação.** O WhatsApp continua desconectado e a IA continua desligada; voltar a operar exige reconectar o número e **realizar novo teste real de ativação**, pelos fluxos que já existem desde os Goals 003 e 019 — nenhum caminho novo de ativação é criado aqui. A tela precisa dizer isso antes e depois de cancelar; prometer que "está tudo de volta" seria mentira de produto.

### 5. Vencido o prazo: purga efetiva

Quando o relógio passa do vencimento e o estado ainda é `SCHEDULED`, a conta é purgada. Isto é irreversível e é o ponto de maior custo de erro do Goal.

- **Quem dispara:** laço batido no processo do BFF, no formato do `RetentionSweepWorker` — timer `unref`, **desligado por default** por variável de ambiente própria, nunca lança para fora, parada esperando só o ciclo em voo. As suítes chamam a função de purga diretamente; nenhum teste sobe o worker.
- **Lease e fencing:** duas instâncias do BFF não purgam o mesmo negócio ao mesmo tempo; quem exclui é o par (`leaseExpiresAt`, `leaseToken`), como no Goal023.
- **Ordem:** primeiro os bancos que não cascateiam — IA e Scheduling, cada um por sua rota interna própria —, depois o BFF, e o `User` **por último**. Enquanto houver loja não confirmada, a conta não é marcada `PURGED`.
- **Retomável e idempotente:** uma passada que falhe no meio deixa estado retomável; a passada seguinte termina o que faltou sem repetir efeito e sem exigir intervenção manual. Purgar duas vezes não é erro.
- **Limitada:** teto de linhas por passada por loja, com sinalização de trabalho restante, como a varredura de retenção já faz — uma conta grande não pode segurar o processo do BFF numa transação única.
- **A instância da Evolution já foi removida no início** (§2). A purga confere e, se ainda houver instância, remove; não inventa caminho novo de transporte.

### 6. Purga por negócio na IA e no Scheduling

Uma rota interna nova em cada serviço, sob a mesma autenticação interna das demais `/internal/`, que apaga **tudo do negócio** no banco daquele serviço, em ordem segura de chave estrangeira, de forma idempotente e limitada por teto.

**A cobertura é derivada do schema, não escrita à mão.** Cada serviço declara em código a lista de tabelas purgadas, e existe teste que compara essa lista com o conjunto de modelos que carregam `tenantId` no `schema.prisma` daquele serviço: tabela nova sem purga declarada **quebra o teste**. Modelo que só se alcança por relação (sem `tenantId` próprio) é purgado pela cascata do pai ou entra na lista com o caminho declarado — e o teste cobre isso explicitamente, em vez de deixar dado órfão.

**Isolamento é prova, não intenção:** teste com dois negócios povoados, purgando um, afirmando que o outro permanece **inteiro** em cada tabela tocada.

Nenhuma dessas rotas aceita "purgar tudo", lista de negócios ou ausência de `tenantId`.

### 7. Tela: pedir, acompanhar e cancelar

Em Configurações → Conta, o bloco desabilitado "Excluir conta" dá lugar ao fluxo real:

- **Pedir** exige confirmação explícita e a senha atual, e diz, antes de executar, o que vai acontecer: automações desligadas, WhatsApp desconectado, sete dias para cancelar, e depois disso os dados apagados sem volta.
- **Acompanhar:** com exclusão agendada, a tela mostra o estado e **quantos dias faltam**, calculado a partir do vencimento que o servidor devolve — nunca contado no cliente a partir do pedido.
- **Cancelar** dentro do prazo, dizendo com clareza o que **não** volta sozinho (WhatsApp e IA) e o que é preciso fazer para voltar a operar.
- **Aviso persistente** enquanto o prazo corre, a partir do estado que `GET /v1/status` passa a devolver, e não de um segundo estado inventado no cliente.
- Erro de rede ou recusa do servidor **não** pode ser apresentado como sucesso: nada de "exclusão agendada" quando a chamada falhou. É o mesmo defeito que a rodada 1 do Goal024 produziu em "sair de todos os dispositivos" e que o aceite exigiu corrigir.

### 8. Contrato público do BFF

As rotas novas entram em `apps/bff/PUBLIC_API_V1.md` — na tabela de rotas registradas e em seção própria, com corpo, códigos de erro e o que cada transição garante —, e o campo novo de `GET /v1/status` é documentado onde o status já é descrito. Nenhum outro contrato muda.

### 9. O que não pode mudar de comportamento

Autenticação, sessão, CSRF, isolamento de tenant, retenção configurável, varredura de retenção, lembretes, central de notificações, conhecimento, importação e todas as telas dos Goals 014–024 continuam como estão. Nenhuma rota existente muda de forma ou de código de erro. Nenhum negócio sem exclusão agendada percebe qualquer diferença — e há teste que afirma isso para a reconciliação de ativação.

### 10. Prova

- **Integração contra PostgreSQL descartável**, no padrão de `apps/bff/tests/*.integration.test.ts`: pedir → cancelar dentro do prazo; pedir → vencer o prazo com relógio injetado → purgar; purgar duas vezes; purgar com uma loja falhando e retomar na passada seguinte.
- **Depois da purga, o login daquele e-mail não autentica** e nenhuma sessão anterior autentica — afirmado por teste, não por inspeção.
- **Isolamento entre negócios** afirmado em cada serviço purgado (§6).
- **Cobertura derivada do schema** em IA e Scheduling (§6): tabela nova sem purga quebra o teste.
- **A guarda de reativação** tem teste que falha se a guarda sair (§3).
- **A tela** é exercitada em pedir, acompanhar com dias restantes, cancelar e no caminho de falha do servidor.
- Teste que falha por motivo diferente do que anuncia não conta. Nada de asserção trivialmente verdadeira. Fixture não pode mascarar o defeito que o teste diz cobrir — foi assim que o defeito de edição de conhecimento passou pela rodada 1 do Goal024.

### 11. Documentação

Atualizar apenas o que a mudança fizer mentir: `apps/bff/PUBLIC_API_V1.md`; e em `docs/migration/` a linha de **G-29** em [GAP_ANALYSIS](../GAP_ANALYSIS.md), [CURRENT_STATE](../CURRENT_STATE.md) nas partes de BFF, IA, Scheduling e frontend, [DATA_MIGRATION](../DATA_MIGRATION.md) na parte de migrations do BFF, [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) se algum módulo mudar de consumidor e [VALIDATION_GATE](../VALIDATION_GATE.md) se algum passo de gate mudar. Registrar a decisão em [DECISIONS](../DECISIONS.md) como **D-041**, no formato das anteriores, cobrindo a máquina de estados da conta, a guarda contra reativação automática, a purga por negócio derivada do schema e o que sobrevive à purga. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe estado durável de exclusão por negócio no BFF, com pedido, vencimento, cancelamento, conclusão e estado.
2. A linha de exclusão **não** é apagada pela purga do negócio e, depois dela, não contém dado pessoal.
3. O prazo de sete dias está em constante declarada de produto, não em variável de ambiente nem em campo configurável; o relógio é injetável para teste.
4. A migration é aditiva, não remove coluna existente e é retomável.
5. Iniciar a exclusão exige sessão, CSRF e a senha atual, e não aceita `userId`/`tenantId` do corpo.
6. Senha errada não inicia efeito nenhum.
7. Iniciar desliga a IA desejada (`enabled: false` e `activatedByRunId: null`), projeta o desejado para a IA, derruba o canal do negócio na IA e desconecta o WhatsApp pelo caminho já existente.
8. Pedir duas vezes não cria duas exclusões nem repete efeito.
9. A sessão do usuário **não** é revogada por pedir exclusão.
10. Com exclusão `SCHEDULED`, `reconcileAiActivation` não religa a IA, e há teste que falha se a guarda for removida.
11. Negócio sem exclusão agendada tem exatamente o comportamento de reconciliação da baseline, afirmado por teste.
12. As intenções de notificação pendentes do negócio em exclusão não são entregues e terminam com motivo do vocabulário fechado vigente; o relatório nomeia qual motivo e por quê, e nenhum valor novo foi acrescentado ao vocabulário.
13. Cancelar dentro do prazo volta o estado para não agendado e não dispara efeito de purga.
14. Cancelar fora do prazo ou em estado terminal recusa com código próprio e não faz nada.
15. Cancelar **não** reconecta WhatsApp nem religa a IA, e a tela diz isso.
16. Vencido o prazo, a purga acontece: IA, Scheduling e BFF, com o `User` apagado por último.
17. A conta só é marcada como purgada depois de todas as lojas confirmarem.
18. Uma passada que falhe no meio deixa estado retomável e a seguinte conclui sem intervenção manual.
19. Purgar duas vezes não é erro e não produz efeito colateral.
20. A purga é limitada por teto por passada e sinaliza trabalho restante.
21. O laço de purga é desligado por default e nenhum teste o sobe; as suítes chamam a função diretamente.
22. Duas instâncias não purgam o mesmo negócio ao mesmo tempo, garantido por lease com fencing por token.
23. Cada serviço de dados tem rota interna de purga por negócio, sob a autenticação interna vigente, que nunca aceita ausência de `tenantId` nem lista de negócios.
24. Existe teste em IA e em Scheduling comparando a lista declarada de tabelas purgadas com os modelos que carregam `tenantId` no schema: tabela nova sem purga quebra o teste.
25. Teste com dois negócios prova que purgar um deixa o outro inteiro, em cada serviço.
26. Depois da purga, o login daquele e-mail não autentica e nenhuma sessão anterior autentica.
27. O bloco desabilitado "Excluir conta" não existe mais; a copy antiga sobre "etapa futura do produto" saiu do `src`.
28. A tela exige confirmação explícita e senha, e enuncia antes de executar: automações desligadas, WhatsApp desconectado, sete dias para cancelar, depois disso sem volta.
29. Com exclusão agendada, a tela mostra os dias restantes calculados a partir do vencimento devolvido pelo servidor.
30. Falha de rede ou recusa do servidor nunca é apresentada como sucesso na tela.
31. `GET /v1/status` devolve o estado da exclusão e o aviso persistente vem dele, não de estado inventado no cliente.
32. `PUBLIC_API_V1.md` mudou nas rotas novas e no campo novo de status, e em nenhum outro ponto.
33. Nenhuma rota existente mudou de forma ou de código de erro.
34. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
35. Os gates declarados foram executados e o relatório traz o resultado real de cada um, incluindo `validate:integration` e `validate:ui` nas cinco larguras.
36. `GAP_ANALYSIS` reflete o estado real de **G-29** depois do diff.
37. `DECISIONS` tem **D-041** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior.

## Entrega

Relatório do Developer com: diff por área e por serviço, resultado real dos gates (não "deveria passar"), a migration criada e o que ela faz, o mapa das tabelas purgadas por serviço com a origem da lista, o que foi decidido sobre as intenções de notificação pendentes, a lista de arquivos tocados fora dos pontos de implementação com justificativa, e o que ficou declaradamente fora. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
