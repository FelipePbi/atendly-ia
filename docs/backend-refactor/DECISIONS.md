---
title: Decisões técnicas da refatoração
status: vigente
fase: 0
---

# DECISIONS

Somente decisões **técnicas novas** exigidas pela refatoração. Decisões de produto vivem em `docs/product-vault/` e não são repetidas aqui.

Status possíveis: `PROPOSTA` (aguarda confirmação antes da fase que depende dela) · `ACEITA` · `SUBSTITUÍDA`.

---

## D-01 — Execução temporal durável (jobs)

**Status:** PROPOSTA · decide antes da F8

**Problema.** O vault exige lembretes, expiração de hold, auto-complete, no-show, retenção, janelas de espera de 2–5 min, orquestração do teste de ativação, alertas por e-mail e retry. **Não existe nenhuma infraestrutura de execução temporal em nenhum serviço** — nem cron, nem fila, nem worker. O único temporizador é um `setTimeout` em memória que, além de tudo, está inoperante. Todos os serviços rodam em plano free do Render, que hiberna por inatividade.

**Opções.**

1. `setInterval` dentro de cada serviço. Zero infraestrutura, mas duplica execução com múltiplas réplicas e morre com o processo.
2. Serviço worker novo. Isolamento limpo, mas viola a diretriz de não criar serviço novo sem prova de necessidade, e o plano free hiberna o worker também.
3. Biblioteca de fila (BullMQ + Redis, pg-boss). Robusta, mas BullMQ exige Redis — infraestrutura nova que nenhuma regra do MVP justifica.
4. **Tabela `ScheduledJob` por serviço + endpoint `/internal/jobs/tick` + `pg_advisory_lock` + o `health-worker` existente como tick driver.**

**Decisão.** Opção 4.

**Motivo.** É a menor mudança arquitetural que resolve o problema de verdade. Todos os componentes já existem: o `health-worker` já roda um loop de 40 s, já conhece as URLs de todos os serviços e já está sempre acordado (é o que impede a hibernação); o `scheduling-service` já usa `pg_advisory_lock` corretamente para a agenda; os três serviços já têm Postgres. Estado durável em banco resolve restart e réplicas; o advisory lock resolve concorrência; a idempotência dos handlers resolve retry.

**Impacto.** `ScheduledJob` nos três bancos; um endpoint interno por serviço; o `health-worker` deixa de ser só pinger e passa a exigir `INTERNAL_SERVICE_TOKEN`. Granularidade mínima de disparo é o intervalo do tick (40 s hoje) — suficiente para tudo que o vault pede, inclusive as janelas de 2–5 min. A janela de fragmentação de 2–3 s **não** usa o tick: continua sendo latência de processo, mas com estado persistido para sobreviver a restart.

**Risco aceito.** Se o `health-worker` cair, as automações param até ele voltar. Mitigação: o próprio health check dele já é monitorado, e nenhum job é sensível a atraso de minutos.

---

## D-02 — Não introduzir broker, Redis ou fila externa

**Status:** ACEITA

**Problema.** É tentador resolver jobs, debounce e retry com Kafka/RabbitMQ/Redis/BullMQ.

**Decisão.** Não introduzir nenhum. Postgres + advisory lock + tabela de jobs cobre o MVP.

**Motivo.** Nenhuma regra do product vault exige throughput, fan-out para múltiplos consumidores ou entrega garantida além do que uma tabela transacional oferece. O volume é de um profissional autônomo por tenant. Introduzir um broker adicionaria um ponto de falha, um custo e um modo de operação novo para resolver um problema que o banco já resolve.

**Impacto.** Se um dia houver necessidade real (multi-profissional, volume alto), a troca é local: o contrato `ScheduledJob` + tick é substituível sem tocar nos handlers.

---

## D-03 — `Contact` e `Customer` não são o mesmo conceito

**Status:** ACEITA

**Problema.** Onde mora `Ignorar IA`? E como conciliar "um telefone pode pertencer a vários clientes" com "a IA precisa reconhecer quem está falando"?

**Opções.** (a) Unificar num único `Customer` compartilhado. (b) Manter separados, correlacionados por telefone normalizado.

**Decisão.** (b). `Contact` no ai-orchestrator é uma **identidade de WhatsApp** (um número); `Customer` no scheduling é uma **pessoa atendida** (pode não ter telefone). Relação 1 contato → N clientes.

**Motivo.** Unificar torna impossível a regra central do vault — a mãe que agenda para o filho pelo próprio WhatsApp. É exatamente o erro do modelo atual, onde `@@unique([tenantId, normalizedPhone])` no `Customer` impede o caso. Além disso, `Ignorar IA` é propriedade do **número**, não da pessoa atendida.

**Impacto.** A IA precisa desambiguar para quem é o agendamento quando o contato tem mais de um cliente associado — o que o vault já prevê ("incluir o nome do cliente quando houver mais de uma pessoa envolvida"). Não há FK entre bancos; a correlação é por telefone normalizado no momento do uso.

---

## D-04 — Remover a abstração `CalendarProvider` em vez de mantê-la

**Status:** ACEITA

**Problema.** O scheduling tem uma abstração de provider com duas implementações, um factory, guards de capacidade e ~8 pontos de ramificação por fonte. Manter é o caminho de menor diff.

**Opções.** (a) Manter, deixando só o provider Atendly. (b) Remover a indireção inteira.

**Decisão.** (b).

**Motivo.** A única razão de existir da abstração era a escolha de fonte ativa de agenda, que o produto removeu explicitamente e registrou como decisão substituída. Mantê-la obrigaria a implementar holds, ciclo de vida, buffers, exceções e recorrência atrás de uma interface que nunca terá um segundo implementador — e cada uma dessas features teria que decidir o que fazer no caso `MINHA_AGENDA`. Isso é custo permanente para preservar uma premissa morta. Este é o caso exato em que "não preservar abstração cuja única razão era uma regra removida" se aplica.

**Impacto.** Remove ~20 % do código do scheduling e limpa o vocabulário do contrato público em 7 arquivos do BFF antes de os contratos serem escritos. Requer verificação bloqueante de que nenhum tenant está em `MINHA_AGENDA`.

---

## D-05 — Banco real nos testes do scheduling

**Status:** PROPOSTA · decide na F1

**Problema.** O `scheduling-service` não tem testes. O que precisa ser testado — transação `Serializable`, `pg_advisory_xact_lock`, exclusion constraint, unique de idempotência, tipos `TIME`/`DATE`/`TIMESTAMPTZ` — **não é testável com Prisma mockado**. O ai-orchestrator hoje usa objetos literais como fake de Prisma, o que serve para lógica de conversa e não serviria aqui.

**Opções.** (a) Mock de Prisma, como o AIO faz. (b) `pglite` (já presente em `node_modules` do scheduling, sem uso). (c) Container Postgres dedicado à suíte.

**Decisão proposta.** (c) para a suíte de integração, com (b) avaliado se `pglite` suportar advisory locks e `gist` — o que precisa ser verificado, não assumido. Testes de lógica pura (cálculo de intervalos, timezone) permanecem sem banco.

**Motivo.** Testar concorrência de agenda com mock é testar o mock. A garantia de que dois clientes não confirmam o mesmo horário depende de comportamento do Postgres.

**Impacto.** `docker-compose` de teste; CI mais lento; suíte dividida entre unit e integração.

---

## D-06 — Provider de e-mail

**Status:** PROPOSTA · decide antes da F16

**Problema.** **Não existe nenhum provider de e-mail em nenhum serviço.** O único fluxo que precisa (reset de senha) foi delegado a um webhook genérico cuja variável **não está declarada no `render.yaml`** — ou seja, reset de senha **retorna 500 em produção hoje**. O vault também exige alerta por e-mail para problemas críticos (WhatsApp desconectado após tentativas, IA indisponível).

**Opções.** (a) Manter o webhook genérico e apenas configurá-lo. (b) Integrar um provider transacional diretamente no BFF.

**Decisão proposta.** (b), com o provider a ser escolhido pelo usuário. O webhook genérico adiciona um salto e um ponto de falha sem benefício, já que não há um serviço de entrega existente do outro lado.

**Motivo.** Dois fluxos obrigatórios do MVP dependem de e-mail. Manter um webhook não implementado é manter um requisito do vault permanentemente quebrado.

**Impacto.** Uma dependência nova e uma chave de API. É a única dependência externa nova de todo o plano, e ela é exigida por regra explícita de produto.

---

## D-07 — Configuração de tenant: projeção com reconciliação

**Status:** ACEITA

**Problema.** `enabled`, `tone`, `businessName` e `timezone` existem no BFF e no ai-orchestrator, sincronizados por um POST manual. Se o POST falhar, os bancos divergem **em silêncio, para sempre**. O `businessContext` no AIO é JSON não tipado normalizado com `safeParse` que cai em default sem erro — um `settings` corrompido vira `businessName: ""`, que dispara handoff-por-configuração-incompleta sem indicar a causa.

**Opções.** (a) O AIO passa a ler do BFF a cada conversa. (b) Manter a projeção, com reconciliação e tipagem.

**Decisão.** (b).

**Motivo.** (a) inverte a dependência (o AIO passaria a chamar o BFF), coloca o BFF no caminho crítico de toda mensagem recebida e adiciona latência a um fluxo sensível. A projeção é a escolha certa; o que falta é torná-la confiável.

**Impacto.** O campo projetado passa a ter `version`/`syncedAt`; um job de reconciliação corrige divergências; `businessContext` deixa de ser JSON solto e passa a ser tipado por `contracts`. A projeção é **somente leitura** no destino.

---

## D-08 — `thread_id` do checkpointer passa a ser a sessão

**Status:** ACEITA

**Problema.** Hoje `thread_id = conversationId`, para sempre. Não há TTL, os checkpoints crescem indefinidamente, e a sessão de ~24 h do vault não tem onde existir.

**Decisão.** Introduzir `ConversationSession` (janela de ~24 h de inatividade) e usar o id dela como `thread_id`.

**Motivo.** Resolve três problemas de uma vez: a regra de sessão do vault, o crescimento infinito dos checkpoints e o fato de que "retomar a IA numa nova sessão" hoje significaria continuar de um estado arbitrariamente antigo. O `Conversation.state` inteiro é serializado no system prompt a cada turno — sem fronteira de sessão, esse custo cresce sem limite.

**Impacto.** Migration nova; memória estruturada do cliente (preferências, histórico) passa a ser o que atravessa sessões, não o checkpoint — que é exatamente o que o vault descreve.

---

## D-09 — Mapeamento `AiTone` → `AiStyle`

**Status:** ACEITA

**Problema.** O código tem 2 tons; o produto tem 3 estilos. É preciso decidir para onde vão os valores existentes.

**Decisão.** `PROFESSIONAL_OBJECTIVE → PROFESSIONAL`; `LIGHT_CLOSE → BALANCED`; `NULL → BALANCED`. `CASUAL` é valor novo, sem origem no legado.

**Motivo.** `LIGHT_CLOSE` é o **default** atual, e o vault define `Equilibrada` como default. Mapear para `CASUAL` mudaria o comportamento de todo tenant existente sem que ninguém tenha pedido. Há precedente: a migration `20260831220000_goal17_legacy_cleanup` já converteu `personaType` para `AiTone` com a mesma lógica de preservação de comportamento.

**Impacto.** Migration simultânea nos dois bancos (o enum está duplicado). Janela de compatibilidade no contrato público enquanto o frontend atual não for substituído.

---

## D-10 — Sobreposição forçada é política por ator, não endpoint separado

**Status:** ACEITA

**Problema.** O vault diz que a IA nunca cria encaixe, mas o profissional pode forçar sobreposição com alerta. Hoje IA e humano usam **o mesmo endpoint e o mesmo código**, e `source` é um rótulo nunca lido para decisão — ou seja, overlap é impossível para os dois.

**Opções.** (a) Endpoint separado para criação manual. (b) Mesmo endpoint, com política aplicada sobre o `actor`.

**Decisão.** (b). `actor: AI` nunca sobrepõe, nunca agenda serviço `NEEDS_REVIEW`, nunca cria atendimento sem serviço. `actor: USER` pode, com flag explícita, e o evento fica registrado no histórico.

**Motivo.** Duplicar o endpoint duplicaria toda a lógica de lock, transação, idempotência e snapshot — a parte difícil e já correta. A diferença entre IA e humano é de **autorização**, não de mecanismo.

**Impacto.** O `actor` deixa de ser rótulo e passa a ser argumento de política, validado no domínio. Toda sobreposição deliberada é auditável.

---

## D-11 — Exclusion constraint no banco, além da validação aplicacional

**Status:** ACEITA

**Problema.** Hoje a prevenção de sobreposição é 100 % aplicacional. Um caminho novo que esqueça `assertAvailable`, um bug, ou uma escrita direta produzem overlap silencioso sem o banco reclamar.

**Decisão.** Adicionar `EXCLUDE USING gist` sobre `(tenantId, tsrange(startAt, endAt))` para os status ocupantes, admitindo a exceção de sobreposição deliberada por usuário.

**Motivo.** Defesa em profundidade sobre a garantia central do produto. O advisory lock continua sendo o mecanismo primário (ele evita o erro); a constraint é a rede que impede o dado inválido de existir.

**Impacto.** Requer extensão `btree_gist`. A exceção de overlap deliberado precisa de modelagem cuidadosa — provavelmente uma coluna de participação no índice, não a remoção da constraint.

---

## D-12 — `TIMESTAMP` → `TIMESTAMPTZ`

**Status:** ACEITA

**Problema.** Instantes são gravados como UTC em colunas `TIMESTAMP(3)` **sem timezone**. Funciona enquanto tudo passar pelo driver com `Date` de JS, mas qualquer query crua, ferramenta de BI, `CURRENT_TIMESTAMP` ou job SQL interpreta no fuso da sessão.

**Decisão.** Migrar as colunas de instante para `TIMESTAMPTZ`. `AvailabilityRule`/`AvailabilityException` continuam `TIME`/`DATE` — são **wall clock** por definição e estão corretas assim.

**Motivo.** Estamos prestes a introduzir jobs que consultam por tempo. A hora de acertar isso é antes, não depois.

**Impacto.** Migration de conversão; os helpers de `shared/date-time` já estão corretos e não mudam.

---

## D-13 — `contracts` ligado por `file:`, sem npm workspaces

**Status:** ACEITA

**Problema.** O monorepo **não usa workspaces**: são 6 `package-lock.json` independentes e o Render faz `npm ci` por `rootDir`. `packages/contracts` não é importado por ninguém, mas está em todos os `buildFilter.paths` — muda e redeploya tudo, sem benefício.

**Decisão.** Ligar por `file:../../packages/contracts`, exatamente como `@atendly-ia/legal-contract` já é ligado no BFF. Não introduzir workspaces.

**Motivo.** Workspaces mudariam o modelo de build de todos os serviços e o deploy no Render, para resolver um problema que a dependência `file:` já resolve. Há precedente funcionando no próprio repositório.

**Impacto.** O redeploy em cascata passa a ter causa legítima. `build-all.sh` já constrói contracts primeiro.

---

## D-14 — Número WhatsApp da plataforma para o teste de ativação

**Status:** PROPOSTA · decide antes da F17

**Problema.** O vault define que o teste real é "uma conversa real enviada para o WhatsApp conectado **por um número oficial da Atendly**". Não existe nenhum número da plataforma configurado, nem instância separada da do tenant.

**Decisão proposta.** Uma instância `evolution-go` dedicada à plataforma, com número próprio, isolada das instâncias de tenant, usada exclusivamente pelo orquestrador do teste.

**Motivo.** É a única forma de o teste ser real. Usar o número do próprio tenant não valida nada — a mensagem precisa chegar de fora.

**Impacto.** Requisito operacional real: obter e manter um número. Risco de bloqueio pelo WhatsApp se o padrão de envio parecer automação em massa — o volume é baixo (um teste por ativação), mas precisa ser monitorado. É a razão pela qual F17 fica tarde na sequência.

---

## D-15 — Tracing e métricas ficam fora do MVP

**Status:** ACEITA

**Problema.** Não existe tracing, métricas nem error tracking em nenhum serviço. Os logs são estruturados e o `x-request-id` já atravessa os serviços corretamente, mas não há agregação.

**Decisão.** Não introduzir OpenTelemetry, Prometheus nem error tracking neste plano. Registrar como adiamento consciente.

**Motivo.** O escopo é um profissional autônomo por tenant, com poucos usuários controlados na validação. O `x-request-id` ponta a ponta já permite correlacionar manualmente. Introduzir observabilidade completa agora consumiria fases sem destravar nenhuma regra de produto.

**Impacto.** Diagnóstico de produção depende dos logs do Render. Fica registrado que a ausência é decisão, não esquecimento. `AiRun`/`AiToolCall` já dão auditoria de domínio da IA, que é o que mais importaria.

---

## Decisões pendentes que bloqueiam fases

| Decisão | Bloqueia | Pergunta a responder |
| --- | --- | --- |
| `04-DATA-MIGRATION.md §0` | estratégia de rollout de F4 em diante | Existe dado real em produção que precisa ser preservado? |
| D-05 | F1 | pglite suporta advisory lock e `gist`, ou vamos de container? |
| D-06 | F16 | Qual provider de e-mail? |
| D-14 | F17 | Quem obtém e mantém o número oficial da Atendly? |
