---
title: Matriz regra de produto × backend
status: vigente
fase: 0
---

# 01 — Matriz de regras de produto × backend

Cobre as regras do `docs/product-vault/` que exigem comportamento de backend. Regras puramente de UI/copy ficam fora.

Legenda de owner: **BFF** · **SCH** (scheduling-service) · **AIO** (ai-orchestrator) · **EVO** (evolution-go) · **—** (nenhum).

Legenda de ação: **KEEP** (funciona, mantém) · **ADAPT** (existe, precisa mudar) · **CREATE** (não existe) · **REMOVE** (existe e não deve existir) · **MOVE** (existe no lugar errado).

---

## Agenda e agendamentos

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Agenda Atendly é a única agenda operacional | SCH | `CalendarSettings.source` com 2 valores e switch de provider a cada request (`calendar/provider-factory.ts:17-48`) | Existe agenda externa como fonte de verdade em runtime, com escrita | SCH | **REMOVE** a abstração de provider |
| Serviço com nome e duração válida | SCH | `Service.name` + `durationMinutes`, validados | — | SCH | KEEP |
| Preço FIXED | SCH | `PriceType.FIXED` + `price Decimal` | — | SCH | KEEP |
| Preço STARTING_AT ("a partir de") | — | **não existe** | Tipo ausente no enum | SCH | **CREATE** |
| Preço ON_REQUEST ("sob consulta") | SCH | `PriceType.ON_REQUEST` | — | SCH | KEEP |
| Preço UNKNOWN ("não informado") | — | **não existe** | Não há como registrar "ainda não preenchi"; importação sem preço não tem estado próprio | SCH | **CREATE** |
| Serviço sem duração é pendência e não pode ser agendado pela IA | SCH | `active: Boolean` binário | Não há tri-state / "precisa de revisão"; `durationMinutes` é NOT NULL, então o serviço importado sem duração nem entra | SCH | **ADAPT** (status do serviço + duração nullable) |
| Buffer de preparação antes/depois do serviço | SCH (só externo) | `bufferBetweenServicesMinutes` só no provider Minha Agenda | Agenda Atendly soma durações puras (`integrations/atendly/provider.ts:112-115`) | SCH | **CREATE** |
| Multi-serviço no mesmo agendamento; duração é a soma | SCH | `AppointmentItem[]`, 1..10 itens, duração somada | — | SCH | KEEP |
| Buffers intermediários não somam entre serviços | — | não existe (buffers não existem) | — | SCH | **CREATE** junto com buffers |
| Snapshot de preço e duração no agendamento | SCH | `serviceNameSnapshot`, `durationMinutesSnapshot`, `priceTypeSnapshot`, `priceSnapshot` | — | SCH | **KEEP** (implementação correta) |
| Disponibilidade semanal, horários diferentes por dia | SCH | `AvailabilityRule` por `dayOfWeek`, múltiplas faixas | Sem unique — duplicatas possíveis no banco | SCH | KEEP + **ADAPT** (constraint) |
| Bloqueio de horário pontual | SCH | `TimeBlock` + endpoints | — | SCH | KEEP |
| Bloqueio recorrente | — | **não existe** | `TimeBlock` não tem recorrência; hoje exigiria N registros manuais | SCH | **CREATE** |
| Disponibilidade extra em data normalmente indisponível | SCH (parcial) | `AvailabilityException.available=true` é **lida** pelo motor de slots | **Nunca escrita** — não existe endpoint. Regra é inalcançável | SCH | **CREATE** (CRUD de exceção) |
| Bloqueio por data específica | SCH (parcial) | idem acima (`available=false`) | idem | SCH | **CREATE** |
| Compromisso pessoal ocupa a agenda | SCH (parcial) | `TimeBlock.reason` texto livre | Sem tipo/título; não distingue bloqueio de compromisso pessoal | SCH | **ADAPT** |
| Antecedência mínima para agendar | — | **não existe** | Único filtro é `startAt <= now` | SCH | **CREATE** |
| Antecedência máxima | — | **não existe** | Só o teto de janela da query (60 dias) | SCH | **CREATE** |
| Granularidade de horários configurável por negócio | — | `stepMinutes` vem no request do chamador | Configuração é do negócio, não do chamador | SCH | **ADAPT** |
| **Hold de 5 minutos** ao apresentar horário | — | **não existe** — grep `hold\|reservation`: zero | Não há estado entre "IA propôs" e "agendamento firme". Sem hold, dois clientes confirmam o mesmo horário | SCH | **CREATE** |
| Hold aparece como "Em confirmação" na agenda | — | **não existe** | Só `SCHEDULED` e `CANCELLED` | SCH | **CREATE** |
| Hold expirado → reconsultar antes de confirmar | AIO (parcial) | `confirmSchedule` re-resolve serviços e o scheduling revalida o slot na transação | O efeito prático já é seguro, mas por ausência de hold, não por expiração dele | SCH + AIO | **CREATE** |
| Hold em múltiplos horários (recorrência) | — | **não existe** | — | SCH | **CREATE** |
| IA nunca cria encaixe fora da disponibilidade | SCH | `assertAvailable` obrigatório em todo caminho de criação | Correto por construção | SCH | KEEP |
| Profissional pode forçar sobreposição com alerta | — | **não existe** | Não há `force`/`allowOverlap`; overlap é impossível para todos | SCH + BFF | **CREATE** |
| IA e humano seguem regras diferentes | — | mesmo endpoint e mesmo código; `source` é rótulo **nunca lido para decisão** | Não há separação de política | SCH | **CREATE** (política por origem) |
| Confirmação explícita antes de persistir | AIO | padrão `prepare`/`confirm` nas tools + `pendingAction` em `Conversation.state` | Só prompt impede o modelo de dizer "confirmado" antes; `toolResultsValid` é calculado e **nunca usado** | AIO | **ADAPT** |
| Cancelamento preserva histórico | SCH | update de `status` para `CANCELLED`, sem delete | Não registra quem/quando; motivo é concatenado em `comments` livre; sem transação nem lock | SCH | **ADAPT** |
| Remarcação preserva o horário anterior até confirmar o novo | SCH (incorreto) | `update` in place de `startAt`/`endAt` | **O horário anterior é perdido permanentemente**; sem hold no novo, não há o "preserva até confirmar" | SCH | **ADAPT** + depende de hold |
| Alterações ficam no histórico operacional | — | **não existe** | Sem tabela de eventos, sem `updatedBy` | SCH | **CREATE** |
| Auto-complete 30 min após o término | — | **não existe** | Nem o status `COMPLETED`, nem job | SCH + jobs | **CREATE** |
| Marcar `Não compareceu` manualmente, com observação | — | **não existe** — zero ocorrências de `NO_SHOW` | — | SCH | **CREATE** |
| Confirmação de presença separada do status | — | **não existe** | — | SCH | **CREATE** |
| Valor final cobrado, opcional | — | **não existe** campo persistido | `totalPrice` é calculado em runtime a partir dos snapshots | SCH | **CREATE** |
| Recorrência configurada no serviço (frequência) | — | **não existe** em nenhuma entidade | — | SCH | **CREATE** |
| Múltiplos agendamentos recorrentes criados juntos após confirmação global | — | **não existe** | — | SCH + AIO | **CREATE** |
| Proteção contra duplicatas | SCH | `CalendarMutationIdempotency` + `Idempotency-Key` obrigatória nas 3 mutações | Marcação `COMPLETED` fora da transação do efeito → replay real após 5 min | SCH | KEEP + **ADAPT** |
| Catálogo alterado não reescreve agendamento existente | SCH | garantido pelos snapshots | — | SCH | KEEP |

---

## Clientes e memória

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Cliente com nome e telefone | SCH | `Customer.name?`, `phone` NOT NULL | Nome é opcional (ok), telefone é obrigatório (não ok) | SCH | ADAPT |
| **Cliente sem telefone** (criação manual) | — | **impossível** — `phone` NOT NULL | Regra explícita do vault violada pelo schema | SCH | **ADAPT** (migration) |
| **Telefones compartilhados entre clientes** | — | **impossível** — `@@unique([tenantId, normalizedPhone])`. Pior: `create()` é upsert por telefone e **sobrescreve o nome do cliente existente** | Caso central do vault (mãe agenda para filho) é impossível e corrompe dados | SCH | **ADAPT** (remover unique, remover upsert-por-telefone) |
| Relações entre clientes (responsável principal) | — | **não existe** | — | SCH | **CREATE** |
| Observações internas livres | — | **não existe** no cliente (só `Appointment.comments`) | — | SCH | **CREATE** |
| Observação só usada pela IA com autorização explícita | — | **não existe** | — | SCH | **CREATE** |
| Tags manuais | — | **não existe** | — | SCH | **CREATE** |
| Tag só considerada pela IA quando autorizada | — | **não existe** | — | SCH | **CREATE** |
| Preferências com origem distinguível (informada / inferida / cadastrada) | — | **não existe** | — | SCH | **CREATE** |
| Preferência inferida perde relevância com o tempo | — | **não existe** | — | SCH + AIO | **CREATE** |
| Histórico de atendimentos e próximos agendamentos | SCH | consulta por `customerId` / `customerPhone` | Falta agregação de perfil | SCH | ADAPT |
| Métricas do cliente (total, último, frequência, faltas, cancelamentos, valor real) | — | **não existe** | Depende de status e valor final | SCH | **CREATE** |
| Resumo do cliente gerado por IA | — | **não existe** | — | AIO (gera) + SCH (armazena) | **CREATE** |
| Não criar cliente só porque perguntou preço | AIO | cliente só é criado no `confirm` do agendamento | Correto — mas o `createAppointment` do SCH cria o cliente **antes** do `assertAvailable` e fora da transação, deixando órfãos | SCH | **ADAPT** |
| Update / delete de cliente | — | **não existe** endpoint | — | SCH | **CREATE** |

---

## Conversas e inbox

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Conversa é dona do AIO, BFF só proxia | AIO | `Conversation`/`Message` só no AIO; BFF proxia por HTTP | — | AIO | **KEEP** (ownership correto) |
| Categorias Comercial / Não classificadas / Pessoal | — | **não existe** — só `status: ACTIVE\|HUMAN_HANDOFF\|CLOSED` | Aba inteira da inbox não tem backend | AIO | **CREATE** |
| Contato ≠ conversa (perfil predominante vs classificação atual) | — | **não existe** — não há entidade `Contact` | — | AIO | **CREATE** |
| Classificação manual prevalece sobre a automática | — | **não existe** | — | AIO | **CREATE** |
| Estado "IA atendendo" | AIO (derivável) | `status=ACTIVE` + `humanHandoff=false` | Estado não é explícito; derivação fica no cliente | AIO | ADAPT |
| Estado "Aguardando você" | AIO (parcial) | `humanHandoff=true` sem mensagem do dono | Não distinguido de "Você atendendo" | AIO | **ADAPT** |
| Estado "Você atendendo" | — | **não existe** como estado distinto | — | AIO | **CREATE** |
| Tempo de espera e prioridade na aba Comercial | — | **não existe** | `unreadCount` é hardcoded `0` | AIO | **CREATE** |
| **Ignorar IA por contato** | — | **NÃO EXISTE em nenhum app** — grep retorna só documentação. A implementação anterior foi dropada em `20260831220000_goal17_legacy_cleanup` | Regra não-negociável do `AGENTS.md` sem nenhuma implementação | AIO | **CREATE** |
| Conteúdo de contato ignorado não é usado pela IA (nem histórico) | — | **não existe** | — | AIO | **CREATE** |
| Sessão conversacional de ~24h | — | **não existe** | `thread_id` = `conversationId` para sempre; sem TTL de checkpoint | AIO | **CREATE** |
| Debounce de mensagens fragmentadas (~2–3 s) | AIO (quebrado) | buffer com 8–60 s, em `Map` de instância — mas **o processador é recriado a cada webhook**, então o agrupamento **não funciona em produção** | Valores errados e mecanismo inoperante | AIO | **ADAPT** |
| Mensagem ambígua: esperar ~2 min, até ~5 min | — | **não existe** — `"Oi"` recebe resposta **imediata** por atalho pré-modelo | Comportamento oposto ao especificado | AIO + jobs | **CREATE** |
| **Mensagem manual do profissional pausa a IA** | — | **NÃO IMPLEMENTADO** — `handleOwnerActivity` só registra; os testes asseguram que `pauseForHuman` **não** é chamado | Regra central do produto ausente; agravada por `upsertActiveConversation` resetar `humanHandoff:false` a cada mensagem do cliente | AIO | **ADAPT** |
| Visualizar conversa não assume atendimento | AIO | não há efeito colateral em leitura | — | AIO | KEEP |
| `Retomar IA` explícito na sessão atual | AIO | `POST /internal/conversations/:id/release`, `/bot on` | — | AIO | KEEP |
| Retomada reavalia o contexto atual | AIO (parcial) | grafo re-executa do estado atual | Sem reavaliação explícita | AIO | ADAPT |
| Nova sessão após 24h pode voltar à IA automaticamente | — | **não existe** | Nenhuma pausa expira sozinha (`BOT_OFF_PAUSE_UNTIL = 9999-12-31`) | AIO | **CREATE** |
| Áudio compreendido, confirmação em áudio é válida | — | **não existe** — zero código de transcrição | Áudio recebe resposta canned "me envie em texto" | AIO | **CREATE** |
| Imagem gera handoff | — | **não existe** — imagem recebe resposta canned, **sem handoff**; legenda é descartada; mensagem **não é persistida** | Contraria o vault | AIO | **ADAPT** |
| Documento visível, sem interpretação | — | não persistido, resposta canned | Precisa aparecer na conversa | AIO | **ADAPT** |
| Sticker/GIF não determinam fluxo | AIO | caem em `unknown` → resposta canned | Comportamento aceitável, mas responde quando não deveria | AIO | ADAPT |
| Retenção diferente por categoria (Comercial 90d / Pessoal 30d, configurável) | — | **não existe** nenhuma retenção em nenhum serviço | — | AIO + jobs | **CREATE** |
| Conversa expirada continua na lista com informação mínima | — | **não existe** | — | AIO | **CREATE** |

---

## IA

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Estilos Profissional / Equilibrada / Descontraída | AIO + BFF | `AiTone {PROFESSIONAL_OBJECTIVE, LIGHT_CLOSE}` — **2 valores** | Falta o terceiro; nomes não correspondem | AIO + BFF + contracts | **ADAPT** |
| Equilibrada é o padrão | AIO | default `LIGHT_CLOSE` | Semanticamente próximo, mas o enum muda | AIO | ADAPT |
| Nenhuma persona ou nome próprio da IA | AIO | **proibido explicitamente** no prompt, coberto por teste; tabelas de persona já dropadas | `prompts/response.ts:5-6` ainda manda "respeitar a persona configurada na Atendente Virtual" — aponta para o vazio | AIO | **KEEP** + limpar prompt órfão |
| Responder com transparência se perguntarem se é robô | AIO | prompt | — | AIO | KEEP |
| Usar histórico para reduzir perguntas | AIO (parcial) | `Conversation.state` + `list_customer_appointments` | Sem memória estruturada do cliente (preferências, relações) | AIO + SCH | ADAPT |
| Nunca inventar preço/serviço/disponibilidade | AIO | **forte**: prompt + revalidação de `serviceId` contra o SCH; preço e duração sempre do SCH | — | AIO | **KEEP** |
| **Nunca negociar desconto** | — | **NÃO EXISTE** — grep `desconto\|discount`: zero ocorrências em código | Regra do `AGENTS.md` sem nenhum guardrail | AIO | **CREATE** |
| Pedido de desconto gera handoff | — | **não existe** | — | AIO | **CREATE** |
| Nunca criar encaixe por iniciativa própria | AIO (indireto) | coberto porque o slot vem do SCH | Sem regra explícita | AIO | ADAPT |
| Handoff quando não resolve com segurança | AIO (parcial) | 8 triggers implementados (tool, decisão JSON, regex de humano/reclamação/fornecedor/pessoal, config incompleta, exceção, takeover, comandos) | Faltam: threshold de confiança (`confidence` é parseado e **nunca comparado**), imagem, ameaça/assédio, regra do serviço | AIO | **ADAPT** |
| **Nunca confirmar operação antes de concluí-la** | AIO (só prompt) | prepare/confirm existe; `validateToolResult` calcula `toolResultsValid` e **nunca o usa**; aresta para `agent` é incondicional | Guardrail é 100% prompt, sem mecanismo | AIO | **ADAPT** |
| Não enviar mensagem de "aguarde enquanto consulto" | AIO | prompt | — | AIO | KEEP |
| Falha ao criar agendamento: 1 retry, depois handoff, avisar o profissional | AIO (parcial) | exceção no nó `agent` → `pauseIndefinitely` + resposta de erro | Sem retry, sem notificação ao profissional | AIO | **ADAPT** |
| Falha de agenda: não usar disponibilidade antiga, não inventar, encaminhar a humano | AIO | erro do SCH propaga e vira handoff | Comportamento aceitável | AIO | KEEP |
| Instabilidade da IA não gera mensagem automática ao cliente | AIO (parcial) | envia mensagem de erro ao cliente no nó `handoff` | Contraria a regra | AIO | **ADAPT** |
| Conhecimento do negócio via FAQ/descrições | AIO | RAG pgvector com 6 tipos textuais | Só ingestão por script CLI; **sem rota HTTP**, sem chunking automático, sem índice ANN | AIO + BFF | **ADAPT** |
| **RAG nunca é fonte de dado operacional** | AIO | **barreira tripla**: guard de código (`isOperationalKnowledgeQuery`), descrição da tool, prompt | Vazamento residual: o nó `retrieveKnowledge` chama `search()` sem o guard | AIO | **KEEP** + fechar o nó |
| Defesa contra injeção de prompt no conhecimento | AIO | instrução explícita nos chunks recuperados | — | AIO | KEEP |
| IA nunca atende grupos | AIO + EVO | filtro em 3 camadas | Kill-switch global, não por tenant | AIO | KEEP |
| Ativação da IA exige serviço + disponibilidade + WhatsApp + teste real | BFF (parcial) | `onboarding/complete` valida 7 gates, incluindo WhatsApp conectado | **Teste real não existe**; ativação é passiva | BFF + AIO | **ADAPT** |

---

## WhatsApp

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Um negócio = um número | BFF | `WhatsAppInstance.userId @unique` | Ancorado em `userId`, não `tenantId` — inconsistente com o resto | BFF | **ADAPT** |
| Número pode ser pessoal e profissional | — | nada impede | Depende de categorias e Ignorar IA, que não existem | AIO | **CREATE** |
| Conexão por QR (desktop) | BFF + EVO | `GET /instance/qr`, normalizado para data-URL | — | BFF | KEEP |
| Conexão por código de vinculação (mobile) | BFF + EVO | `POST /instance/pair` | `expiresAt` de 160 s é **hardcoded no BFF**, não vem do Evolution | BFF | ADAPT |
| Detecção automática da conexão | BFF | **polling** de `GET /instance/status` a cada request | Eventos `CONNECTION`/`QRCODE` são assinados e **rejeitados com 400** pelo mapper | BFF + AIO | **ADAPT** |
| Reconexão | BFF | `POST /v1/whatsapp/reconnect` | — | BFF | KEEP |
| Alerta de desconexão (banner + e-mail após tentativas) | — | **não existe** nenhum alerta | Sem provider de e-mail, sem notificação | BFF + jobs | **CREATE** |
| Desconectar / trocar número sem apagar dados | BFF (parcial) | `DELETE /v1/whatsapp` apaga a instância local; conversas sobrevivem no AIO | **Não desativa o `ChannelConnection`** no AIO; erros do Evolution são engolidos com `.catch(() => null)` | BFF | **ADAPT** |
| Novo teste de ativação ao trocar o número | — | **não existe** | — | BFF + AIO | **CREATE** |
| **Teste real de ativação** por número oficial da Atendly | — | **NÃO EXISTE**: sem endpoint, sem número oficial configurado, sem fluxo | Etapa obrigatória do onboarding sem nenhum backend. Exige um número WhatsApp da plataforma | BFF + AIO + infra | **CREATE** |
| Usuário interfere no teste → pausar e oferecer reiniciar | — | **não existe** | — | BFF + AIO | **CREATE** |
| Takeover manual detectado pelo WhatsApp do celular | AIO (parcial) | mensagens `fromMe` chegam e são roteadas para `handleOwnerActivity` | **Não pausa a IA** (ver Conversas) | AIO | **ADAPT** |

---

## Importação única do Minha Agenda

| Regra de produto | Owner atual | Implementação atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- | --- |
| Minha Agenda **só** como origem de importação | SCH | é **fonte de verdade em runtime** quando `source=MINHA_AGENDA`, com leitura **e escrita** | Premissa substituída ainda operante | SCH | **REMOVE** o provider de runtime |
| Contrato público não expõe fonte ativa/integração | BFF | `GET /v1/calendar`, `POST /v1/calendar/integration/connect|reconnect`, `DELETE`, `ATENDLY\|EXTERNAL`, `capabilities`, `managedExternally` | Contrato público inteiro modela agenda pluggable | BFF + contracts | **REMOVE** |
| Análise não altera dados antes de confirmar | SCH | `diagnose` é read-only | — | SCH | KEEP |
| Preview por categoria com contagens | SCH | `entities.{services,customers,appointments,availability}.{total,importable}` | Falta histórico de atendimentos, cancelamentos, faltas, bloqueios | SCH | **ADAPT** |
| `Importar tudo` como caminho principal e seleção de categorias | — | **não existe** seleção | Importa tudo ou nada | SCH | **CREATE** |
| Conflitos explicados e resolvíveis | SCH (parcial) | 12 detectores de conflito, `status` sempre `"OPEN"` | **Não existe resolução**; qualquer conflito **aborta a importação inteira** | SCH | **ADAPT** |
| Poucos conflitos não bloqueiam milhares de registros válidos | — | **comportamento oposto** | — | SCH | **ADAPT** |
| Importação parcial permanece aberta até conclusão explícita | — | **não existe** | — | SCH | **CREATE** |
| **`Concluir importação` como decisão do usuário** | — | **não existe** — o flip de fonte é automático dentro da transação | Passo definitivo do produto ausente | SCH + BFF | **CREATE** |
| **Uma única importação concluída por negócio** | — | trava apenas de **job ativo concorrente**, não de importação única | Nada impede uma segunda importação após a primeira terminar | SCH | **CREATE** |
| Migração reversa não existe | SCH (correto) / BFF (incorreto) | SCH marca `supported: false`; **o contrato público do BFF aceita `target: EXTERNAL`** | — | BFF | **REMOVE** |
| Credenciais deixam de ser usadas após concluir | — | **não existe** — `IntegrationConnection` permanece ativa | — | SCH | **CREATE** |
| Cliente sem telefone importado normalmente | — | **pulado silenciosamente** na importação e gera conflito no diagnóstico | Depende de telefone nullable | SCH | **ADAPT** |
| Cliente sem nome importado como cadastro incompleto | — | não tratado | — | SCH | **CREATE** |
| Mesmo telefone com nomes diferentes: **não** mesclar | — | **mescla** — `create()` é upsert por telefone e conflito `CUSTOMER_PHONE_DUPLICATED` aborta tudo | Comportamento oposto ao vault | SCH | **ADAPT** |
| Serviço sem preço → "Sem preço informado" | — | não existe o tipo | — | SCH | **CREATE** |
| Serviço sem duração → "Precisa de revisão", indisponível para IA | — | `durationMinutes` NOT NULL | — | SCH | **CREATE** |
| Histórico, cancelamentos e faltas preservados | — | só agendamentos futuros e passados com 2 status | Depende do ciclo de vida completo | SCH | **CREATE** |
| Histórico da importação em Configurações, sem CTA de nova importação | SCH (parcial) | `MigrationJob` + `GET /:id` | Sem listagem, sem sumário por categoria consolidado | SCH + BFF | **ADAPT** |

---

## Operações assíncronas

Nenhuma delas tem qualquer implementação hoje. **Não existe infraestrutura de jobs em nenhum serviço.**

| Regra de produto | Owner atual | Gap | Owner proposto | Ação |
| --- | --- | --- | --- | --- |
| Até 2 lembretes por agendamento, default 1 a 24 h | — | não existe modelo, agendamento nem envio | SCH (agenda) + AIO (envio) + jobs | **CREATE** |
| Conteúdo do lembrete adaptado ao estilo da IA; preço configurável | — | não existe | AIO | **CREATE** |
| Confirmação de presença pelo lembrete (sim/não/vago/sem resposta) | — | não existe | AIO + SCH | **CREATE** |
| `Notificar cliente` em alteração manual, marcado por padrão | — | não existe | BFF + AIO | **CREATE** |
| Central de notificações com níveis (informativa/atenção/crítica) | — | não existe | BFF | **CREATE** |
| Banner persistente para problema que impede a operação | — | não existe | BFF | **CREATE** |
| Alerta por e-mail em problema crítico | — | não existe **nenhum provider de e-mail** em nenhum serviço; o único fluxo que precisa (reset de senha) está **quebrado em produção** | BFF + jobs + infra | **CREATE** |
| Expiração de hold | — | hold não existe | SCH + jobs | **CREATE** |
| Auto-complete 30 min após o término | — | não existe | SCH + jobs | **CREATE** |
| Retenção/limpeza de mensagens por categoria | — | não existe; `Message`, `ProcessedEvent`, `AiRun`, `AiToolCall` e checkpoints crescem sem limite | AIO + jobs | **CREATE** |
| Retry de falha transacional | — | só retry síncrono de GET no BFF; webhook falho é perdido | jobs | **CREATE** |
| Orquestração do teste de ativação | — | não existe | AIO + jobs | **CREATE** |
| Janela de espera de mensagem ambígua (2–5 min) | — | não existe; exige timer durável | AIO + jobs | **CREATE** |
| Exclusão de conta com 7 dias de recuperação | — | não existe | BFF + jobs | **CREATE** |
| Expurgo de `CalendarMutationIdempotency` (`lockedAt` sem TTL) | — | lock preso é permanente | SCH + jobs | **CREATE** |

---

## Leitura da matriz

Contagem aproximada por ação, nas ~130 regras acima:

| Ação | Quantidade |
| --- | --- |
| **CREATE** (não existe nada) | ~62 |
| **ADAPT** (existe, precisa mudar) | ~40 |
| **KEEP** (correto como está) | ~20 |
| **REMOVE** (existe e não deveria) | ~5 |

O padrão é claro: **o backend atual está majoritariamente correto naquilo que implementou, e implementou aproximadamente metade do produto.** O trabalho dominante é adição — não reescrita nem remoção.
