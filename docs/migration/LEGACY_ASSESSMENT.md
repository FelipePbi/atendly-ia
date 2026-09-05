# Diagnóstico do legado

Baseline inspecionado: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`, em 2026-09-05. Este diagnóstico descreve implementação e limitações; a fonte soberana de comportamento continua sendo `docs/product-vault/`. Referências a regras substituídas identificam divergências, não requisitos futuros.

## Método e estado da auditoria

- **Fato**: observado no código ou em saída de ferramenta recuperada. **Inferência**: consequência técnica provável, sem reprodução em ambiente externo. **Divergência**: conflito com regra vigente do Product Vault. **Reuso**: parte útil condicionada à adequação indicada.
- Riscos: **crítico** ameaça isolamento/autorização ou integridade operacional; **alto** pode perder mensagem, produzir ação/resposta incorreta ou violar regra central; **médio** reduz confiabilidade/manutenção; **baixo** acabamento ou melhoria localizada. Classificação não prova exploração/incidente.
- A execução é somente documental. Não foram acessados bancos de produção nem estado real do deploy.
- Recuperação seletiva de saídas de ferramentas da execução interrompida evita tratar trabalho parcial como concluído. Graphify é usado somente como mapa do código; não houve rebuild ou gravação no grafo.

## Conceitos substituídos e consumidores que impedem remoção imediata

| Conceito legado | Evidência atual | Consumidores / impedimento | Destino e critério de saída |
| --- | --- | --- | --- |
| Escolha de agenda operacional | Scheduling `calendar-service.ts:127`, provider-factory; `CalendarSettings.source` | APIs de agenda/catálogo/clientes, BFF clients, IA SchedulingClient, frontend calendar/settings/onboarding/dashboard | REMOVE seletor de provider após consumidores e dados reconciliados; somente Agenda Atendly operacional |
| Minha Agenda com escrita, disponibilidade e credencial permanentes | `integrations/minha-agenda/client.ts` e `provider.ts`; IntegrationConnection | Appointment create/reschedule/cancel, disponibilidade, reconnect, settings | REMOVE operações; REUSE FOR IMPORT leitores/cifra após adequação. Nunca fallback remoto |
| Troca de fonte travestida de importação | `calendar-migration-service.ts:433/572/587` exige vazio e auto-conclui/corta | BFF `/calendar/migrations`, ProductMigrationScreen, source/target DTOs e replays | REPLACE orquestração por sessão única explícita; preservar jobs/maps históricos e credenciais necessárias à reconciliação |
| Contrato reverso | Source/target genéricos e UX/DTOs de migração | Parsers frontend/BFF; provider interno só implementa direção específica | REMOVE contrato reverso. Existência no DTO não prova migração reversa implementada |
| Dois tons | Enum PROFESSIONAL_OBJECTIVE/LIGHT_CLOSE em BFF e IA; schemas frontend/BFF | Onboarding, Settings, provisionamento, prompt e dados persistidos | REPLACE por três estilos, leitores antes de novos valores; default Equilibrada. Mapeamento histórico explícito em DECISIONS |
| Onboarding exige WhatsApp | BFF `onboarding/routes.ts:173/195`, ProductOnboardingScreen | Sessão/redirect frontend, completion gate, AI enabled | REFACTOR completion separado de activation; não apagar completion histórico nem reabrir wizard |
| Ativação por booleano | Settings enabled e cópia AiTenantConfig sem teste real persistido | UI status, webhook guard, onboarding e reconnect | REPLACE prova de aptidão/ativação; enabled sozinho nunca comprova IA ativa |
| Pessoa identificada por telefone | Customer `(tenantId,normalizedPhone)` único e upsert | Cadastro, tools de IA, busca futura e importação | REFACTOR para pessoa por ID; número como contato não exclusivo; eliminar consumers de unicidade antes do índice |
| Classificação do agente como inbox | Classificações dentro de Conversation.state; status ACTIVE/HUMAN_HANDOFF/CLOSED | Prompt/contexto e filtros da inbox | REFACTOR manter dados legados como proveniência, criar categoria comercial/não classificada/pessoal e override manual |
| Pausa por comandos/timeout genérico | `message-graph.ts:273`, HandoffService, handoffPausedUntil | Guard IA, `/bot on/off`, `/ia_pause`, takeover/release | REFACTOR para sessão, envio humano pausa, retorno explícito na sessão e nova sessão após 24h conforme vault |
| Não textual genérico | `message-graph.ts:269/401` | Mapper, agent e resposta WhatsApp | REPLACE por áudio compreendido, imagem→humano, documento visível sem interpretação |
| Clientes escondidos e estado conectado presumido | AppShell `:68/269/310` | Todas as telas que usam shell e não passam estado | REPLACE navegação mobile e estado real compartilhado |
| Visual anterior | `shared/styles/atendly.css`: Inter/IBM Plex Mono | Features reais, previews, ícones/componentes atuais | REPLACE tokens/composição por Recepção; REFACTOR primitivas funcionais úteis |
| Métricas não aprovadas | `estimatedRevenueToday` em SchedulingClient/dashboard; telas antigas | Dashboard DTO/parser/copy | REMOVE da Home principal; novos indicadores só fatos operacionais aprovados |
| Recuperação de senha real fora do MVP | BFF auth forgot/reset, AuthScreen | Rotas públicas, PasswordResetToken e delivery client | Manter código temporariamente isolado; não apresentar envio real no MVP. Retirada exige checar uso implantado; não ampliar escopo |
| Ignorar IA removido em cleanup antigo | BFF migration `20260831220000_goal17_legacy_cleanup` DROP IgnoredContact | Banco implantado pode já ter perdido essa tabela; schema atual sem substituto | CREATE proteção vigente; recuperar dados de backup somente se disponíveis, jamais fingir preservação |

Matriz detalhada de Minha Agenda e dependências: [DATA_MIGRATION §3](DATA_MIGRATION.md#3-minha-agenda-matriz-de-destino). Manter temporariamente significa compatibilidade de engenharia com dono e saída definidos; não autoriza novo modo híbrido ou sincronização.

## Dívida técnica que não é conceito de produto antigo

| Dívida | Evidência / risco | Tratamento arquitetural |
| --- | --- | --- |
| Alvo de instância não autorizado | Go routes `:132/133`, handlers `:589/619`, Auth `:21`; risco crítico de outra instância | Corrigir vínculo token→alvo antes de ampliar integração; escopo do Goal 001 |
| ACK sem inbox durável | Webhook IA `:77–99`; alto risco de perda | Persistir evento sanitizado e estado antes de ACK, retomada durável |
| Dedupe antecipado sem estado de execução | IdempotencyStore `:8–24`, ProcessedEvent | Dedupe de recebimento separado de resultado; retries retomam etapa, não descartam falha como já processada |
| Debounce por processor de request | InboundMessageProcessor `:154`, webhook `:60` | Coordenar janela/versão por conversa, com execução serializada e verificação antes de efeitos |
| Pausa manual incompleta e inbox interrompida | Graph `:206/273`, assistant `:622` | Armazenar mensagens independentemente da decisão de IA; controle humano autoritativo |
| Outbound sem estado de entrega | Graph `:581–631`, internal routes `:174–208` | Outbox/status pending/sent/failed/unknown; timeout não apaga prova de tentativa nem autoriza envio cego |
| Replay separado de agendamento | Scheduling idempotency `:34–35` | Persistir efeito e resultado recuperável juntos; chave/payload estáveis |
| Locks parciais | Provider Serializable/advisory; time-block não participa | Reusar e estender política única a todos os escritores; não alegar ausência total de lock |
| Configuração duplicada sem reconciliação | Settings BFF commit→syncAi | BFF dono de configuração desejada; projeção versionada/entrega durável e estado efetivo distinto |
| Segredos no raw/log de transporte | Go webhook imprime URL; payload carrega instanceToken; IA guarda raw | Envelope autenticado sem segredo no corpo persistido; redaction em todas as superfícies e credencial resolvida pelo vínculo confiável |
| Falta retenção em persistências auxiliares | Message/ProcessedEvent/AiRun/AiToolCall e schema langgraph | Política de conteúdo abrangendo cópias, checkpoints, vetores e transporte; apagar somente Message é insuficiente |
| Gaps de validação | IA 39/1; BFF teste pulado/rota antiga; Scheduling/frontend sem suites próprias | Gate verificável e testes orientados a risco, sem confundir regex com E2E |

## Partes que não devem ser chamadas de legado descartável

Manter fronteiras HTTP e ownership já úteis; autenticação BFF e membership derivado; FKs compostas; locks e snapshots locais; gateway de Scheduling acessado pelas tools; LangGraph como workflow; pgvector com filtros tenant/ACTIVE; run/tool audit; transporte Evolution separado; health-worker de sondas; client BFF e estados UI. Cada mecanismo exige adequação/testes, mas sua substituição total não tem justificativa na evidência.

O Product Vault não impõe consolidação física de banco/serviços. O protótipo não impõe estrutura React. A ausência de uma função de produto também não torna toda a aplicação descartável.

## Política de retirada e incertezas

1. Novo contrato e dono definidos; adicionar leitores compatíveis.
2. Migrar dados/consumidores, incluindo pending state, replays e jobs; validar com duas identidades de tenant.
3. Cortar o escritor legado; comprovar ausência de chamadas e reconciliação de dados.
4. Encerrar janela de rollback compatível; remover rotas/types/colunas sem consumidor. Não editar migrations já aplicadas para reescrever história.

Não verificados: uso real de password reset, tenants ainda na origem remota, disponibilidade de backup dos contatos ignorados removidos e capacidades completas da origem externa. Esses pontos são condições de execução, não motivos para preservar indefinidamente regras substituídas.
