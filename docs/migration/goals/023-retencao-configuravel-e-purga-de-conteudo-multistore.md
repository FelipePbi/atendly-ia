# Goal 023 — Retenção configurável e purga de conteúdo multistore

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-15 pelo Tech Lead Agent após [Goal022 ACCEPTED](../reviews/022-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_HIGH

## Baseline aceita

Baseline aceita: `0b6dbf2f0e87d502ffbd4a4397feb685ad23a806`

Goal anterior: 022 — Central de notificações e alertas persistentes

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal022 já integrado em `main` (origem `41e688c00127d7c68abba079b38928ab4d435b1b`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra `0b6dbf2f` deve conter, no máximo, artefatos preexistentes de `graphify-out/` e ajustes de ferramental fora de `apps/`, que ficam preservados fora do escopo.

## Objetivo e posição

Fechar **G-29 na parte de conteúdo**: *"30/90/180/365, comercial 90 / pessoal 30; reduzir confirma"*, com a purga de **todas as cópias** do que expirou, nos quatro lugares onde elas existem hoje. É a primeira vez em toda a migração que a plataforma apaga dado de cliente de propósito — e é por isso que este Goal chega agora, e não antes: só depois do 022 todos os stores finais existem e todos os produtores são conhecidos.

Hoje a retenção é **indefinida em todos os serviços**. Nada expira: a mensagem de dois anos atrás continua no PostgreSQL da IA com o texto integral, o `AiRun` guarda em `outputText` a resposta que a IA mandou, `ProcessedEvent.rawPayload` guarda o evento como chegou, o `webhook_deliveries` do transporte em Go guarda o payload integral do evento — o resíduo que **G-04** e **G-23** arrastam desde o Goal004 —, as intenções de lembrete guardam `facts`/`detail` sem prazo desde o Goal021, e a central de notificações do Goal022 nasceu declaradamente sem purga. O [vault](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md) é explícito sobre o que deveria acontecer, e nenhuma camada cumpre: prazo configurável em Configurações → Conversas, quatro opções, defaults por categoria, redução que explica e confirma, e conversa que *"pode continuar existindo na lista com informações mínimas e indicação de que mensagens antigas expiraram"*.

**Este Goal entrega a metade de conteúdo de G-29. A metade de conta — exclusão recuperável em 7 dias, automações desligadas, WhatsApp desconectado, cancelamento dentro do prazo e restore exigindo novo teste de ativação — é do 024**, conforme v42 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento). O motivo está registrado lá e é de tamanho, não de preferência: são dois mecanismos irreversíveis independentes, e juntá-los num Goal só faria o custo de erro de cada um pagar pelo outro.

**A purga do grupo "Não classificadas" continua proibida.** É **U-01** em [DECISIONS](../DECISIONS.md): o vault permite categoria indefinida e não fixa prazo para ela, e a decisão de aplicar 30 ou 90 dias a conteúdo possivelmente pessoal é de uma pessoa. Este Goal não antecipa a resposta e não a contorna — a categoria simplesmente não recebe prazo, não aparece como opção e não é purgada, exatamente como o 022 tratou U-03 no alerta por e-mail. Entregar uma opção de prazo para Não classificadas seria pior do que não entregar nada: apagaria dado sob uma decisão que ninguém tomou.

Este Goal **não** faz: exclusão de conta, suspensão, restore (024); exclusão self-service de dado de cliente por solicitação, que o próprio vault declara fora do MVP; e-mail, push ou qualquer alerta fora de sessão (U-03); fila, broker, cron do sistema operacional, serviço novo ou segundo banco; retirada de rota legada (025); redecomposição de `ProductSettingsScreen` (024). Não reabre nenhum aceite de 001–022.

**Uma novidade arquitetural, declarada de propósito:** este Goal acrescenta **um** laço no processo do BFF. O 022 materializou notificação dentro de requisição de leitura porque o efeito era *criar* linha; apagar não pode depender de alguém abrir o app — o negócio que parou de usar o produto é justamente aquele cujo conteúdo precisa expirar. O registro de negócios (`Tenant`) só existe no banco do BFF e a única direção de chamada interna aceita é BFF → donos, então a varredura pertence ao BFF e a exclusão pertence a quem é dono do dado.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md). **D-008** (trabalho durável como laço com lease no processo do dono, sem fila nem serviço novo), **D-038** (materialização, dedupe e janela da central), **D-037** (a intenção de lembrete como fonte auditável), **D-021** (sessão e controle humano, que é onde mora a categoria), **D-030**/**D-031** (fundação visual e decomposição por módulo) em [DECISIONS](../DECISIONS.md). Preservar serviços, bancos, providers, frameworks e o restante da API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 003, 004, 005, 012, 013, 018, 020, 021 e 022 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Consultar seletivamente no Product Vault apenas as seções "Retenção", "Conversas pessoais", "Ignorar IA" e "Exclusão de cliente" de [Privacidade e Retenção](../../product-vault/01-Regras/08-Privacidade-e-Retencao.md), mais a seção de Configurações em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md) e [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md). **Não abrir a seção "Exclusão da conta"**: ela é do 024. Não abrir o vault inteiro.
- Consultar `docs/design-reference/claude-design/prototype/project/` apenas em seção de configuração com seletor e em diálogo de confirmação destrutiva, e só para resultado visual. Instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): **G-29 na parte de conteúdo** é o alvo; a parte de conta **não** é. O resíduo de retenção de **G-04** e **G-23** (`webhook_deliveries` com payload integral) é fechado aqui.
- Contratos vigentes: `apps/bff/PUBLIC_API_V1.md`. Usar Graphify apenas para confirmar consumidores de `Message`, `AiRun` e do DTO de conversa; não reconstruir o grafo.

### Fatos já confirmados na baseline, sem precisar redescobrir

- **A categoria vive na sessão, não na conversa.** `ConversationSession.category` é `SessionCategory` (`COMMERCIAL`, `UNCLASSIFIED`, `PERSONAL`, default `UNCLASSIFIED`), com `categorySource`, `startedAt` e `endedAt`; `Conversation` **não** tem categoria. Uma conversa longa pode ter sessões de categorias diferentes ao longo do tempo. Índice existente: `(tenantId, category, humanHandling)`.
- **As cópias de conteúdo na IA são quatro tabelas**: `Message` (`body`, `rawPayload`, índice `(tenantId, conversationId, createdAt)`), `MessageAttachment` (metadados e `transcript`, `onDelete: Cascade` a partir de `Message`), `AiRun` (`outputText`, `inputMessageIds`, índice `(tenantId, conversationId, startedAt)`) com `AiToolCall` (`arguments`, `result`) em cascade, e `ProcessedEvent` (`rawPayload`, `result`, status `RECEIVED`/`PROCESSING`/`DONE`/`FAILED`/`IGNORED`/`LEGACY`, índice `(tenantId, channelId, receivedAt)`). Os bytes de mídia já não ficam: o Goal013 purga o `base64` ao concluir o evento.
- **`AppointmentNotificationIntent`** (Scheduling) tem `facts Json?`, `detail String?`, `settledAt`, `leaseExpiresAt` e estados `PENDING`/`CLAIMED`/`SENT`/`FAILED`/`DISMISSED`/`CANCELLED` — os quatro últimos são terminais. A linha é identidade de dedupe do Goal021: apagá-la é diferente de esvaziá-la.
- **`TenantNotification`** (BFF) tem `occurredAt`, `readAt`, `resolvedAt`, `shape` `EVENT`/`CONDITION`, único por `(tenantId, dedupeKey)` e índice `(tenantId, occurredAt DESC)`. `GET /v1/notifications` aplica `HISTORY_WINDOW_DAYS = 90` (`apps/bff/src/modules/notifications/routes.ts`), enquanto `unreadCount` do resumo **não** aplica — a divergência declarada no [review022](../reviews/022-review.md).
- **`webhook_deliveries`** (Go, `apps/evolution-go/pkg/events/webhook/webhook_outbox.go`, GORM) guarda o payload integral do evento. O pacote **não tem** `time.NewTicker`, prune nem qualquer retenção: só `ResumePending(limit)`, chamado no boot.
- **O registro de negócios só existe no BFF** (`Tenant`, `apps/bff/prisma/schema.prisma`). IA e Scheduling não enumeram tenants.
- **A direção de chamada interna é BFF → donos.** O BFF tem clientes de saída para IA, Scheduling e Evolution (`apps/bff/src/clients/`); nem a IA nem o Scheduling têm cliente para o BFF, e o 022 preservou isso de propósito.
- **O padrão de lease durável já existe**: `AppointmentNotificationIntent` com `leaseToken`/`leaseExpiresAt` em `TIMESTAMPTZ` e fencing na liquidação (Goal021), e `ProcessedEvent` com o mesmo desenho (Goal004).
- **`ProductSettingsScreen`** (`apps/frontend/src/features/settings/`) tem hoje as seções Negócio, Atendente virtual, WhatsApp, Agenda, Conta e Disponibilidade. **Não existe seção Conversas.**
- Gates: `scripts/validate-core.mjs` (builds e suítes sem banco) e `scripts/validate-integration.mjs` (banco descartável, um passo `rehearse:goalNNN-…` por migration).

## Pontos de implementação

- `apps/bff/` — prazo de retenção, varredura, purga da central e contrato público; migration aditiva.
- `apps/ai-orchestrator/` — rota interna de purga de conteúdo de conversa e marca durável de expiração; migration aditiva.
- `apps/scheduling-service/` — rota interna que esvazia `facts`/`detail` de intenção terminal; migration aditiva só se um índice for necessário.
- `apps/evolution-go/` — retenção técnica do outbox de webhook, dentro do processo do transporte.
- `apps/frontend/` — seção Conversas em Configurações, confirmação da redução e marca de conteúdo expirado na conversa.
- `scripts/` — ensaio das migrations novas como passo de `validate-integration.mjs`.
- `apps/bff/PUBLIC_API_V1.md` e os documentos de §11.

## Escopo obrigatório

### 1. O prazo é configuração do BFF, com opções fechadas e redução confirmada no contrato

- `RetentionSettings` no BFF, uma linha por negócio, criada por migration aditiva: `tenantId` único, `commercialDays`, `personalDays`, `updatedAt`, `updatedBy`. **A ausência de linha vale como o default do produto** — Comercial 90, Pessoal 30 —, como o Goal021 já faz com `ReminderSettings`: nenhum boot escreve linha para todo mundo.
- **As opções são fechadas: 30, 90, 180 e 365.** A allowlist é do servidor, não do seletor: valor fora dela é recusado com `400`/`422` e não grava nada. Comercial e Pessoal podem ter prazos diferentes.
- **Reduzir exige confirmação explícita no próprio contrato.** `PATCH` que diminua o prazo efetivo de qualquer categoria sem `confirmReduction: true` é recusado com erro nomeado, dizendo qual categoria e de quanto para quanto. Aumentar não exige confirmação. A confirmação não pode viver só no diálogo da UI: o vault manda explicar e confirmar antes de perder mensagem, e um segundo consumidor da API não pode ter um caminho mais curto para apagar.
- **Reduzir não apaga na hora.** A redução passa a valer na próxima varredura; a resposta diz isso em vez de sugerir efeito imediato. Nenhuma rota pública executa purga.
- Ambas as rotas sob `requireTenantContext`; nenhuma aceita `tenantId` do chamador.

### 2. Não classificadas não recebe prazo, não aparece como opção e não é purgada

- Nenhum campo de prazo para `UNCLASSIFIED` em lugar nenhum: nem coluna, nem parâmetro, nem seletor, nem default implícito.
- Nenhuma copy pode prometer, sugerir ou insinuar exclusão desse conteúdo. A interface diz que ele é mantido enquanto a categoria não for definida, e diz que classificar passa a aplicar o prazo da categoria escolhida dali em diante.
- A regra é **U-01** e está nomeada no código, uma vez, onde a decisão de purgar é tomada — não espalhada em comentários.

### 3. A varredura é um laço batido no processo do BFF; a exclusão executa no dono

- `RetentionSweepState` no BFF, por negócio: `lastRunAt`, `lastCompletedAt`, `leaseOwner`, `leaseToken`, `leaseExpiresAt` em `TIMESTAMPTZ`, `lastError` e as contagens da última passada. Duas instâncias do BFF **não** podem varrer o mesmo negócio ao mesmo tempo: o claim é condicional e o fencing vale na liquidação, como no Goal021.
- Configuração por ambiente, com default seguro: laço ligado/desligado, intervalo do laço, negócios por passada, linhas por store por passada, intervalo mínimo entre passadas do mesmo negócio e duração do lease. **Desligado, o produto continua inteiro** — nada além da purga deixa de funcionar.
- **A passada é batida e retomável por construção.** "Apagar o que é mais velho que o cutoff" é idempotente: repetir não faz mal, parar no meio não corrompe nada, e a passada seguinte continua de onde parou. Toda passada respeita o teto de linhas por store e devolve se ainda há resto.
- **Isolamento por fonte.** Store indisponível degrada só ele: a passada registra o erro, segue com os outros e nunca derruba o processo nem faz rota pública devolver `500`. O laço não lança para fora.
- **O laço não roda em teste nem em gate por acidente**: as suítes exercitam a função de varredura diretamente, e o processo de teste sobe com ele desligado.
- Parada limpa: o desligamento do servidor não deixa passada pela metade em transação aberta nem impede o processo de sair.
- **Nenhuma rota pública, nenhuma leitura reconciliada e nenhuma tela dispara purga.** É a diferença deliberada em relação ao 022: lá o efeito era criar linha, aqui é apagar dado.

### 4. O que cada dono apaga, e o que sobrevive

**IA — rota interna nova, tenant-scoped, que recebe os cutoffs já calculados pelo BFF e um teto de linhas, e devolve contagens por tabela e se há resto:**

- `Message` mais antiga que o cutoff da **categoria que a governa** (§5) é deletada; `MessageAttachment` cai por cascade, com `transcript` junto.
- `AiRun` mais antigo que o mesmo cutoff, pela mesma conversa e mesma regra de categoria, é deletado; `AiToolCall` cai por cascade. `outputText` é cópia do que foi dito ao cliente, e `arguments`/`result` carregam dado de agendamento: expiram com a conversa.
- **Sobrevivem**: `Conversation`, `ConversationSession`, `Contact`, `Handoff`, `CustomerMemory`, `KnowledgeDocument` e tudo que é cadastro, memória autorizada ou conhecimento. A conversa continua na lista com informação mínima, que é literalmente o que o vault pede.
- `Conversation` ganha uma marca durável de expiração, nulável, que registra até quando o conteúdo daquela conversa já foi purgado. Ela **só avança**, nunca retrocede, e é o que a interface lê — a tela não infere expiração pela ausência de mensagem.

**Scheduling — rota interna nova, tenant-scoped:** intenção em estado **terminal** (`SENT`, `FAILED`, `DISMISSED`, `CANCELLED`) com `settledAt` mais antigo que o prazo técnico tem `facts` e `detail` **esvaziados**, e a linha permanece. A linha é identidade de dedupe do Goal021 e apagá-la poderia ressuscitar lembrete antigo; o que expira é o conteúdo, não a identidade. Intenção `PENDING` ou `CLAIMED` nunca é tocada, nem com lease vencido.

**BFF — purga local, sem rota:** `TenantNotification` do tipo `EVENT`, e `CONDITION` **já resolvida**, com `occurredAt` fora da janela de histórico que `GET /v1/notifications` já aplica, são deletadas. **Condição aberta nunca é apagada**, por mais antiga que seja: ela ainda descreve o agora. Depois disso, `unreadCount` e a lista passam a falar da mesma janela, o que fecha a divergência declarada no [review022](../reviews/022-review.md) sem inventar segunda janela. `NotificationPreference` e `NotificationSyncState` não são tocados.

**Go — retenção técnica do outbox, dentro do transporte:** entrega em estado terminal mais velha que o prazo técnico é removida, em lotes, sem tocar em pendente ou reagendada. Roda no boot, junto do que já existe, e periodicamente, com intervalo e prazo configuráveis por ambiente. **Sem rota nova, sem chamada cross-service e sem o BFF mandando o transporte apagar coisa**: o payload do webhook é dado do transporte, e quem o guarda é quem o expira.

### 5. A categoria que governa a mensagem

- A categoria vive na sessão; a mensagem vive na conversa. **A categoria que governa uma mensagem é a da sessão cuja janela contém o instante em que ela foi criada** — `startedAt` até `endedAt`, ou até agora se a sessão estiver aberta.
- `COMMERCIAL` ⇒ cutoff comercial. `PERSONAL` ⇒ cutoff pessoal. `UNCLASSIFIED` ⇒ **nunca purgada**.
- **Mensagem que não cai em nenhuma janela de sessão é tratada como não classificada e sobrevive.** É a única escolha segura: inventar uma categoria para conteúdo órfão apagaria dado sob presunção, que é exatamente o que U-01 proíbe.
- `AiRun` segue a mesma regra pelo seu próprio instante de início.
- Reclassificar uma sessão muda o prazo aplicável **dali em diante**; o que já foi apagado não volta. A interface não promete recuperação.

### 6. Retenção técnica, que não é escolha da profissional

Três prazos não são configuráveis pelo produto e não aparecem na interface, porque não são conteúdo de conversa e sim rastro técnico de transporte e execução: o inbox durável da IA, o `facts`/`detail` das intenções e o outbox do transporte. Eles vêm de variável de ambiente, com default declarado no diff e registrado em `DATA_MIGRATION`.

- **Inbox durável da IA:** `ProcessedEvent` com status `DONE`, `IGNORED` ou `LEGACY` e `receivedAt` mais antigo que o prazo técnico é deletado. `RECEIVED`, `PROCESSING` e `FAILED` **não** são tocados — os dois primeiros são trabalho vivo, e o terceiro é evidência de falha que ainda pode ser retomada.
- **Consequência que precisa estar declarada, não descoberta pelo reviewer:** `(tenantId, provider, eventKey)` é o dedupe de entrada. Apagar evento concluído muito antigo significa que uma reentrega do mesmo evento depois do prazo seria reprocessada. O prazo default precisa ser folgado o bastante para que isso não seja um caso real, e o motivo fica escrito junto da constante.

### 7. Contrato público do BFF

- `GET /v1/settings/retention` devolve os prazos vigentes das duas categorias, as opções permitidas, o fato de que Não classificadas não é purgada e o instante da última varredura concluída. `PATCH /v1/settings/retention` altera as duas categorias, com `confirmReduction` quando houver redução.
- O DTO de conversa ganha, aditivamente, o instante de expiração de conteúdo — nulo quando nada expirou. Nenhum campo existente muda de forma, de tipo ou de significado.
- Nenhuma rota devolve contagem de linhas apagadas para o cliente final, nem prevê "quantas mensagens serão perdidas": estimar isso exigiria varrer o dono dentro de uma requisição de leitura.
- `PUBLIC_API_V1.md` documenta as rotas novas, o campo novo, a regra de confirmação e o fato de que a exclusão é assíncrona e irreversível.

### 8. As superfícies consumidoras

- **Configurações → Conversas**, seção nova em `ProductSettingsScreen`, seguindo o padrão vigente das seções existentes — **sem redecompor a tela**, que é do 024. Dois seletores com as quatro opções, estado de carregamento e de erro no padrão do módulo.
- **Reduzir abre confirmação explícita** que diz, em português e sem jargão, que mensagens mais antigas poderão ser removidas e que a ação não tem volta. Só depois da confirmação o `PATCH` sai com `confirmReduction: true`. Cancelar não altera nada e não deixa o seletor mentindo sobre o valor salvo.
- **Não classificadas é explicada ali mesmo**, como conteúdo mantido até a categoria ser definida — sem seletor e sem promessa de exclusão.
- **Na conversa**, quando há conteúdo expirado, a timeline diz que mensagens antigas expiraram e desde quando, no lugar de simplesmente começar do meio. Conversa cujo conteúdo expirou inteiro continua listada e explica o vazio em vez de parecer erro ou falha de carregamento.
- **Nenhum poller novo, nenhum segundo provedor de estado** e nenhuma tela que dispare purga. A regressão que o Goal018/WU-10 nomeou continua valendo.

### 9. Prova

- **Domínio contra PostgreSQL real** (`validate:integration`): mensagem comercial fora do prazo apagada e dentro do prazo preservada; mensagem pessoal governada pelo seu próprio prazo; **conteúdo não classificado preservado mesmo com anos**; mensagem sem sessão correspondente preservada; conversa sobrevivendo com a marca de expiração avançando e nunca retrocedendo; `AiRun` e `AiToolCall` acompanhando a mensagem; segunda passada imediatamente depois da primeira não apagando nada; teto de linhas respeitado com resto sinalizado; intenção terminal com `facts`/`detail` esvaziados **sem** a linha desaparecer; intenção `PENDING`/`CLAIMED` intocada; condição aberta antiga preservada na central e evento antigo apagado; e **isolamento de tenant: a varredura do negócio A não apaga, não esvazia e não marca nada do negócio B** — é o caso mais caro deste Goal e precisa de teste próprio, não de menção.
- **Store indisponível**: com a IA fora, a passada registra degradação, continua no Scheduling e na central, e nenhuma rota pública quebra.
- **Transporte**: teste do prune do outbox — entrega terminal antiga removida, pendente e recente preservadas, lote respeitado.
- **Ensaio das migrations** em `scripts/`, registrado como passo de `validate-integration.mjs`, no padrão dos ensaios existentes. **As migrations deste Goal são retomáveis**: reaplicar sobre banco já migrado não falha, corrigindo a divergência que o [review022](../reviews/022-review.md) registrou. A migration do 022 **não** é reescrita aqui.
- **Interface em jsdom** (`validate:core`): seletores com as quatro opções, confirmação obrigatória ao reduzir, cancelamento sem efeito, texto de Não classificadas sem promessa de exclusão, marca de conteúdo expirado e conversa vazia explicada.
- **Gate renderizado** (`validate:ui`): largura, alvo de toque, contraste computado, foco visível e `prefers-reduced-motion` nas larguras 360/390/768/1024/1440, depois de `validate:core`. O gate cobre rota pública; Configurações é autenticada, então o que ele decide aqui é a não regressão das superfícies públicas e do chrome. **Fidelidade visual à referência aprovada continua sendo conferência humana** e não pode ser declarada como provada por teste — mesmo limite dos Goals 014–022.

### 10. Migração, compatibilidade e limites operacionais

- **Migrations aditivas**: tabelas novas que nascem vazias no BFF, coluna nulável na IA, índice no Scheduling só se a varredura precisar dele. Nenhum backfill, nenhuma coluna removida ou renomeada, nenhum `UPDATE` em linha existente.
- **A migration não apaga nada.** A primeira passada depois do deploy é que apaga, em lotes, com contagens registradas. Nenhum `DELETE` sem teto, nenhuma transação única gigante.
- **Nada apagado é recuperável.** Não há lixeira, undo, nem exportação prévia. É por isso que allowlist de prazo, confirmação de redução e isolamento de tenant são invariantes, e não detalhes de implementação.
- Sem exclusão de conta, suspensão ou restore (024). Sem exclusão self-service de dado de cliente (fora do MVP pelo vault). Sem e-mail, push ou alerta fora de sessão (U-03). Sem purga de Não classificadas (U-01).
- Nenhum segredo, telefone ou credencial em log, em resposta ou em contagem. Log de purga diz quantas linhas, de qual tabela e de qual negócio — nunca o que havia nelas.

### 11. Documentação

Ao final, atualizar **apenas** o que este diff faz mentir ou ficar incompleto: `CURRENT_STATE.md` (a retenção e onde ela executa), `GAP_ANALYSIS.md` (**G-29** fechado na parte de conteúdo e **explicitamente aberto** na parte de conta, com o 024 nomeado; **G-04** e **G-23** fechados no resíduo do outbox), `REUSE_ANALYSIS.md` (o que foi reusado em vez de recriado: o desenho de lease do Goal021, a janela de histórico do Goal022, `ResumePending` no transporte), `DATA_MIGRATION.md` (as migrations aditivas, os prazos técnicos e seus defaults) e `VALIDATION_GATE.md` (o passo de ensaio novo). **Não** tocar `MIGRATION_STATUS.md`, `MASTER_PLAN.md`, `DECISIONS.md` nem `reviews/`: fechamento e decisão são do Tech Lead.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe `RetentionSettings` no BFF, criado por migration aditiva, com tabela nascendo vazia e sem nenhum `UPDATE` em linha existente.
2. A ausência de linha vale como Comercial 90 / Pessoal 30; nenhum boot, migration ou login escreve linha para todo mundo.
3. As opções aceitas são exatamente 30, 90, 180 e 365, validadas no servidor; valor fora da lista é recusado e não grava.
4. Comercial e Pessoal podem ter prazos diferentes ao mesmo tempo.
5. `PATCH` que reduza qualquer prazo sem confirmação explícita é recusado com erro nomeado que diz a categoria e o de/para.
6. `PATCH` que aumente prazo não exige confirmação.
7. Nenhuma rota pública apaga dado; a redução só passa a valer na varredura seguinte, e a resposta diz isso.
8. `GET`/`PATCH /v1/settings/retention` estão sob `requireTenantContext` e nenhuma aceita `tenantId` do chamador.
9. Não existe prazo, parâmetro, coluna, opção ou default para `UNCLASSIFIED` em nenhuma camada.
10. Nenhuma copy da interface promete, sugere ou insinua exclusão de conteúdo não classificado.
11. U-01 está nomeada uma vez, no ponto onde a decisão de purgar é tomada.
12. Existe `RetentionSweepState` por negócio, com lease em `TIMESTAMPTZ` e fencing na liquidação; duas instâncias não varrem o mesmo negócio ao mesmo tempo.
13. O laço é ligado, desligado e ajustado por variável de ambiente, com defaults declarados no diff.
14. Com o laço desligado, todo o resto do produto continua funcionando.
15. Toda passada respeita o teto de linhas por store e sinaliza se restou trabalho.
16. Rodar a varredura duas vezes seguidas não apaga nada na segunda.
17. Interromper a varredura no meio não deixa estado inconsistente; a passada seguinte continua.
18. Store indisponível degrada só ele: a passada registra o erro, segue com os outros e não lança para fora.
19. Nenhuma rota pública devolve `500` por causa da varredura.
20. As suítes não sobem o laço; a varredura é exercitada por chamada direta.
21. O desligamento do servidor não fica preso por causa do laço.
22. Nenhuma rota pública, leitura reconciliada ou tela dispara purga.
23. Mensagem comercial mais antiga que o cutoff comercial é apagada; dentro do prazo, preservada.
24. Mensagem pessoal é governada pelo prazo pessoal, não pelo comercial.
25. Mensagem governada por sessão `UNCLASSIFIED` **não** é apagada, por mais antiga que seja.
26. Mensagem que não cai em nenhuma janela de sessão **não** é apagada.
27. `MessageAttachment`, incluindo `transcript`, desaparece com a mensagem.
28. `AiRun` e `AiToolCall` seguem a mesma regra de categoria e cutoff.
29. `Conversation`, `ConversationSession`, `Contact`, `Handoff`, `CustomerMemory` e conhecimento sobrevivem à purga.
30. A marca de expiração da conversa só avança e é o que a interface lê; a tela não infere expiração pela ausência de mensagem.
31. Intenção de lembrete terminal tem `facts` e `detail` esvaziados **sem** a linha ser deletada.
32. Intenção `PENDING` ou `CLAIMED` não é tocada, nem com lease vencido.
33. `TenantNotification` do tipo evento e condição já resolvida fora da janela é apagada; **condição aberta nunca**.
34. Depois da purga, `unreadCount` e a lista da central falam da mesma janela; nenhuma segunda janela foi inventada.
35. `NotificationPreference` e `NotificationSyncState` não são tocados.
36. Entrega terminal antiga do outbox do transporte é removida em lotes; pendente e reagendada são preservadas.
37. O prune do transporte não criou rota nova nem chamada cross-service.
38. `ProcessedEvent` `DONE`/`IGNORED`/`LEGACY` fora do prazo técnico é apagado; `RECEIVED`, `PROCESSING` e `FAILED` não são tocados.
39. A consequência do prazo técnico sobre o dedupe de entrada está escrita junto da constante, não só no relatório.
40. A varredura do negócio A não apaga, não esvazia e não marca nada do negócio B, com teste próprio.
41. O DTO de conversa ganha o campo de expiração de forma aditiva; nenhum campo existente muda de forma, tipo ou significado.
42. A seção Conversas existe em Configurações, segue o padrão das seções vigentes e **não** redecompõe `ProductSettingsScreen`.
43. Reduzir abre confirmação que diz que mensagens antigas poderão ser removidas e que não há volta; cancelar não altera nada e não deixa o seletor mentindo.
44. A conversa com conteúdo expirado diz isso e desde quando; a conversa inteiramente expirada explica o vazio sem parecer erro.
45. Nenhum poller ou provedor de estado novo entrou na árvore do frontend.
46. Nenhum log, resposta ou contagem expõe conteúdo, telefone ou credencial.
47. Existe ensaio das migrations em `scripts/`, registrado como passo de `validate-integration.mjs`, e reaplicá-las sobre banco já migrado **não falha**.
48. `validate:core` passa, com os skips preexistentes declarados.
49. `validate:integration` passa, incluindo o passo novo.
50. `validate:ui` passa nas cinco larguras, após `validate:core`.
51. `git diff --check` limpo; typecheck e lint das áreas tocadas limpos.
52. Os documentos de §11 são atualizados, e nenhum documento de fechamento é tocado.
53. Nenhuma afirmação de documentação descreve superfície que o diff não entrega.

## Entrega

Relatório do Developer com: diff por área, resultado real dos gates (não "deveria passar"), a lista de arquivos tocados fora dos pontos de implementação com justificativa, a regra de categoria governante transcrita, os prazos técnicos com seus defaults e o motivo de cada um, as contagens observadas no ensaio de purga, e o que ficou declaradamente fora — em especial a exclusão de conta e a purga de Não classificadas. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff e os testes reais.
