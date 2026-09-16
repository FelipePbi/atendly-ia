# Goal 024 — Configurações completas e conhecimento editável

**Status: ACCEPTED** na rodada 2, conforme [review024](../reviews/024-review.md). Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-15 pelo Tech Lead Agent após [Goal023 ACCEPTED](../reviews/023-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `70d5a8825732d5a6326b5a1db564b80479f9d650`

Goal anterior: 023 — Retenção configurável e purga de conteúdo multistore

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal023 já integrado em `main` (origem `3cbf096c2a0f86c2a24e77d0a3fda7675983c0ea`), incluindo implementação das três rodadas, review e documentação de fechamento. O commit posterior `268e3cc` corrige apenas o cabeçalho de status do documento do Goal023 e não toca código. O diff inicial desta execução contra `70d5a882` deve conter, no máximo, artefatos preexistentes de `graphify-out/` e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-31 na última superfície de tela que ainda não foi redesenhada** — Configurações — e dar interface ao que **G-24** entregou em contrato no Goal012 e nunca ganhou tela: **FAQ e conhecimento do negócio editáveis**.

São dois fatos concretos da baseline, não impressões:

- **`ProductSettingsScreen.tsx` é o último monolito de tela da migração.** São 942 linhas, dezesseis cenários declarados em `types.ts` e **oito rotas** em `app/(platform)/configuracoes/` — hub, negócio, IA, WhatsApp, agenda, disponibilidade, conversas e conta — todas despachadas pelo mesmo componente, com um único `useShellConfig` que calcula destino, título e ação por cenário. Os Goals 015, 016, 017, 018 e 020 fizeram exatamente esta operação em Clientes/Serviços, Agenda, Conversas, Onboarding e Importação; a linha de **G-31** em [GAP_ANALYSIS](../GAP_ANALYSIS.md) registra Configurações como o que sobrou, e o [Goal023](023-retencao-configuravel-e-purga-de-conteudo-multistore.md) declarou de propósito que não a redecomporia — acrescentou `RetentionSection` como seção própria e deixou a tela como estava.
- **O conhecimento do negócio não tem superfície nenhuma.** `BffKnowledgeService` existe em `apps/frontend/src/data/services/`, está registrado em `registry.ts` e **não tem um único consumidor**: nenhum `.tsx` do `src` referencia `.knowledge`. O docblock da própria classe diz "Sem tela: a experiencia e do Goal015" — o 015 entregou Clientes e Serviços, o 018 entregou onboarding, e a tela nunca chegou. O vault promete que a IA responde a partir de *FAQ*, *descrições e regras internas de serviço* e *outras informações cadastradas* ([IA e Conversas](../../product-vault/01-Regras/03-IA-e-Conversas.md)), e a profissional hoje não tem onde cadastrar nada disso.

Dois itens menores, também nominais no vault e também ausentes:

- **"Sair de todos os dispositivos"** é item da seção Conta em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md). `revokeAllUserSessions` já existe e já é usado na troca de senha (`apps/bff/src/modules/auth/routes.ts`), mas **nenhuma rota pública o expõe** e a tela não oferece a ação.
- **Importação está escondida dentro de Agenda.** `ImportSettingsSection` é montada dentro de `CalendarSettings`, enquanto o vault lista Importação como seção própria do hub.

**A Home não recebe trabalho novo neste Goal, por conferência e não por omissão.** O vault pede para Início *"status IA/WhatsApp; pendências; próximos atendimentos; poucas métricas secundárias"*, e `features/dashboard/DashboardScreen.tsx` já entrega a faixa de status honesto (Goal014, reconciliada no Goal019), "Agenda de hoje", "Próximo atendimento", "O que a Atendly fez hoje", "Precisam de atenção", "Ações rápidas" e o checklist pós-onboarding do Goal018. Ela serve **uma** rota com **um** call site de `useShellConfig` — não é o padrão de monolito que G-31 persegue. Métricas adicionais do negócio continuam sem aprovação de produto e **não** entram aqui.

**A metade de conta de G-29 — exclusão recuperável em 7 dias, automações desligadas, WhatsApp desconectado, cancelamento dentro do prazo e restore exigindo novo teste de ativação — é do 024B**, conforme v44 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento). O motivo está registrado lá e é de tamanho e de natureza: decompor oito rotas de configuração e construir uma máquina de estados destrutiva de conta são trabalhos diferentes, com custo de erro diferente, e este Goal entrega justamente a seção Conta decomposta em que aquele vai entrar.

Este Goal **não** faz: exclusão de conta, suspensão, restore, desligamento de automações ou desconexão de WhatsApp por ciclo de vida (024B); métrica nova na Home; mudança em qualquer contrato de conhecimento, retenção, lembrete ou central — os três são consumidos como estão; retirada de rota legada (025); e nada em Scheduling, IA, Evolution ou Go. Não reabre nenhum aceite de 001–023.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-030** (fundação visual, shell único, telas declarando só destino/título/ação), **D-031** (decomposição por módulo com um call site de `useShellConfig` por cenário, provado por render), **D-033** (a mesma operação em Conversas), **D-039** (a seção Conversas como ela está hoje) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 012, 014, 015, 017, 018, 019, 020, 021, 022 e 023 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Consultar seletivamente no Product Vault apenas a seção "Mais / Configurações" e a seção "Início" de [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), a seção "Conhecimento do negócio" de [IA e Conversas](../../product-vault/01-Regras/03-IA-e-Conversas.md) e [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md). **Não abrir a seção "Exclusão da conta"** de [Privacidade e Retenção](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md): ela é do 024B. Não abrir o vault inteiro.
- Consultar `docs/design-reference/claude-design/prototype/project/` apenas nas telas de configuração e de lista/edição de conteúdo, e só para resultado visual. Instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-31** na parte de Configurações e **G-24** na parte de tela são os alvos. **G-29 na parte de conta não é.**
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`, seções "Conhecimento, memória do cliente, resumo e sugestões (Goal012)" e "Rotas registradas". Usar Graphify apenas para confirmar consumidores de `ProductSettingsScreen` e de `BffKnowledgeService`; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **As oito rotas de configuração existem e são finas.** Cada `page.tsx` em `app/(platform)/configuracoes/` monta `SettingsScreen` com um `scenario`; `SettingsScreen.tsx` tem doze linhas e só repassa para `ProductSettingsScreen`. As rotas não precisam mudar de caminho.
- **Os cenários vivem em `features/settings/types.ts`**: `hub`, `hub-external`, `business`, `ai`, `whatsapp-connected`, `whatsapp-disconnected`, `whatsapp-reconnecting`, `whatsapp-expired`, `whatsapp-error`, `calendar`, `calendar-external`, `availability`, `conversations`, `account`, `loading`, `error`. Os cinco de WhatsApp são discriminados por prefixo no despachante.
- **Quatro seções já são módulos próprios e não devem ser reescritas:** `features/settings/RetentionSection.tsx` (Goal023), `features/reminders/ReminderSettingsSection.tsx` (Goal021), `features/imports/ImportSettingsSection.tsx` (Goal020) e o painel de conexão de `features/whatsapp/`, consumido por `WhatsAppSettings`. O bloco de negócio vem de `features/onboarding/blocks/business` desde o Goal018.
- **As seções escrevem em seis contratos diferentes**: `PATCH /v1/settings/business`, `PATCH /v1/settings/ai`, `PATCH /v1/settings/availability`, `PATCH /v1/auth/password`, `POST /v1/auth/logout` e `GET/PATCH /v1/settings/retention`, mais `GET /v1/settings` na leitura. Nenhum deles muda neste Goal.
- **As rotas de conhecimento existem e são proxies finos da IA**: `GET/POST /v1/knowledge/documents`, `GET/PUT/DELETE /v1/knowledge/documents/:id` e `PUT /v1/knowledge/other-info`. `type` é um de `FAQ`, `GUIDANCE`, `CARE`, `PROCEDURE`, `BUSINESS_INFO` ou `TEXT_POLICY`; editar gera versão nova e inativa a anterior; `DELETE` desativa e nunca remove linha; `serviceId` liga o documento a um serviço do catálogo por ID; existe exatamente **um** `BUSINESS_INFO` por negócio, gravado só por `PUT /v1/knowledge/other-info`, e `POST`/`PUT /v1/knowledge/documents` recusam `type: "BUSINESS_INFO"` com `409`. Falha do provider de embedding chega como `502` com `upstreamCode: "KNOWLEDGE_INDEX_UNAVAILABLE"` e **nada muda no banco**.
- **`BffKnowledgeService` já implementa listar, criar, editar, desativar e o campo livre**, com `knowledgeDocumentSchema` em `data/mappers/publicApiSchemas.ts`. Falta consumidor, não cliente.
- **`revokeAllUserSessions(userId, reason)` já existe** e é chamada em `PATCH /v1/auth/password`; `UserSession` é consultada a cada requisição desde o Goal003, então revogar derruba os outros dispositivos na requisição seguinte deles.
- **O CSS de módulo é `shared/styles/atendly-settings.css`**, herdando `tokens.css`, no mesmo padrão de `atendly-imports.css` e `atendly-notifications.css`.
- Gates: `scripts/validate-core.mjs` (builds e suítes sem banco), `scripts/validate-integration.mjs` (banco descartável) e `validate:ui` (Playwright nas cinco larguras).

## Pontos de implementação

- `apps/frontend/src/features/settings/` — decomposição em módulos por seção, hub conforme o vault, seção de conhecimento e ação de sair de todos os dispositivos.
- `apps/frontend/src/features/knowledge/` — módulo novo de conhecimento do negócio, consumido pela seção IA.
- `apps/frontend/src/shared/styles/atendly-settings.css` — o que a decomposição e a seção nova exigirem, herdando tokens.
- `apps/frontend/src/data/services/BffAuthService.ts` e `registry.ts` — a chamada de revogação de sessões.
- `apps/bff/src/modules/auth/routes.ts` — a rota pública que expõe a revogação já existente.
- `apps/bff/PUBLIC_API_V1.md` e os documentos de §10.

## Escopo obrigatório

### 1. Configurações decomposta, sem mudar comportamento

`ProductSettingsScreen.tsx` deixa de ser a tela e passa a ser **despachante**, no padrão que o Goal017 aplicou a Conversas: um módulo por seção em `features/settings/`, cada um declarando a própria configuração de shell **uma única vez**, e o despachante escolhendo o módulo pelo cenário. Os dezesseis cenários de `types.ts` continuam existindo e alcançáveis — nenhum some, nenhum nasce. As oito rotas continuam nos mesmos caminhos e continuam finas.

As primitivas locais hoje embutidas na tela (`Page`, `Password`, `SaveActions`, `SettingsMessage`, `ToneChoice`, `formString`, `sourceLabel`, `toneLabel`, `weekdayLabels`) saem para um lugar compartilhado do módulo; o que já for primitiva de `shared/ui/` deve ser usada em vez de reimplementada. **Nenhum comportamento de formulário muda**: mesmos campos, mesmas chamadas, mesmas mensagens de erro e sucesso, mesmo tratamento de `busy`. Esta parte é refactor — se algum texto de tela mudar, muda porque §2, §3 ou §5 pediu, e o relatório diz qual.

`RetentionSection`, `ReminderSettingsSection`, `ImportSettingsSection` e o painel de WhatsApp **não são reescritos**: são montados pelos módulos novos como já são hoje.

### 2. O hub lista o que o vault manda

O hub passa a ter entrada própria para **Importação**, apontando para `/importacao`, e `ImportSettingsSection` deixa de ser montada dentro de Agenda. As demais entradas seguem o vault: Negócio, Agenda, Disponibilidade (só quando a fonte é Atendly, como já é hoje), IA, WhatsApp, Conversas, Conta. A copy de cada card continua dizendo o estado real do que ela leva — nome do negócio, tom da IA, fonte da agenda —, sem inventar contagem ou métrica.

Lembretes continuam onde estão, dentro de Agenda: o vault não os aloca em seção própria e mover não é melhoria, é churn.

### 3. Conhecimento do negócio editável

Seção nova dentro de **Configurações → IA**, consumindo `BffKnowledgeService` como ele já é. Entrega:

- **Lista dos documentos ativos**, com tipo e, quando houver, o serviço ligado. Documento geral e documento de serviço são visualmente distinguíveis, porque a precedência de recuperação depende disso.
- **Criar** documento de tipo `FAQ`, `GUIDANCE`, `CARE`, `PROCEDURE` ou `TEXT_POLICY`, com título e conteúdo, opcionalmente ligado a um serviço do catálogo escolhido por ID a partir de `GET /v1/services`.
- **Editar** a versão vigente, deixando claro que editar publica uma versão nova e não apaga a anterior.
- **Desativar**, deixando claro que desativar tira o documento do contexto da IA e não apaga nada.
- **`BUSINESS_INFO` não aparece como tipo escolhível** em nenhum seletor, porque o contrato o recusa com `409`. O campo livre é §4.
- **`502` com `KNOWLEDGE_INDEX_UNAVAILABLE` tem tratamento próprio e honesto:** a tela diz que a indexação está indisponível e que **nada foi salvo** — que é o que o contrato garante —, e não apresenta isso como erro genérico nem deixa o formulário parecendo ter gravado.

### 4. Outras informações importantes

Campo livre único do negócio, gravado só por `PUT /v1/knowledge/other-info`, na mesma seção. Lê o `BUSINESS_INFO` vigente, salva, e diz quando foi salvo. Não oferece criar um segundo, não oferece desativar, e não usa as rotas de documento.

### 5. Conta: sair de todos os dispositivos

- **Rota pública nova e aditiva no BFF** que revoga todas as sessões do usuário autenticado, reusando `revokeAllUserSessions` com razão própria. Sob sessão autenticada e CSRF como as demais mutações; não aceita `userId` nem `tenantId` do chamador — o usuário sai do contexto da sessão, e nada mais.
- A sessão que fez a chamada **também** é revogada: "todos os dispositivos" inclui este. A tela leva para `/login` depois, pelo mesmo caminho que "Sair da conta" já usa.
- A ação é explicada antes de executar: diz que derruba o acesso em todos os aparelhos e que será preciso entrar de novo. É reversível por login, então não exige o mesmo peso de confirmação de uma exclusão.
- **O bloco "Excluir conta" continua desabilitado**, mas a copy passa a dizer a verdade sobre o porquê em vez de "não possui um fluxo público seguro nesta versão". Nenhuma promessa de data e nenhum caminho que comece algo.

### 6. Contrato público do BFF

`apps/bff/PUBLIC_API_V1.md` ganha a rota nova na tabela de rotas registradas e a descrição do seu efeito — revoga todas as sessões do usuário, inclusive a atual. **Nenhum outro contrato muda**: conhecimento, retenção, lembretes, central, negócio, IA, disponibilidade e WhatsApp são consumidos exatamente como estão. Se o Developer concluir que precisa mudar um contrato existente para entregar §1–§5, isso é achado para o relatório, não licença para mudar.

### 7. Home: conferência, não trabalho

A Home é conferida contra a seção "Início" do vault e contra o estado honesto de IA/WhatsApp, e o relatório declara o resultado dessa conferência. **Não** entram métricas novas, cards novos, pollers novos nem decomposição de `DashboardScreen`. Se a conferência achar divergência real entre o que a tela afirma e o que `GET /v1/status` ou `GET /v1/dashboard` devolvem, ela é corrigida no menor diff possível e nomeada no relatório; se não achar, o relatório diz isso e nada muda.

### 8. O que não pode mudar de comportamento

- Nenhuma rota de configuração muda de caminho, e nenhuma vira rota nova.
- Nenhum formulário existente muda campo, validação ou destino.
- `useShellConfig` continua sendo chamado **uma vez por cenário vivo**, nunca em laço nem condicionalmente dentro de render.
- A seção Conversas do Goal023 — allowlist lida do servidor, confirmação ao reduzir, nota de Não classificadas — continua idêntica em comportamento e em copy. **Nenhuma copy promete, sugere ou insinua exclusão de conteúdo não classificado**, aqui também.
- O onboarding continua com casca própria, sem sidebar nem bottom navigation.

### 9. Prova

- **Render, não contagem de linhas.** Cada cenário de `types.ts` é montado em teste e prova: o módulo certo aparece, a configuração de shell é declarada uma vez, e o formulário chama o contrato que já chamava. O padrão é `goal015-shell-invariant.test.tsx` e os equivalentes de 016/017/020.
- **A seção de conhecimento é exercitada de verdade:** listar, criar, editar, desativar e o campo livre, com o dublê de serviço devolvendo o DTO real do schema; mais o caso `502`/`KNOWLEDGE_INDEX_UNAVAILABLE` provando que a tela diz que nada foi salvo.
- **`BUSINESS_INFO` ausente do seletor** é asserção, não inspeção visual.
- **A revogação de sessões tem teste de integração no BFF** provando que a sessão anterior deixa de autenticar na requisição seguinte, e que a rota não aceita identidade do chamador.
- Teste que falha por motivo diferente do que anuncia não conta. Nada de `expect(true)`.

### 10. Documentação

Atualizar apenas o que a mudança fizer mentir: `apps/bff/PUBLIC_API_V1.md` (§6), e em `docs/migration/` as linhas de **G-31** e **G-24** de [GAP_ANALYSIS](../GAP_ANALYSIS.md), [CURRENT_STATE](../CURRENT_STATE.md) na parte de frontend e de rotas de autenticação, [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) se algum módulo deixar de ter consumidor, e [VALIDATION_GATE](../VALIDATION_GATE.md) se algum passo de gate mudar. Registrar a decisão de contrato em [DECISIONS](../DECISIONS.md) como **D-040**, no formato das anteriores, cobrindo a decomposição, o consumo do conhecimento sem mudar contrato e a revogação de sessões. Não criar documento novo.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. `ProductSettingsScreen.tsx` deixou de conter as seções e é um despachante; nenhum módulo de seção acumula mais de uma seção.
2. Existe um módulo por seção em `features/settings/`, e cada um declara a configuração de shell uma única vez.
3. Os dezesseis cenários de `types.ts` continuam existindo e todos são alcançáveis pelo fluxo do produto; nenhum cenário novo foi criado sem rota que o alcance.
4. As oito rotas de `app/(platform)/configuracoes/` continuam nos mesmos caminhos e continuam finas.
5. Nenhum formulário existente mudou campo, validação, destino ou mensagem, exceto onde §2, §3 ou §5 pediu — e o relatório nomeia cada exceção.
6. `RetentionSection`, `ReminderSettingsSection`, `ImportSettingsSection` e o painel de WhatsApp não foram reescritos.
7. O hub tem entrada própria para Importação apontando para `/importacao`, e `ImportSettingsSection` não é mais montada dentro de Agenda.
8. A entrada de Disponibilidade continua aparecendo apenas quando a fonte da agenda é Atendly.
9. Existe seção de conhecimento dentro de Configurações → IA que lista os documentos ativos do negócio.
10. Documento geral e documento ligado a serviço são distinguíveis na lista.
11. É possível criar documento de tipo `FAQ`, `GUIDANCE`, `CARE`, `PROCEDURE` ou `TEXT_POLICY`, opcionalmente ligado a um serviço escolhido por ID a partir do catálogo.
12. `BUSINESS_INFO` não aparece como opção em nenhum seletor de tipo.
13. Editar um documento diz, na tela, que publica versão nova e não apaga a anterior.
14. Desativar diz, na tela, que tira o documento do contexto da IA e não apaga nada.
15. `502` com `upstreamCode: "KNOWLEDGE_INDEX_UNAVAILABLE"` produz mensagem própria afirmando que **nada foi salvo**, e não uma mensagem genérica de erro.
16. O campo livre "Outras informações importantes" lê e grava só por `PUT /v1/knowledge/other-info`, e a tela não oferece criar um segundo nem desativá-lo.
17. Nenhuma rota de conhecimento foi alterada no BFF e nenhum schema de `publicApiSchemas.ts` mudou de forma para acomodar a tela.
18. Existe rota pública nova que revoga todas as sessões do usuário autenticado, sob sessão e CSRF, sem aceitar `userId` ou `tenantId` do chamador.
19. A sessão que fez a chamada também é revogada, e a tela leva para `/login`.
20. Teste de integração do BFF prova que a sessão anterior deixa de autenticar na requisição seguinte.
21. A ação de sair de todos os dispositivos é explicada antes de executar, sem copy que a confunda com exclusão de conta.
22. O bloco "Excluir conta" continua desabilitado e não inicia nada; a copy diz a verdade sobre o motivo.
23. `PUBLIC_API_V1.md` mudou **exatamente** na rota nova, e em nenhum outro ponto.
24. Nenhum arquivo de Scheduling, IA, Evolution ou Go foi tocado.
25. Nenhuma migration foi criada em nenhum app.
26. Cada cenário de configuração é montado em teste e prova que o módulo certo aparece.
27. A seção de conhecimento é exercitada em listar, criar, editar, desativar e campo livre, com o DTO real do schema.
28. `DashboardScreen.tsx` não foi decomposto e nenhuma métrica nova entrou na Home.
29. Se a conferência da Home achou divergência, ela está nomeada no relatório e corrigida no menor diff; se não achou, o relatório declara isso.
30. Nenhuma copy de Configurações promete, sugere ou insinua exclusão de conteúdo não classificado.
31. Nenhum `eslint-disable` novo entrou no `src` sem justificativa escrita na linha.
32. `features/settings/` não deixou arquivo sem importador; se algum módulo perdeu consumidor, ele saiu da árvore.
33. Os gates declarados foram executados e o relatório traz o resultado real de cada um, incluindo `validate:ui` nas cinco larguras.
34. `GAP_ANALYSIS` reflete o estado real de **G-31** e de **G-24** depois do diff, e **G-29 continua declarado aberto na parte de conta**.
35. `DECISIONS` tem **D-040** registrada no formato das anteriores.

## Entrega

Relatório do Developer com: diff por área, resultado real dos gates (não "deveria passar"), a lista de arquivos tocados fora dos pontos de implementação com justificativa, o mapa cenário → módulo → call site de `useShellConfig`, a lista das mudanças de copy com o motivo de cada uma, o resultado da conferência da Home, e o que ficou declaradamente fora — em especial o ciclo de vida da conta. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
