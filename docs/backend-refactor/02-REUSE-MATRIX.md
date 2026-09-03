---
title: Matriz de reaproveitamento
status: vigente
fase: 0
---

# 02 — Matriz de reaproveitamento

Decisão por componente. **KEEP** não é escolhido para minimizar diff: cada KEEP abaixo tem uma razão de domínio.

Critério aplicado (conforme §12 do escopo): regras de domínio, acoplamento, ownership, persistência, testes, contratos, concorrência, idempotência, segurança, observabilidade e capacidade de atender o product vault — não estrutura de pastas.

---

## Infraestrutura e topologia

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| Separação em BFF / scheduling / ai-orchestrator / evolution-go | funcional | **KEEP** | Os boundaries estão certos e as premissas de produto não os invalidam: identidade+superfície pública, domínio operacional, conversa/IA/canal, transporte WhatsApp. O ownership de dados é limpo (conversas só no AIO, agenda só no SCH). Nenhum gap do vault é causado por fronteira errada |
| BFF como única API pública | funcional | **KEEP** | Já cumpre o papel, resolve tenant a partir da sessão e nunca confia em `tenantId` do browser. Criar um segundo gateway não resolveria nenhuma regra do vault |
| Um banco por serviço | funcional | **KEEP** | Ownership já corresponde às fronteiras. Não há join cross-service necessário; a correlação por `tenantId` + telefone normalizado é suficiente |
| Auth interna por token estático compartilhado | funcional, frágil | **ADAPT** | Funciona e é adequado à escala, mas: o AIO compara token com `===` (timing attack) enquanto o SCH usa `timingSafeEqual`; e o AIO **infere tenant** quando o header falta. Corrigir, não substituir |
| `apps/health-worker` | funcional, subutilizado | **ADAPT** | 164 linhas, sem deps, já roda um loop de 40 s e já conhece as URLs de todos os serviços. É o único processo periódico confiável que existe. Vira o *tick driver* das automações em vez de ganhar um serviço novo (ver `DECISIONS.md`) |
| `render.yaml` | com defeitos | **ADAPT** | Falta `PASSWORD_RESET_DELIVERY_URL` (reset de senha retorna 500 em produção), falta `DATABASE_SAVE_MESSAGES` do evolution-go, e há hostname legado com typo (`atendimeto-ia`) |
| `docker-compose` local | insuficiente | **ADAPT** | Sobe 4 de 7 componentes, não sobe BFF nem scheduling, e colide na porta 5434. Impede desenvolvimento e teste E2E local — pré-requisito da estratégia de testes |
| Kafka / RabbitMQ / Redis / novo broker | não existe | **NÃO INTRODUZIR** | Nenhuma regra do MVP exige throughput, fan-out ou entrega garantida além do que Postgres + advisory lock resolvem. Ver `DECISIONS.md` D-02 |
| Novo microserviço | — | **NÃO INTRODUZIR** | As lacunas são de modelagem e de execução temporal, não de fronteira |

---

## `packages/contracts`

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| Primitivos `common/` (id, isoDateTime, money, pagination, phone, requestId, timezone, errorResponse) | corretos, **órfãos** | **KEEP** | ~90 linhas de zod corretas. Estão reimplementados inline no BFF em pelo menos 3 lugares |
| Namespaces de domínio (12 stubs `export {}`) | vazios | **CREATE** | Não há contrato legado a desmontar. Este é o lugar certo para os enums de domínio, hoje duplicados entre schemas Prisma e schemas zod inline |
| Consumo pelos apps | **não existe** | **ADAPT** | Nenhum app importa o pacote, mas ele está em todos os `buildFilter.paths` — muda e redeploya tudo, sem benefício. Ligar via `file:` (padrão já usado por `@atendly-ia/legal-contract`), sem introduzir npm workspaces |
| Enum `AiTone` duplicado em 2 schemas Prisma | duplicado | **MOVE** | Fonte única em contracts, derivada nos schemas |

---

## Scheduling service

### Manter

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| Motor de slots (`availability/atendly-availability.ts`) | correto | **KEEP** + estender | O algoritmo (regras semanais → merge de disponibilidade extra → subtração de bloqueios → subtração de time blocks e agendamentos) já é o modelo do vault. Precisa passar a subtrair **holds** e a aplicar **buffers** e **antecedência**, mas a estrutura está certa |
| Advisory lock + transação Serializable + revalidação dentro da transação | correto | **KEEP** | É a garantia de que dois clientes não confirmam o mesmo horário. Raro de acertar; está certo. Estender ao cancelamento e ao time block, que hoje não têm |
| `CalendarMutationIdempotency` + `Idempotency-Key` obrigatória | correto, com bug | **KEEP** + **ADAPT** | O desenho (claim por INSERT, replay de resposta, detecção de reuso com payload diferente) é correto. O bug: marcação `COMPLETED` fora da transação do efeito → replay real após 5 min; e `catch {}` sem discriminar erro |
| Snapshot comercial em `AppointmentItem` | correto | **KEEP** | Implementa exatamente "alterações no catálogo não reescrevem agendamentos já combinados" |
| `shared/date-time/calendar-date-time.ts` | correto | **KEEP** | Conversão wall-clock ↔ instante por ponto fixo com verificação de round-trip, rejeitando horários inexistentes de DST. É trabalho difícil já feito corretamente |
| Auth interna (`shared/auth/internal-auth.ts`) | correto | **KEEP** | `timingSafeEqual` + contexto obrigatório validado por zod. É a referência a replicar no AIO |
| `internal-api` como superfície | funcional | **ADAPT** | Forma correta; precisa dos endpoints que faltam (exceções de agenda, update/delete de cliente, holds, ciclo de vida do atendimento, importação) |

### Adaptar

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| `Appointment.status` como `String` livre | incorreto | **ADAPT** | Dois valores mágicos sem enum, sem CHECK. O vault exige 4 estados + confirmação de presença separada |
| Remarcação (`update` in place) | incorreto | **ADAPT** | Perde o horário anterior permanentemente. O vault exige preservar até a nova confirmação e registrar no histórico |
| `Customer` (unique por telefone, `phone` NOT NULL, `create()` = upsert) | **incorreto e corruptor** | **ADAPT** | Torna impossíveis duas regras explícitas do vault e **sobrescreve silenciosamente o nome de um cliente existente**. Precisa de migration e de separar `create` de `findOrCreate` |
| `Service` (sem buffer, sem recorrência, sem tri-state, 2 tipos de preço) | incompleto | **ADAPT** | Estrutura certa, campos faltando |
| `TimeBlock` (sem recorrência, sem tipo) | incompleto | **ADAPT** | — |
| `AvailabilityException` | modelo certo, **sem escrita** | **ADAPT** | A tabela existe e é lida corretamente pelo motor de slots; falta apenas o CRUD. Correção barata com impacto alto |
| Colunas `TIMESTAMP(3)` sem timezone | frágil | **ADAPT** | Instantes UTC em coluna naive funcionam via driver, mas quebram em query crua, BI ou `CURRENT_TIMESTAMP`. Migrar para `TIMESTAMPTZ` |
| Ausência de exclusion constraint de overlap | risco | **ADAPT** | A garantia hoje é 100% aplicacional. Um caminho novo que esqueça `assertAvailable` produz overlap silencioso. Adicionar `EXCLUDE USING gist` como rede de segurança estrutural |
| `calendar-migration-service.ts` (910 linhas) | parcialmente correto | **ADAPT** | Os 12 detectores de conflito e o snapshot são reaproveitáveis. Precisam mudar: conflito não pode abortar tudo, precisa de resolução, de conclusão explícita e de execução em lotes em vez de uma transação de 10 anos |

### Remover / simplificar

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| `CalendarProvider` (interface) + `provider-factory.ts` + `calendar-service.ts` (resolução por request) | premissa substituída | **REMOVE** | A única razão de existir era a escolha de fonte ativa de agenda, que o produto removeu. Manter obrigaria a implementar holds, status, buffers e recorrência atrás de uma indireção que nunca terá um segundo provider |
| `CalendarSource`, `CalendarSettings.source`, `capabilities`, `managedExternally`, `requireAtendlyCalendar()`, `CALENDAR_SOURCE_MISMATCH`, `CALENDAR_MIGRATION_REQUIRED` | premissa substituída | **REMOVE** | ~8 pontos de guard espalhados que existem só para responder "qual agenda está ativa?" — pergunta que deixa de existir |
| `MinhaAgendaCalendarProvider` (runtime, com escrita) | premissa substituída | **SIMPLIFY → REPLACE** | Vira `MinhaAgendaImportClient`: **somente leitura**, consumido **apenas** pelo serviço de importação. Remover `enableWrites`, `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `assertSlotAvailable` externos |
| `integrations/minha-agenda/availability.ts` (motor de slots paralelo) | duplicado e incorreto | **REMOVE** | Segundo motor de disponibilidade que opera em minutos locais **sem timezone algum**. Não é necessário para importação |
| `integrations/minha-agenda/date-time.ts` | duplicado | **REMOVE** | Cópia divergente de helpers que já existem em `shared/date-time` |
| `IntegrationConnection.status`/`lastSuccessfulSyncAt`/`lastErrorAt` como estado operacional | premissa substituída | **SIMPLIFY** | Credenciais continuam necessárias durante a importação; "estado de sincronização" não. Após `Concluir importação`, as credenciais deixam de ser usadas |
| `integrations/atendly/provider.ts` | correto, mal posicionado | **MOVE** | O código de agendamento é bom, mas está dentro da pasta `integrations/` como se fosse um adaptador entre pares. Passa a ser o domínio (`modules/appointments/`), que hoje é uma pasta com `export {}` |
| `modules/appointments/`, `modules/time-blocks/`, `modules/migrations/index.ts` vazios | placeholders | **ADAPT** | A árvore promete camadas que não existem; a lógica está toda em `internal-api/routes.ts` e `integrations/atendly/` |
| Ausência total de testes | risco máximo | **CREATE** | Serviço mais complexo do backend, dono do dinheiro e da agenda, com criptografia de credenciais, **sem sequer o script `test`**. É pré-requisito de qualquer mudança nele |

---

## AI Orchestrator

### Manter

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| LangGraph + `@langchain/langgraph-checkpoint-postgres` | adequado | **KEEP** | O grafo de 14 nós com loop ReAct expressa bem o fluxo do vault. Não substituir por preferência |
| LangChain + `ModelProvider` como abstração | adequado | **KEEP** | Injetável por construtor, permite testar sem LLM real. `continuation` vaza a `AIMessage`, mas isso não custa nada hoje |
| Padrão `prepare` / `confirm` nas tools de agenda | correto | **KEEP** + reforçar | Materializa "consolidar antes de persistir". `confirmSchedule` re-resolve os serviços contra o SCH — bom |
| Idempotência de tool call (`${aiRunId}:${callId}:${name}`) propagada como header ao SCH | correto | **KEEP** | Fecha o ciclo com a idempotência do scheduling |
| `ProcessedEvent` / `IdempotencyStore` | correto | **KEEP** + **ADAPT** | Desenho certo. Falta retenção e não gravar `rawPayload` cru com `instanceToken` |
| Guardrails contra inventar preço/serviço/disponibilidade | **forte** | **KEEP** | Prompt + revalidação de `serviceId` contra o SCH + preço/duração sempre da fonte. É o guardrail mais bem construído do sistema |
| Proibição de persona própria | **forte** | **KEEP** | Explícita no prompt e coberta por teste. As tabelas de persona já foram dropadas |
| Filtro de grupos em 3 camadas | correto | **KEEP** | — |
| Isolamento multi-tenant (tenantId em todas as queries, uniques compostos, validação de canal) | correto | **KEEP** | — |
| Ownership de `Conversation`/`Message` no AIO, BFF proxiando | correto | **KEEP** | Não há duplicação de conversas. Este é o acerto arquitetural mais importante do repositório |
| Redaction de logs | correto | **KEEP** | — |

### RAG

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| pgvector + `KnowledgeDocument`/`KnowledgeChunk` + embeddings 1536 | saudável | **KEEP** | Modelagem correta, filtro duplo por tenant, `status ACTIVE` respeitado |
| **Separação RAG × dado determinístico** | **forte** | **KEEP** | Barreira tripla: guard de código `isOperationalKnowledgeQuery`, descrição da tool e prompt. Exatamente o que o §5 do escopo exige. **Só conhecimento textual é indexado** — nenhum código indexa serviço, preço, duração ou disponibilidade |
| Defesa anti prompt-injection nos chunks | correto | **KEEP** | — |
| Nó `retrieveKnowledge` chamando `search()` sem o guard | vazamento residual | **ADAPT** | Na prática não colide (o roteador manda consulta operacional para `operational`), mas o guard determinístico deve valer para os dois caminhos |
| Ausência de índice ANN (`ivfflat`/`hnsw`) | performance | **ADAPT** | Busca vetorial faz sequential scan. Barato de corrigir |
| Ingestão só por script CLI, sem chunking automático | incompleto | **CREATE** | O vault exige FAQ e conhecimento do negócio editáveis pelo usuário — precisa de rota HTTP e de chunking |

### Adaptar

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| `handleOwnerActivity` (não pausa a IA) | **contraria o produto** | **ADAPT** | Regra não-negociável do `AGENTS.md`. Os testes atualmente **asseguram o comportamento errado** — precisam ser invertidos junto |
| `upsertActiveConversation` resetando `humanHandoff:false` | **contraria o produto** | **ADAPT** | Derruba a pausa a cada mensagem do cliente |
| Estado de handoff em 4 representações (`status`, `humanHandoff`, `state.aiConversation.stage`, tabela `Handoff`) | redundante | **SIMPLIFY** | Podem divergir. Consolidar numa máquina de estados explícita que cubra os estados do vault |
| Debounce em `Map` de instância, com processador recriado por webhook | **inoperante** | **ADAPT** | O agrupamento de mensagens fragmentadas não funciona em produção. Hoistar o processador para escopo de aplicação e passar contexto de tenant por chamada |
| Valores de debounce (8–60 s) | errados | **ADAPT** | Vault pede ~2–3 s para fragmentação e 2–5 min para mensagem ambígua — dois mecanismos distintos, hoje colapsados em um |
| Atalho pré-modelo respondendo `"Oi"` imediatamente | **contraria o produto** | **ADAPT** | Vault exige esperar. Comportamento oposto |
| `validateToolResult` calculando `toolResultsValid` sem usar | guardrail incompleto | **ADAPT** | "Nunca confirmar antes de persistir" é hoje 100% prompt. Transformar em mecanismo |
| Mensagem de erro automática ao cliente no nó `handoff` | contraria o produto | **ADAPT** | Vault: em instabilidade, não enviar mensagem automática ao cliente |
| Mídia (áudio/imagem/documento) rejeitada com resposta canned, sem handoff e **sem persistir** | incompleto | **ADAPT** | Vault: áudio compreendido, imagem gera handoff, documento visível sem interpretação. Nenhum dos três está certo |
| Webhook: HTTP 202 antes de processar, `void` fire-and-forget | perda de dados | **ADAPT** | Crash pós-ACK perde a mensagem e o retry do Evolution não recupera |
| Webhook: token em query string, sem HMAC, comparação não timing-safe; `instanceToken` do payload usado como credencial de envio | **segurança** | **ADAPT** | Payload forjado que passe o token controla o `apikey` do outbound |
| Outbound sem retry/timeout/backoff | fragilidade | **ADAPT** | Um 5xx do Evolution perde a resposta ao cliente após a idempotência já ter sido consumida |
| `Conversation.state` inteiro serializado no system prompt | custo crescente | **ADAPT** | Inclui até 20 decision logs e 5 availability lookups, sem limite |
| `findService` fazendo GET do catálogo inteiro por serviço | ineficiente | **ADAPT** | N chamadas redundantes num agendamento multi-serviço |
| Comparação de token com `===` | segurança | **ADAPT** | Usar `timingSafeEqual` como o SCH já faz |
| Fallback de inferência de tenant quando header ausente | segurança | **REMOVE** | Único ponto onde tenant não é explícito |

### Remover

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| 6 diretórios vazios (`automation`, `business-settings`, `legal`, `minha-agenda`, `openai`, `virtual-attendant`) | ruído | **REMOVE** | A árvore promete uma arquitetura que não existe e induz o próximo leitor ao erro |
| `intent: "handoff"` que nunca roteia para o nó `handoff` | lógica órfã | **REMOVE** ou **ADAPT** | — |
| `isUnsupportedMessagePause` detectando razão que nenhum código gera | lógica órfã | **REMOVE** | — |
| Action `unsupported_handoff` declarada e nunca produzida | lógica órfã | **ADAPT** | Deve passar a ser produzida (imagem → handoff) |
| `prompts/response.ts:5-6` mandando "respeitar a persona configurada na Atendente Virtual" | aponta para o vazio | **REMOVE** | Contradiz a proibição de persona que o próprio serviço aplica |
| `HUMAN_HANDOFF_PAUSE_MINUTES` (env declarada, nunca lida) | morta | **REMOVE** ou **ADAPT** | — |
| Chave `"minha_agenda_password"` em `lib/redact.ts` e nomenclatura Minha Agenda nos testes | resíduo | **REMOVE** | O AIO não fala mais com Minha Agenda |
| `AiTone` de 2 valores | premissa substituída | **REPLACE** | Por `AiStyle {PROFESSIONAL, BALANCED, CASUAL}`, default `BALANCED` |

---

## BFF

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| `auth` (JWT, cookie httpOnly, reset com token hasheado, aceite legal) | funcional | **KEEP** + **ADAPT** | Falta revogação de sessão e invalidação ao trocar senha. E o delivery de reset **não está configurado em produção** |
| Resolução de tenant a partir do JWT, nunca do browser | correto | **KEEP** | Decisão de segurança correta |
| `InternalHttpClient` (timeout, retry de GET, validação zod, normalização de erro) | correto | **KEEP** | — |
| Módulos como fachada fina sobre os serviços | correto | **KEEP** | O BFF não deve ganhar domínio |
| `dashboard` com degradação parcial por dependência | correto | **KEEP** | Boa propriedade para o vault ("não induzir o usuário a achar que funciona") |
| Ausência de camada service/repository | aceitável | **KEEP** | Para fachadas de ~100 linhas por módulo, a camada extra não pagaria |
| `AiSettings` + push manual para o AIO, sem reconciliação | duplicação | **SIMPLIFY** | Config de tenant vive em dois bancos e diverge em silêncio se o POST falhar |
| `BusinessProfile.timezone` não propagado ao SCH no `PATCH /settings/business` | **bug** | **ADAPT** | Timezone existe em 3 lugares e a rota principal só atualiza um |
| Tradução `ATENDLY|MINHA_AGENDA → ATENDLY|EXTERNAL` duplicada em 7 arquivos | premissa substituída | **REMOVE** | Some junto com a abstração de provider |
| `GET /v1/calendar`, `POST /v1/calendar/integration/{connect,reconnect}`, `DELETE /v1/calendar/integration` | premissa substituída | **REMOVE** | Contrato público de conexão operacional de agenda externa |
| `POST /v1/calendar/migrations` aceitando `target: EXTERNAL` | premissa substituída | **REMOVE** | Migração reversa exposta publicamente, que o próprio SCH recusa |
| Rotas de importação sob `/v1/calendar/migrations` | nomenclatura errada | **MOVE** | Importação não é um modo do calendário; vira `/v1/import` |
| `WhatsAppInstance.userId @unique` | inconsistente | **ADAPT** | Todo o resto do sistema é tenant-scoped |
| `evolutionInstanceToken` em texto claro, enviado no **body** ao AIO | segurança | **ADAPT** | O AIO pode resolver o token pelo `ChannelConnection`, sem trafegar segredo |
| `DELETE /v1/whatsapp` com `.catch(() => null)` e sem desativar o `ChannelConnection` | inconsistência | **ADAPT** | Deixa instância órfã no Evolution e canal ativo no AIO |
| `POST /v1/customers` exigindo `phone` | contraria o produto | **ADAPT** | — |
| `priceType` com 2 valores | contraria o produto | **ADAPT** | — |
| `tone` com 2 valores e gate de onboarding sobre eles | contraria o produto | **REPLACE** | — |
| Teste único, desligado, com rota errada | risco | **ADAPT** | — |

---

## evolution-go

| Componente | Estado | Decisão | Motivo |
| --- | --- | --- | --- |
| Fork vendorizado (Evolution Go 0.7.1 + whatsmeow) | funcional | **KEEP** | Transporte funcionando, com guardrail próprio de não receber lógica de negócio. Substituí-lo não resolve nenhuma regra do vault |
| Superfície consumida (7 endpoints de instância + `/send/text`) | mínima | **KEEP** | Acoplamento baixo e saudável |
| Filtro de grupos e `ignoreGroups` | correto | **KEEP** | — |
| Eventos `CONNECTION` e `QRCODE` assinados e **rejeitados com 400** pelo mapper | desperdício | **ADAPT** | Consumi-los elimina o polling de status e viabiliza alerta de desconexão |
| `webhook`/`webhookEvents` ignorados no `/instance/create` | código morto | **ADAPT** | Funciona por acidente porque o `/connect` sempre vem depois |
| Envio de mídia, download de mídia, websocket | não consumidos | **ADAPT** (parcial) | Áudio exige download de mídia para transcrição — capacidade nova a habilitar, não a criar |
| Instância oficial da Atendly para o teste de ativação | **não existe** | **CREATE** | Requisito de infraestrutura: um número WhatsApp da plataforma |
| Alterar o fork | — | **NÃO FAZER** sem necessidade | A regra local do próprio app é que ele não recebe lógica de negócio |

---

## Percentual de reaproveitamento

Estimativa por faixa, ponderando código aproveitável **e** modelagem aproveitável. Não é medida de linhas.

| Área | Reaproveitamento | Justificativa |
| --- | --- | --- |
| **Scheduling** | **50–65 %** | Alto no núcleo difícil (motor de slots, concorrência, idempotência, snapshot, timezone) e baixo no modelo de dados, que precisa de holds, ciclo de vida, recorrência, buffers, exceções e um `Customer` reconstruído. A remoção da abstração de provider retira ~20 % do código atual do serviço |
| **AI Orchestrator** | **60–75 %** | Grafo, tools, checkpointer, idempotência e guardrails anti-alucinação são reaproveitáveis quase integralmente. O que muda é comportamental (pausa por takeover, debounce, sessão de 24h, mídia, categorias) e não estrutural |
| **RAG** | **80–90 %** | O mais saudável do repositório. A separação entre conhecimento textual e dado determinístico já é exatamente a exigida. Falta índice ANN, rota de ingestão e chunking |
| **BFF** | **55–70 %** | Auth, tenant, cliente HTTP interno, dashboard e o padrão de fachada permanecem. Cai a superfície de calendar/integration/migrations e os enums de 2 valores. Como é fachada fina, adaptar é barato |
| **WhatsApp / evolution-go** | **75–85 %** para o gateway; **45–60 %** para o caminho de integração | O fork é reaproveitável quase inteiro. O caminho Atendly precisa de correções de segurança (HMAC, token em header, não confiar no `instanceToken` do payload), de durabilidade (persistir antes do ACK) e de consumo dos eventos de conexão |
| **contracts** | **~10 % de código, 100 % do lugar** | Só `common/` tem conteúdo. Mas não há contrato legado a desmontar — o pacote está vazio e corretamente estruturado |
| **Testes** | **~15 %** | 7 arquivos no backend inteiro, um deles desligado, e o serviço mais crítico com zero. Praticamente tudo a construir |
| **Automações / jobs** | **0 %** | Não existe infraestrutura alguma. Capacidade inteiramente nova |

**Leitura global: aproximadamente 55–70 % do backend é reaproveitável.** O que precisa desaparecer é pequeno e bem delimitado (a abstração de fonte de agenda e o que a acompanha). O que precisa nascer é grande, mas é adição em cima de fundação correta — não reescrita.
