# Dados e migração — auditoria Goal 0

## Escopo e estado da auditoria

Baseline: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`. Auditoria documental, sem executar migrations, consultar bancos externos, alterar schemas, instalar dependências ou modificar runtime. O schema versionado demonstra capacidade estrutural; não demonstra o volume, a integridade ou o estado real dos dados implantados.

Fonte soberana de produto: `docs/product-vault/`, especialmente `01-Regras/02-Agenda-e-Agendamentos.md`, `01-Regras/04-Clientes-e-Memoria.md`, `01-Regras/06-Importacao-Minha-Agenda.md` e `02-Fluxos/05-Importacao-Unica.md`. A Agenda Atendly é a única agenda operacional; Minha Agenda é somente origem opcional de uma importação única. Os comportamentos legados descritos abaixo são evidência de divergência, não requisitos a preservar.

Estado: levantamento de Scheduling, importação, serviços e clientes consolidado em 2026-09-05, complementado pelo plano BFF/IA/WhatsApp nas seções 9–11. Evidências anteriores recuperadas de entradas e resultados de ferramentas; trechos que afetavam decisões foram conferidos no código da baseline. Graphify reutilizou o grafo existente, sem reconstrução. Ownership físico e comunicação estão definidos como proposta em [TARGET_ARCHITECTURE](TARGET_ARCHITECTURE.md).

## Riscos já confirmados no levantamento

- O runtime ainda seleciona provider operacional por fonte de agenda e permite operações na Minha Agenda. A remoção exige corte dos consumidores e dos dados existentes; não é uma simples troca de enum.
- A migração legada exige destino vazio e conclui/troca a fonte automaticamente. Não atende preview, resolução de conflitos com dados existentes, reprocessamento durante sessão e conclusão explícita pelo usuário.
- Identidade de cliente por telefone único por negócio conflita com pessoas que compartilham número e importação de clientes sem telefone.
- Snapshots comerciais existentes devem ser preservados. Não se deve preencher dados históricos desconhecidos com valores atuais do catálogo ou inventar status da origem.
- Há riscos de concorrência na reserva de horários, nos bloqueios e na idempotência; a seção 2 discrimina os caminhos e a cobertura existente.

## Distinção obrigatória

**Migração interna de engenharia** transforma schemas, ownership e consumidores da plataforma sem consumir o direito de importação do negócio. Deve ser retomável, auditável e preservar identificadores, histórico e registros não resolvidos.

**Importação do usuário** lê a Minha Agenda mediante credenciais fornecidas, analisa antes de escrever, permite categorias e conflitos, pode permanecer parcial e somente consome o direito único após `Concluir importação`. Falha técnica anterior à conclusão não consome esse direito. O destino pode conter dados da Atendly; nunca presumir destino vazio.

As propostas de desenho de dados neste documento são recomendações técnicas para o plano de migração. Não autorizam alterações de banco ou contrato neste Goal.

## 1. Persistência atual de Scheduling

O domínio usa Fastify, Prisma e PostgreSQL. `build-app.ts:37` registra API operacional e API de gestão. Todas as rotas dessas APIs usam autenticação interna; `shared/auth/internal-auth.ts:9` exige tenant, usuário e request-id e `:32` valida um bearer compartilhado. O serviço confia nesses headers após validar o segredo; não verifica associação do usuário ao tenant em uma base própria. O BFF deve permanecer responsável pela identidade autenticada do browser, sem transformar headers públicos em autorização interna.

Nas referências abreviadas abaixo, `schema.prisma` é `apps/scheduling-service/prisma/schema.prisma`; os caminhos de runtime são relativos a `apps/scheduling-service/src/`.

| Entidade atual | Campos, vínculos e índices relevantes | Limite observado / efeito sobre migração |
| --- | --- | --- |
| `CalendarSettings` (`schema.prisma:37`) | PK `tenantId`; `source` obrigatório ATENDLY/MINHA_AGENDA; timezone; timestamps | Mistura configuração de agenda com escolha de provider. Sem marcador independente de importação única concluída. Não alterar todos os tenants para ATENDLY antes de reconciliar a operação existente. |
| `IntegrationConnection` (`:45`) | Credenciais cifradas em bytes, configuração JSON, status textual, `lastSuccessfulSyncAt`, erros; único `(tenantId, provider)` | Registro e nomes refletem integração operacional permanente. Pode ser adaptado para credencial temporária de importação, com ciclo de vida definido; não apagar antes de inventariar jobs e uso legado. |
| `Customer` (`:62`) | Nome nullable; telefone e telefone normalizado obrigatórios; único `(tenantId, id)` e `(tenantId, normalizedPhone)`; índice de nome | Não representa ausência de telefone nem pessoas diferentes com o mesmo número. Não contém responsável principal, observações autorizadas, tags e preferências do produto. |
| `Service` (`:78`) | Nome/duração obrigatórios, ativo, preço decimal `(12,2)` nullable, enum FIXED/ON_REQUEST; índice por tenant/ativo/nome | Não representa `a partir de`, `não informado`, duração pendente de revisão, descrição, cor persistida, buffers, recorrência, modalidade e regras privadas para IA. |
| `AvailabilityRule` (`:95`) | Dia da semana, início/fim `TIME(0)`, ativo, índice tenant/dia/ativo | Suporta intervalos semanais múltiplos; não possui política persistida de antecedência mínima/máxima ou granularidade do negócio. A escrita atual substitui todas as regras. |
| `AvailabilityException` (`:108`) | Data `DATE`, horários opcionais `TIME(0)`, disponível/indisponível, motivo; índice tenant/data | Algoritmo usa as exceções; não foi encontrada rota de gestão de exceções na API registrada. Existência da tabela não prova fluxo completo. |
| `TimeBlock` (`:122`) | Início/fim e motivo; índice tenant/início/fim | Sem tipo que diferencie compromisso pessoal/bloqueio, sem recorrência e sem trilha de exclusão. DELETE remove a linha. |
| `Appointment` (`:134`) | Cliente obrigatório, source AI/USER/INTEGRATION, início/fim, status textual, createdBy, comentários; índices por tenant/intervalo, cliente e status | Sem estado de hold, confirmação de presença separada, valor final, observação de falta, título de atendimento excepcional, versão ou log de alteração. `status` não tem enum/check de estados de produto. |
| `AppointmentItem` (`:156`) | FK para agendamento e serviço; snapshots de nome/duração/tipo de preço/preço | Base reaproveitável do acordo comercial. FK obrigatória de serviço e snapshots obrigatórios dificultam registros históricos incompletos; não preencher com dados atuais para satisfazer a constraint. |
| `ExternalEntityMap` (`:174`) | Mapeia ID externo para interno; único tenant/provider/tipo/ID externo; índice de ID interno | `internalId` é string sem FK para entidade concreta; não tem import-session, fingerprint ou versão da transformação. Preservar mapas e conferir órfãos/colisões antes de reaproveitar. |
| `MigrationJob` (`:188`) | Origem/destino, status textual, progresso, summary/warnings/limitations JSON, erros, executor e datas; índice tenant/status/criação | Sem unicidade de importação concluída ou job ativo por tenant, sem seleção de categorias, conclusão explícita, cursor por categoria, lease/heartbeat ou trilha de decisões. |
| `MigrationConflict` (`:213`) | Tipo, status textual, detalhes JSON, FK composta do job; índice tenant/job/status | Estrutura parcial reutilizável; análise apaga e recria conflitos, sem decisão persistida do usuário. |
| `CalendarMutationIdempotency` (`:228`) | Único tenant/key, operação, requestHash, status, resposta JSON, erro e lockedAt | Base útil para replay; efeito e resposta são gravados em transações distintas. Registro não referencia explicitamente o agendamento resultante. |

FKs entre Customer → Appointment → AppointmentItem e Service → AppointmentItem incluem `tenantId` e usam `ON DELETE RESTRICT` (`schema.prisma:147`, `:167`). É uma proteção concreta contra relação entre tenants e remoção acidental de linhas referenciadas. As tabelas não têm relação SQL com um Tenant neste schema; verificar tenants órfãos é etapa de reconciliação entre donos, não presumir integridade global.

### Constraints SQL e histórico de migrations

O Prisma não expressa todas as proteções existentes. `prisma/migrations/20260828175825_init/migration.sql:263` exige duração de serviço positiva, combinações válidas FIXED/preço ou ON_REQUEST/null, dia 0–6, intervalos crescentes e exceção com os dois horários ou ambos nulos. `:283` repete as constraints comerciais nos snapshots. `:290` exige `MigrationJob.source <> target`. Essas constraints precisam evoluir junto com qualquer novo schema; alterar apenas o tipo TypeScript ou a nulabilidade Prisma não basta.

`20260828233000_add_atendly_calendar_provider/migration.sql:2` adiciona normalizedPhone, preenche removendo caracteres não numéricos, torna obrigatório e cria índice único. Telefones diferentes na forma original que convergem para os mesmos dígitos podem causar falha nessa migration; o SQL não resolve colisões nem valida os 6–15 dígitos exigidos hoje por `shared/phone/phone.ts:3`. Não há evidência de que essa condição tenha ocorrido em produção.

`20260831010000_goal16_calendar_migrations/migration.sql:3` amplia metadados do job e usa `requestedBy = 'legacy'` para linhas anteriores. Preservar esse valor como autoria desconhecida; não atribuir retroativamente a um usuário real.

Instantes são `TIMESTAMP(3)` no SQL inicial (`:119`), enquanto horários semanais são `TIME(0)` e exceções têm `DATE`. O runtime converte datas/horas pelo timezone do negócio (`shared/date-time/calendar-date-time.ts:45`) e formata pelo timezone atual (`integrations/atendly/provider.ts:273`). Backfill deve registrar a interpretação usada, preservar instantes e testar a visualização local; não converter timestamps supondo timezone do servidor nem alterar fusos em massa. Não se propõe troca de tipo temporal neste Goal.

## 2. Evidências de comportamento e gaps

Classificação: **P1** exige resolução antes de validar o MVP ou executar o corte do domínio, por risco de identidade, perda de informação ou ação incorreta; **P2** exige conclusão de capacidade de produto/operabilidade. A severidade descreve risco observado no código, não incidente confirmado em produção. `REUSE` indica base válida que ainda precisa da validação correspondente.

| ID | Classe | Evidência do baseline | Consequência / tratamento |
| --- | --- | --- | --- |
| DATA-01 | P1 — divergência de produto | `modules/calendar/calendar-service.ts:127` lê `source`; `provider-factory.ts:17` seleciona Atendly ou Minha Agenda. `internal-api/routes.ts:125` e `:164` alteram catálogo/clientes conforme fonte. | A Minha Agenda continua operacional; clientes podem aparecer como geridos externamente. Substituir essa semântica somente após inventário e corte controlado dos consumidores. |
| DATA-02 | P1 — identidade | `customers/atendly-customer-service.ts:38` faz upsert por telefone e `:51` altera nome quando fornecido; `:55` retorna um único cliente por telefone. | Agendar para outra pessoa no mesmo número pode renomear cadastro anterior. Identidade deve ser ID de pessoa no tenant, com telefone como contato não exclusivo e seleção explícita quando houver ambiguidade. |
| DATA-03 | P1 — atomicidade | `integrations/atendly/provider.ts:104` lê catálogo e `:108` cria/atualiza cliente antes de validar slot; transação começa em `:127`. | Falha de slot pode deixar cliente criado/renomeado sem agendamento confirmado. Leitura comercial também pode envelhecer frente a edição concorrente; o acordo apresentado precisa ter identidade/versão, sem trocar silenciosamente os valores na confirmação. |
| DATA-04 | REUSE + P1 — concorrência parcial | Create `provider.ts:127` e reschedule `:199` usam transação Serializable, lock advisory por tenant/data (`:310`) e rechecagem da disponibilidade. `internal-api/routes.ts:266` consulta conflito e `:282` cria bloco sem mesma transação/lock. | Não é correto afirmar que não há proteção de concorrência: há proteção entre escritores cooperantes. Bloqueio concorrente pode ser inserido após a checagem; incluir bloqueios, exceções, holds e mutações na mesma política, com tratamento explícito de abortos serializáveis. |
| DATA-05 | P1 — replay | `calendar/idempotency.ts:34` executa mutação e `:35` grava resposta depois; `:101` permite recuperar FAILED ou PENDING antigo. | Queda depois do commit e antes de persistir replay deixa resultado incerto. Retry pode falhar por slot ocupado, perder referência ao sucesso ou repetir mutação; em fluxo remoto, o resultado depende de garantia não comprovada da origem. Tornar resultado recuperável e consistente com o efeito local. |
| DATA-06 | REUSE + P1 — histórico | `provider.ts:157` grava snapshots; `:225` remarca a própria linha, mantendo snapshots; `:246` cancela alterando status/comentários. Não existe entidade de eventos no schema. | Cancelamento preserva linha e remarcação mantém horário antigo até a atualização transacional. Faltam hold do novo horário, log de antes/depois/ator/motivo e preservação de todos os eventos; `updatedAt` não substitui histórico. |
| DATA-07 | P1 — importação | `migrations/calendar-migration-service.ts:199` deixa PARTIAL e retorna diante de qualquer conflito; `:433` exige destino sem serviços/clientes/agendamentos/regras; `:572` troca source e `:587` conclui na mesma transação. | Um conflito bloqueia todos os registros. Não há conclusão explícita, importação posterior em negócio Atendly com dados, seleção de categorias ou resolução por item. A operação legada não deve ser apresentada como importação única pronta. |
| DATA-08 | P1 — perda de cobertura histórica | `calendar-migration-service.ts:337` lê hoje até +3.650 dias; clientes vêm dos agendamentos (`:350`). `minha-agenda/provider.ts:61` filtra deleted; `:495` reduz status a SCHEDULED/CANCELLED. | Não traz histórico passado, clientes sem futuro nem cancelados filtrados; tipos locais não representam faltas/conclusão. A disponibilidade real de categorias na API externa continua não verificada. |
| DATA-09 | P1 — valores importados | `minha-agenda/provider.ts:452` força preço FIXED. `:499` prioriza array de serviços e seus valores/durações, usa duração total como fallback por item e zero como fallback de preço (`:517`, `:530`). | Pode perder valor acordado, confundir ausente com gratuito e multiplicar duração de multi-serviço sem detalhe por item. Comparar originais e preservar desconhecido/proveniência; não chamar esses valores de snapshots históricos confiáveis sem reconciliação. |
| DATA-10 | P1 — jobs | `calendar-migration-service.ts:77` faz check e create separados; `:142` reabre todos ANALYZING/RUNNING no boot; `:162` usa Set e queueMicrotask locais. | Corrida pode criar jobs paralelos; reinício de outra réplica pode recolocar job ainda ativo em PENDING. Há claim condicional em `:171`, mas falta exclusividade durável/lease e retomada por item. PARTIAL não é retomado por `resumeIncomplete`. |
| DATA-11 | P2 — calendário completo | `availability/atendly-availability.ts:119` inclui regras, exceções, blocos e agendamentos não cancelados; `:186` gera slots a partir de step da requisição. Schema e rotas não oferecem hold, limites do negócio, recorrência de bloqueio, compromisso pessoal distinto ou sobreposição humana com alerta. | Reaproveitar cálculo de intervalos; completar persistência, contratos e caminhos da UI/IA. O lock de idempotência de cinco minutos não é hold de agenda. |
| DATA-12 | P2 — serviços | `services/atendly-service-service.ts:132` rejeita duração ausente/zero; `:141` só admite FIXED e ON_REQUEST; `:175` devolve colorId null. `requireActive(:81)` bloqueia inativos. | Preservar bloqueio de serviço inativo e soma multi-serviço; adicionar estados de pendência e propriedades do serviço exigidas pelo vault, sem inventar duração/preço/recorrência na importação. |
| DATA-13 | P2 — cliente e operação | Schema de cliente limitado a nome/telefone; create de agendamento exige serviço(s), nome e telefone (`calendar/routes.ts:41`). | Não suporta cliente manual sem telefone, responsável principal confirmado, tags/observações autorizadas, preferência com origem ou atendimento humano excepcional sem catálogo. |
| DATA-14 | P2 — estados operacionais | `Appointment.status` é string (`schema.prisma:141`); create grava SCHEDULED (`provider.ts:145`); cancel grava CANCELLED (`:251`); não foram encontrados handlers de conclusão/falta/valor final/confirmar presença no serviço. | Mapear para os quatro estados do produto com raw status legado preservado. Separar confirmação de presença, valor final e histórico; não inferir receita realizada do preço previsto. |

A API de disponibilidade semanal substitui todas as regras e também grava timezone em transação (`internal-api/routes.ts:229`), mas não participa do lock da criação de agendamentos. Edições concorrentes e impacto sobre compromissos existentes precisam de política e teste; não cancelar nem reescrever agendamentos já combinados por mudança de disponibilidade ou catálogo.

## 3. Minha Agenda: matriz de destino

`REMOVE` é o destino técnico final, condicionado ao corte dos consumidores e reconciliação. `KEEP TEMPORARILY FOR MIGRATION` é retenção interna com critério de saída, sem oferecer sincronização, troca de fonte ou novo modo de produto.

| Componente / evidência | Classificação | Destino e condição |
| --- | --- | --- |
| OAuth, GET services/appointments/workSchedule em `integrations/minha-agenda/client.ts:25`, `:50`, `:108`, `:157` | REUSE FOR IMPORT | Transporte leitor da origem, com paginação/cobertura/falhas e validação de payload comprovadas em etapa posterior. O client hoje faz cast/JSON.parse (`:195`, `:255`), sem schema de resposta externo. |
| Cifra AES-256-GCM vinculada ao tenant por AAD (`integrations/credentials.ts:26`, `:45`) | REUSE FOR IMPORT | Preservar isolamento e envelopes; planejar key-id/rotação, redaction e descarte conforme ciclo da importação. Não copiar segredos em staging, logs ou relatórios. |
| `IntegrationConnection`/configuração Minha Agenda (`schema.prisma:45`, `config.ts:12`) | ADAPT | Credenciais e identificação da origem para sessão de importação; paymentMethod, enableWrites e buffer operacional não são configurações do produto alvo. |
| `CalendarService.provider()` + `CalendarProviderFactory` | REMOVE | Retirar seleção operacional remota depois de consumidores passarem a depender da Agenda Atendly e dados legados serem tratados. Core de agenda pode manter sua API interna sem manter escolha de fonte. |
| Create/update/cancel remotos (`minha-agenda/client.ts:39`, `:73`, `:84`, `:96`; provider `:138`, `:182`, `:239`) | REMOVE | Não fazem parte da importação. Desativar seu uso no corte, verificar ausência de chamadas e então remover. Não converter fallback de erro em escrita remota. |
| Availability remoto para decidir vagas (`minha-agenda/provider.ts:103`, `:363`) | REMOVE | O destino operacional consulta apenas Agenda Atendly. Ler bloqueios e horários da origem continua útil para importação, sem usá-los como fonte atual. |
| Conversão de horários semanais (`minha-agenda/availability.ts:79`) | REUSE FOR IMPORT | Adaptar intervalos da origem preservando lacunas/bloqueios e explicando limitações. Não fabricar disponibilidade a partir de dados ausentes. |
| `getMigrationSnapshot` (`minha-agenda/provider.ts:72`) e mappers (`:466`, `:499`) | ADAPT | Leitura por categorias, histórico/status/blockers quando disponíveis e preservação do raw. Evitar reutilizar filtros operacionais que excluem cancelados e serviços desativados. |
| Diagnose (`calendar-migration-service.ts:70`, `:259`) | ADAPT | Preview sem escrita de dados operacionais, snapshot estável e contagem por categoria. Executar deve referir-se ao preview aprovado ou informar sua mudança. Hoje diagnose/start/run leem novamente a origem. |
| Motor de importação (`calendar-migration-service.ts:404`) | ADAPT | Substituir transação monolítica por processamento retomável de itens/grupos dependentes, conflitos locais, rastreio e conclusão explícita. Não presumir sucesso parcial sem contagem verificável. |
| `ExternalEntityMap`, `MigrationJob`, `MigrationConflict` | ADAPT | Base de rastreabilidade: acrescentar sessão, identidade da conta de origem, status por item, decisões, fingerprints e reconciliabilidade; manter histórico legado. |
| Endpoints de integração/reconexão/desconexão ligados à fonte (`internal-api/routes.ts:310`, `:363`, `:398`) | REMOVE | Substituir consumidores por autenticação/leitura/importação com ciclo explícito. Desconectar origem de importação nunca deve desativar agenda operacional. |
| Enums e campos de source/target/status legados e respostas já salvas de idempotência | KEEP TEMPORARILY FOR MIGRATION | Adaptadores de compatibilidade internos até todos os consumidores e replays terem sido tratados. Não expor fonte remota como opção vigente. |
| Credenciais e mapas de tenants/jobs legados | KEEP TEMPORARILY FOR MIGRATION | Inventariar origem operacional e estado de cada job; preservar até reconciliação, descarte definido e prova de que não há job dependente. Corrigir conforme a política final de dados, sem retenção indefinida por conveniência. |

Capacidade externa ainda desconhecida: o código local não prova se a API permite listar todos os clientes, paginar, consultar histórico completo, diferenciar falta/conclusão, preservar valores por item ou exportar bloqueios. O snapshot atual não consulta blockers, embora a disponibilidade remota consulte `isSlotBlocker: true` (`provider.ts:117`). Separar limitação do adaptador existente de limitação comprovada da origem; verificar essa capacidade com documentação/ambiente autorizado em execução futura.

## 4. Ownership alvo dos dados

Estas fronteiras lógicas estão consolidadas na proposta de TARGET_ARCHITECTURE: identidade/negócio no BFF, núcleo operacional no Scheduling e conversas/memória na IA. Não exigem novo banco, serviço ou framework.

| Dado | Dono lógico recomendado | Consumidores e limite |
| --- | --- | --- |
| Tenant, usuário autenticado, associação ao negócio | Domínio de identidade/negócio | Scheduling recebe tenant validado; não duplica autorização de conta por telefone nem cria tenant por header. Reconciliação global de tenants deve validar referências existentes. |
| Cliente, pessoa atendida, contatos compartilhados, responsável, tags e permissões de uso pela IA | Domínio de clientes no núcleo operacional | BFF expõe UX; IA consome somente projeção permitida. A relação conversa/número → cliente pode ser ambígua; a IA confirma a pessoa antes de modificar agendamento. |
| Catálogo, duração, preço/tipo, buffers, recorrência e estado de revisão | Domínio de serviços no núcleo operacional | IA consulta serviços operacionais ativos; campos privados precisam de autorização apropriada. Edição de catálogo não reescreve snapshots. |
| Agenda, disponibilidade, bloqueios, holds e agendamentos | Domínio de agenda no núcleo operacional | Todas as mutações humanas/IA passam pelas mesmas invariantes; origem AI/USER/INTEGRATION é proveniência do registro, não provider operacional. |
| Snapshots comerciais, eventos do agendamento, presença e valor final | Domínio de agenda | Histórico e métricas leem fatos persistidos. Mensagens ou estado do agente não são a prova final de confirmação do agendamento. |
| Sessão de importação, itens, escolhas, conflitos, mapas, resultado e conclusão única | Domínio de importação junto ao núcleo operacional | Lê adaptador externo; escreve através das invariantes de importação/agenda/clientes/serviços. BFF/IA não escrevem diretamente suas tabelas. |
| Conversas, memória inferida e estado temporário do agente | AI Orchestrator | Guarda referência ao cliente/agendamento e proveniência; não vira segunda agenda nem renomeia pessoas pelo número. Preferências inferidas devem ser distinguíveis e perder relevância quando antigas. |
| Execução de jobs e entrega de notificações | PostgreSQL e executor no dono; Scheduling calcula lembretes, IA entrega WhatsApp, BFF mantém central/email | O executor não vira dono de dados de outro serviço nem confirma sucesso antes do commit; persistência do trabalho e resultado pertencem ao domínio responsável. Health Worker mantém sondas. |

Notas e tags não são contexto liberado por existir no banco. `01-Regras/04-Clientes-e-Memoria.md` exige autorização explícita de uso pela IA; backfill deve preservar/introduzir consentimento conservador, sem liberar conteúdo legado automaticamente. A retenção de 30/90/180/365 dias em `08-Privacidade-e-Retencao.md` é de conversas; não autoriza apagar histórico de agendamentos, importar conteúdo pessoal ou aplicar TTL de conversa a dados operacionais. Não inventar política jurídica de exclusão neste documento.

## 5. Migração interna: expandir, preencher, compatibilizar e cortar

### 5.1 Inventário e ensaio, antes de qualquer escrita de migração

1. Confirmar ambiente e versão real das migrations, backups restauráveis e capacidade de restaurar chaves de credenciais. Nenhum banco de produção foi inspecionado nesta auditoria.
2. Levantar contagens por tenant/tabela/status/source e amostras sanitizadas: tenants com fonte remota, sem settings, com destino local já preenchido, jobs ativos/parciais/concluídos/falhos e conexões sem job.
3. Conferir FKs e referências entre donos; mapas externos órfãos/duplicados; IDs do mesmo provider potencialmente reutilizados por contas diferentes; clientes sem nome, telefones inválidos/normalizações colidentes e agendamentos sem snapshots íntegros.
4. Comparar soma das durações dos itens com `endAt-startAt`, valores previstos com campos da origem e estados textuais existentes. Registrar diferenças; não corrigir silenciosamente nem declarar dados perdidos irrecuperáveis sem procurar a origem disponível.
5. Medir volume, tamanho de JSON/snapshots e tempo de cada lote. Preparar dry-run e reconciliação com a mesma versão do transformador. Ensaio deve incluir base preenchida, compartilhamento de telefone, histórico cancelado e falha no meio de lote.

### 5.2 Expansão compatível

| Área | Expansão recomendada | Condição antes de novas escritas |
| --- | --- | --- |
| Identidade de cliente | ID independente de telefone; contato opcional/não único, múltiplos candidatos por número, responsável confirmado, autorização de notas/tags, origem de preferências | Substituir `findUnique`/upsert por telefone em todos os consumidores e definir ambiguidade. Só remover a unicidade antiga quando código antigo não depender dela; rollback para esse código torna-se incompatível após números compartilhados. |
| Serviço | Preço com quatro semânticas do produto, ausência de preço/duração explícita, revisão separada de ativo, cor e demais atributos do MVP | Atualizar enums, constraints SQL, schemas de resposta, validação e serialização antes de produzir novos valores. Serviço sem duração permanece fora da oferta da IA. |
| Agendamento | Acordo/snapshots estáveis; título/duração de atendimento manual excepcional; status validado com raw legado; eventos, falta, valor final e presença separados | Distinguir dado conhecido, ausente e não suportado; proteger histórico incompleto sem inventar serviço ou cobrar preço zero. Decidir armazenamento histórico incompleto em ADR técnico antes de alterar FK/constraints. |
| Disponibilidade | Configuração do negócio, hold de cinco minutos, bloqueios/compromissos pessoais, recorrência finita de ocorrências e exceções gerenciáveis | Uma única política transacional de conflito para atores concorrentes. Não interpretar hold como agendamento confirmado, nem recorrência de serviço como série infinita. |
| Importação | Sessão por negócio, direito de conclusão única, categorias, itens/checkpoints, raw seguro, decisões, resumo final e maps com identidade da origem | Constraint/transação deve impedir duas conclusões; falha/retry durante sessão não consome direito. Conclusão exige decisão explícita, não apenas job técnico concluído. |
| Confiabilidade | Resultado idempotente correlacionado ao efeito, versão do payload, lease de job e fencing/claim durável | Confirmar recuperação após commit sem resposta, timeout e reinício concorrente. Aplicar a proposta de jobs/outbox no dono registrada em TARGET_ARCHITECTURE/D-008. |

### 5.3 Backfill conservador e retomável

- Preservar IDs internos, tenantId, IDs externos, timestamps originais e snapshots existentes. Quando o desenho exigir novo ID, usar mapa explícito e reconciliar todas as referências, inclusive estado pendente de IA e respostas de replay.
- Normalização de telefone serve para encontrar candidatos, não para provar que duas pessoas são a mesma. Não renomear, unir ou deduplicar por telefone/nome semelhante. Sem evidência suficiente, conservar registros separados e criar pendência identificável.
- FIXED e ON_REQUEST existentes continuam com o significado original. Preço ausente não vira zero; preço previsto não vira valor final. Dados históricos desconhecidos recebem ausência/proveniência, sem recorrer ao catálogo atual. Duração total importada não deve ser copiada para cada item de um atendimento multi-serviço.
- SCHEDULED/CANCELLED atuais precisam de mapeamento explícito de compatibilidade; outros valores observados no inventário ficam preservados e revisáveis. Não marcar passado como concluído apenas pela data na migração; rotina futura de conclusão operacional é outra decisão e não recupera status desconhecido da origem.
- Para clientes/serviços/agendamentos futuros importados antes desta mudança, conferir relações externas e origem do snapshot. Corrigir somente com evidência e trilha; preservar o valor anterior e o motivo da correção.
- Acrescentar checkpoints e fingerprint por registro/lote; reexecução do mesmo lote não duplica nem reverte uma edição legítima posterior. Escrever entidades dependentes em grupo transacional e registrar itens não processados; não usar uma transação única para toda base por conveniência.
- Tratar `MigrationJob.COMPLETED` legado como evidência técnica de corte antigo. Não afirmar que houve o aceite explícito de `Concluir importação` definido no produto atual. Reconciliação deve classificar esses negócios, preservar sua proveniência e definir o tratamento com o plano de transição; não liberar automaticamente nova importação nem consumir o direito em todos os tenants por default.
- Não armazenar novos snapshots com dados não necessários ou credenciais. A forma de guardar raw de origem, prazo de retenção e acesso devem ser decididos explicitamente; o objetivo é rastrear transformação com minimização de dados.

### 5.4 Compatibilidade dos contratos e consumidores

| Camada atual | Evidência | Evolução necessária |
| --- | --- | --- |
| Scheduling HTTP | Schemas locais em `modules/calendar/routes.ts:13` e `modules/internal-api/routes.ts:25`; tipos de `calendar-provider.ts:1`; parsing de replay em `calendar-service.ts:15` | Publicar esquema consumível e fazer rollout de leitores antes de novos enum/nullable. Replay salvo em JSON deve continuar decodificável ou ter transformação versionada. |
| BFF → Scheduling | `apps/bff/src/clients/scheduling/index.ts:9` duplica source, cliente, serviço, agendamento e migração; métodos de catálogo/clientes/importação em `:291`–`:403` | Alterar schemas e adaptadores juntos; não transformar novo erro/pendência em falso sucesso ou lista vazia. Fonte interna MINHA_AGENDA vira EXTERNAL no mapper público (`apps/bff/src/modules/calendar/routes.ts:268`). |
| IA → Scheduling | `apps/ai-orchestrator/src/modules/scheduling-service/client.ts:15` duplica schema; create usa nome/telefone (`:141`), busca futura usa telefone (`:165`), mapper expõe também primeiro serviço legado (`:308`) | Migrar pessoa atendida para ID explícito quando resolvida, preservar multi-serviço completo e semântica de snapshots. Atualizar estado pendente e testes antes de retirar campos legados. |
| Frontend → BFF | `apps/frontend/src/data/mappers/publicApiSchemas.ts:3` admite ATENDLY/EXTERNAL; `:144` só dois tipos de preço; `:279`/`:306` recebem source/target de migração | Retirar escolha operacional da UX, consumir sessões/categorias/conclusão e pendências reais. Atualizar todos os parsers antes de respostas com preço novo ou cliente sem telefone. |
| Pacote de contratos | `packages/contracts/src/calendar/index.ts:1`, `services/index.ts:1`, `customers/index.ts:1`, `migrations/index.ts:1`, `internal/index.ts:1` são placeholders `export {}` | Há consumidores reais locais, mas os contratos do domínio ainda não estão centralizados. Migrar por consumidor comprovado; não assumir que alterar esse pacote sozinho muda runtime. |

Compatibilidade deve ter janela e critério de saída, sem duplicar a fonte de verdade. Não fazer dual-write para Minha Agenda como ponte de migração. Se houver espelhamento interno temporário, um único dono decide a escrita; o espelho é projeção verificável, com erro reconciliável e sem caminho de operação autônoma.

### 5.5 Corte e remoção

1. Reconciliar cada tenant e suas referências; concluir a classificação dos que ainda operam remotamente e dos jobs legados. O plano precisa definir como preservar a operação já existente; não basta editar `source` em massa.
2. Ter todos os consumidores preparados e invariantes do núcleo validadas com banco isolado. Qualquer flag técnica de transição controla compatibilidade de engenharia, sem criar MVP reduzido ou segunda agenda de produto.
3. Fazer corte de escritores e leitura para o único núcleo Agenda Atendly, com decisão verificável por tenant e recuperação de trabalhos pendentes. Proibir novos efeitos remotos e observar tentativas/chamadas restantes.
4. Comparar contagens, associações, horários, snapshots, status e mapas antes/depois; conferir casos do usuário, não apenas hashes globais.
5. Remover caminhos externos operacionais, consumers antigos e source switching quando a janela de compatibilidade terminar. Só então remover campos/índices/tabelas obsoletos, após plano de restauração e retenção do histórico.

### 5.6 Rollback e limites

Antes de novas escritas incompatíveis, rollback pode restaurar versão de aplicação compatível, pausar workers e conservar campos expandidos. Não usar down migration destrutiva para apagar dados novos.

Depois que a base admite telefone compartilhado, registros sem telefone, novos tipos de preço ou histórico incompleto, a versão antiga deixa de ser um destino seguro. A estratégia passa a ser correção para frente ou retorno a uma versão compatível com o schema expandido. Snapshot de banco sem replay do que ocorreu depois perde alterações legítimas; restaurar exige janela de recuperação definida e reconciliação das operações posteriores.

Rollback de engenharia não reabre importação concluída, não apaga histórico de conclusão, não reativa Minha Agenda como opção de agenda do produto e não replica automaticamente escritas de volta à origem. Se a transição de uma operação legada ainda não cortada precisar ser pausada, manter o estado registrado e a ação pendente explícita; não anunciar migração concluída.

## 6. Importação única do usuário: protocolo alvo

1. **Elegibilidade:** ler o direito de importação no negócio. Negócio novo pode começar do zero e importar depois, enquanto não houver conclusão; estado legado exige reconciliação conforme 5.3.
2. **Autenticação e análise:** credenciais isoladas por tenant; consultar categorias de origem sem escrever dados operacionais; registrar identidade da conta de origem e versão do preview. Informar dados indisponíveis sem fingir que não existem.
3. **Preview e escolhas:** `Importar tudo` como principal; selecionar categorias como secundário; contagens separadas de serviços, clientes, disponibilidade, futuros, histórico, cancelados/faltas e bloqueios suportados. Não usar apenas contagem genérica de appointments.
4. **Resolução:** deduplicar apenas identidades claramente idênticas; telefone compartilhado não é conflito impeditivo de cadastro. Permitir decisões explícitas sobre divergências e deixar itens fora. Serviço incompleto fica em revisão, cliente incompleto mantém identificação temporária visível.
5. **Execução:** importar registros válidos com checkpoints e idempotência por origem/item; tratar dependências, conflitos com destino existente e falha parcial. Persistir resultado real antes de mostrar sucesso. O status técnico concluído de um lote não consome o direito de importação.
6. **Revisão:** permitir reprocessar durante a mesma sessão e mostrar motivos sanitizados/quantidades reais de pendentes, ignorados e falhos. Análise renovada não deve apagar decisões já tomadas sem controle de versão.
7. **Conclusão:** `Concluir importação` realiza decisão atômica e única por negócio; se restam itens, exigir o aviso forte e aceite previstos no vault. Após isso, reprocessar novamente a origem pelo usuário não existe.
8. **Histórico:** origem, data, quantidades por categoria, itens ignorados/falhos e status final permanecem visíveis. Futuros importados são agendamentos normais da Atendly; não há sincronização ou troca de fonte.

## 7. Validação necessária e cobertura existente

Não foram executados testes, builds, scripts de auditoria ou consultas a banco neste subdomínio: o escopo é exclusivamente documental. Busca de arquivos não encontrou suíte própria em `apps/scheduling-service`; `package.json:6` não declara script de teste. Há testes de IA com agenda mock, incluindo multi-serviço em `apps/ai-orchestrator/tests/tools/assistant-tools.test.ts:223`; eles verificam preparo/chamada do gateway, não transação PostgreSQL, importação ou concorrência de Scheduling.

`scripts/final-production-audit.mjs` faz verificações estáticas por regex. A regra `no_global_phone_unique_constraint` (`:140`) procura `@unique` em campo, sem avaliar a unicidade composta tenant/telefone. Ela não valida o requisito de pessoas diferentes compartilharem número no mesmo negócio. A presença desse script não prova disponibilidade, idempotência nem importação saudável.

| Gate para implementação futura | Evidência de aceite esperada |
| --- | --- |
| Isolamento | Tenant A não lê/muta cliente/serviço/agendamento/importação de B; FKs compostas e autorização dos consumidores exercitadas; headers públicos não selecionam tenant. |
| Identidade | Duas pessoas com mesmo número, cliente sem telefone, responsável confirmado e nome divergente preservados; falha de confirmação/slot não cria nem renomeia cliente. |
| Acordo e histórico | Catálogo editado entre proposta/confirmar e depois do agendamento; snapshots estáveis; remarcação preserva original até commit; cancelamento/falta/valor final e histórico permanecem corretos. |
| Concorrência PostgreSQL | Duas confirmações do mesmo slot, criar bloco versus confirmar, editar disponibilidade, hold expirado/concorrente, cancelar versus remarcar; política de conflito e retries testadas com transações reais. |
| Idempotência | Mesma chave/mesmo payload retorna mesmo resultado; payload diferente conflita; queda depois do commit e antes da resposta recupera efeito; nenhuma confirmação duplicada ou sucesso perdido. |
| Jobs | Dois starts simultâneos, dois workers, reinício durante lote, lease perdido, job PARTIAL e retomada; sem duplicação, reset de worker vivo ou segunda conclusão. |
| Importação em base preenchida | Preview sem escrita operacional; origem com clientes/serviços incompletos, telefone compartilhado, serviços inativos, cancelados/faltas/histórico/blockers; conflitos por item não bloqueiam restante válido. |
| Fidelidade dos dados | Contagens por categoria/status, FK/mapas, soma de duração, null versus zero, preço do item versus catálogo, timezone e ordenação estáveis; qualquer perda declarada e quantificada. |
| Compatibilidade | Schemas do BFF/IA/frontend aceitam expansão; estados pendentes e respostas idempotentes antigas continuam legíveis; legado retirado somente após nenhum consumidor dependente. |
| Recuperação | Backup restaurado em ensaio, rollback compatível exercitado, alterações pós-corte reconciliadas e histórico de conclusão preservado. |

## 8. Decisões e gates da execução

- Os módulos de clientes, serviços, agenda e importação permanecem no Scheduling e compartilham transações locais; arquitetura proposta em TARGET_ARCHITECTURE, sem novo serviço ou banco.
- Representação histórica proposta: referência de catálogo opcional somente para item de origem incompleto, preservando valores conhecidos/raw status e indicador de completude; novos agendamentos continuam exigindo dados operacionais válidos ou exceção manual autorizada pelo vault. Detalhar constraints e mapeamento de estados desconhecidos no Goal correspondente.
- Como classificar conclusão técnica legada diante da conclusão explícita hoje exigida, sem conceder reimportação ou consumir direito automaticamente.
- Concorrência/idempotência usam unidade transacional do dono; jobs/outbox PostgreSQL duráveis e HTTP idempotente entre donos. Implementação exata de claim/lease será detalhada just-in-time, conforme TARGET_ARCHITECTURE.
- Quais capacidades a Minha Agenda realmente fornece, com paginação, janela histórica, status e valores; não inferir limitações externas só dos tipos TypeScript atuais.
- Qual janela de compatibilidade, recuperação, retenção de raw/credenciais e critério de remoção será adotado após inventário real. Sem esses dados, não estimar lote, downtime ou assumir base vazia.

## 9. Migração BFF, IA e transporte

Inventário factual completo desses schemas em [CURRENT_STATE](CURRENT_STATE.md). As transformações abaixo são plano, não migrations executadas.

| Dado atual | Expansão / ownership alvo | Backfill e compatibilidade | Corte / rollback |
| --- | --- | --- | --- |
| User/Tenant/TenantMember BFF | IDs preservados, cardinalidades MVP e conta ativa/exclusão/restauração; sessões revogáveis | Inventariar memberships duplicados/órfãos; casos ambíguos ficam em pendência, sem escolher primeiro dono; adicionar campos antes de alterar auth | Revogação/conta desativada não pode voltar ativa por rollback de binário; sem down migration de dados |
| WhatsAppInstance por user BFF | tenantId único e vínculo externo confirmado; credencial cifrada/versionada | Preencher pelo membership inequívoco e comparar ChannelConnection.user/tenant/instance; cifrar token em lote com key-id e teste de decrypt sem exibir segredo | Migrar todos leitores de user-only/plaintext; só retirar plaintext após reconciliação e rotação quando necessária |
| BusinessProfile/AiSettings BFF e AiTenantConfig | BFF dono desired; projeção IA appliedVersion/effectiveStatus; activation test separado | Preservar timezone e enabled históricos como configuração, não evidência de teste; completar perfil com pendências, sem inventar instruções/modalidades | Outbox versionada reenvia configuração; consumidor idempotente rejeita versão antiga; não reabilitar IA sem requisitos |
| Tons antigos em dois bancos e JSON/fixtures | Três estilos explícitos; default Equilibrada | Proposta: PROFESSIONAL_OBJECTIVE→Profissional, LIGHT_CLOSE→Equilibrada por proximidade/default; nenhum valor antigo prova preferência Descontraída. Registrar valor original/transformação; emitir novos enums só após leitores compatíveis | Replays/checkpoints antigos continuam decodificáveis ou são encerrados com pendência segura; não forçar downgrade para dois tons |
| Conversation única por contato, state JSON | Contact de canal, Sessions/categoria/override/humano; referência a Customer por ID | Extrair contato preservando telefone/ID externo e separar identidade humana; classificação técnica não vira override manual. Sessão histórica deriva timestamps conservadoramente, com raw/proveniência, sem chamar inferência de certeza | Contexto antigo não deve retomar tool pendente automaticamente após schema novo; solicitar reconfirmação segura |
| Message/ProcessedEvent | InboxEvent com execução/lease/resultados; Message/Attachment/Delivery com status | Dedupe antigo é prova de recebimento, não de conclusão. Reconciliar com mensagens/runs/receipt; desconhecidos não são reenviados em massa | Cortar ACK antigo e drenar; worker novo retoma somente estado classificado; manter mapa eventKey/id |
| AiRun/AiToolCall/Conversation.state | Auditável e sujeito à mesma política de conteúdo sensível | Sanitizar arguments/results/raw; operation-id referencia efeito Scheduling/outbox. Retenção inclui texto e não só Message | Restauração não pode executar novamente tools já efetivadas; consultar ledger do dono |
| KnowledgeDocument/Chunk e langgraph | Conhecimento versionado, memória permitida e checkpoints de sessão | Inventariar todas as tabelas do schema langgraph, relacionar thread_id ao tenant/conversa; reindexar somente conteúdo permitido; vetor antigo não é prova de consentimento | Remover contexto/vetores derivados de ignorados/revogação; sem reconstruir silenciosamente de backup expirado |
| Go instâncias/whatsmeow/messages/eventos | Transporte com autorização de alvo, envelope sanitizado e outbox | Preservar IDs de instância/JIDs/sessão do dispositivo; conferir armazenamento opcional de mensagens e eventual mídia. Não migrar regra de produto para Go | Substituir payload que carrega token somente após IA resolver credencial confiável; compatibilidade curta sanitiza antes de armazenar |
| Notificações/lembretes/retention inexistentes | BFF central/prefs, Scheduling regra/job de lembrete, IA entrega/conteúdo | Criar estado novo com defaults do vault; não gerar retroativamente lembretes/eventos comerciais sobre todo histórico | Job ligado à versão do appointment; pausar/cancelar sem apagar histórico de tentativas |

IDs de negócio são os do BFF; demais bancos preservam referência e só aceitam contexto autorizado. IDs externos sempre incluem provider/instância ou conta de origem e tenant no mapa. Não alterar telefone e usar esse novo valor como se fosse ID antigo do cliente.

## 10. Privacidade, histórico e descarte

- Retenção de conversa: opções 30/90/180/365 dias, default comercial90/pessoal30; confirmar redução conforme vault. Categoria Não classificadas não tem default explícito localizado: decisão de produto pendente em DECISIONS, sem purge automático inventado para esse grupo.
- Purge percorre Message.body/raw, attachments, ProcessedEvent.raw, texto/argumentos/resultados de runs/tools, Conversation.state, checkpoints langgraph, memória/embeddings derivados e cópias de transporte aplicáveis. Dados mínimos da conversa podem permanecer com indicador de conteúdo expirado. Histórico de agenda/snapshots não recebe TTL de conversa por conveniência.
- Ignorar IA impede novos usos e remove histórico anterior do contexto/índice aplicável. Não é pedido automático de apagar inbox; preservar visualização humana conforme vault. Notas/tags legadas sem permissão explícita iniciam sem uso pela IA.
- Credenciais de importação vivem cifradas durante sessão aberta, com acesso restrito ao módulo; apagar ao concluir/desistir. Staging guarda somente campos necessários à decisão, sanitizados; dados brutos transitórios são descartados após reconciliação/conclusão, enquanto mapas/proveniência/quantidades permanecem. Não armazenar tokens dentro de raw.
- Exclusão da conta é workflow de 7 dias: marcar pendente e impedir automações imediatamente, desligar canais por comandos duráveis, revogar sessão conforme UX; cancelamento dentro da janela restaura elegibilidade da conta, exigindo reconectar/testar antes de IA. Ao vencer, cada dono confirma cleanup idempotente. Não hard-delete BFF primeiro e abandonar órfãos nos demais bancos.
- Backups e retenção jurídica operacional não foram auditados. Antes de purge em produção, definir como restauração reaplica tombstones/expirações/consentimento, para que backup não ressuscite conteúdo expirado ou uma conta excluída. Não propor prazo legal com base em requisito de UI.

## 11. Gates de rollout e remoção

| Gate | Evidência objetiva para passar |
| --- | --- |
| M0 — inventário | Versões de migrations/bancos, contagens por tenant, backups com restore ensaiado, ownership e ambiguidades registrados; sem segredos no relatório |
| M1 — expand | Banco vazio e upgrade de cópia sintética representativa passam; constraints novas não fabricam dados; binário anterior compatível com expansão |
| M2 — readers | BFF/IA/frontend e jobs entendem novos campos/estados antes de produtores emiti-los; fixtures de replay antigo e schema incompatível testadas |
| M3 — backfill | Processo retomável por lote/tenant, contagens de entrada/saída, órfãos zero ou explicitamente isolados, null/preço/horário/histórico reconciliados |
| M4 — corte | Bloquear novos efeitos antigos, drenar pendentes, freeze da fonte remota quando aplicável, transferir controle exclusivamente à Agenda Atendly; testes funcionais/contratos verdes |
| M5 — observar | Nenhuma chamada ao writer legado, nenhuma divergência de outbox/projeção sem tratamento; erros e backlog dentro do limite medido no ensaio |
| M6 — retirar | Consumers, replays e jobs legados zerados ou arquivados; janela compatível encerrada e plano de restore seguro; então remover campos/rotas/código obsoletos |

Não há rollback automático para Minha Agenda. Depois de novas escritas incompatíveis, corrigir para frente ou voltar apenas a versão que entende schema expandido. Rollout não é convite a validar produto incompleto: toda validação com operação real aguarda o MVP completo.
