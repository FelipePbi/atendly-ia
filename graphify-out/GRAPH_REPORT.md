# Graph Report - atendly-ia  (2026-09-05)

## Corpus Check
- 369 files · ~563,054 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3077 nodes · 6747 edges · 192 communities (122 shown, 31 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9a0bb5da`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AppError
- assistant.service.ts
- InboundMessageProcessor.ts
- send_service.go
- ProductAgendaScreen.tsx
- atendly/provider.ts
- c0.go
- ProductDirectoryScreen.tsx
- message-graph.ts
- publicApiSchemas.ts
- ParseJID
- ProductMigrationScreen.tsx
- ProductSettingsScreen.tsx
- InstanceRepository
- AppError
- bff/src/modules/calendar/routes.ts
- whatsmeow.go
- evolutionWebhook.routes.ts
- internal/routes.ts
- EvolutionProvider.ts
- PreviewScreen.tsx
- ChannelInboundMessage
- AuthScreen.tsx
- .request
- minha-agenda/provider.ts
- WhatsmeowService
- UserService
- graph-state.ts
- calendar-migration-service.ts
- scripts
- onboarding/routes.ts
- InternalRequestContext
- SettingsScreen.tsx
- common/index.ts
- registry.ts
- knowledge-vector-store.ts
- evolution/index.ts
- Instance
- atendly-availability.ts
- scheduling-service/client.ts
- AssistantToolRegistry
- assistant-tools.ts
- "User"
- assistant-tools.test.ts
- LabelRepository
- DashboardScreen.tsx
- scheduling/index.ts
- MessageService
- getProductServices
- AgendaScreen.tsx
- DirectoryScreen.tsx
- dependencies
- bff/src/app.ts
- github.com/gin-gonic/gin.Context
- ProductRuntime.tsx
- politica-de-privacidade/page.tsx
- MinhaAgendaCalendarProvider
- Config
- ProductOnboardingScreen.tsx
- ConversationsScreen.tsx
- testing.T
- CommunityService
- AtendlyServiceService
- scripts
- contracts/package.json
- BffHttpClient.ts
- dependencies
- compilerOptions
- BffSettingsService.ts
- 20260511000000_init/migration.sql
- scripts
- EvolutionInboundMapper.ts
- NewsletterService
- SendHandler
- UserHandler
- compilerOptions
- devDependencies
- NewRouter
- webhookProducer
- GroupHandler
- PollService
- dependencies
- dependencies
- scripts
- AiOrchestratorClient
- bff/src/lib/phone.ts
- ChatService
- websocketProducer
- Logger
- NormalizeSubscriptions
- context.Context
- utils.go
- BffConversationService
- 20260828175825_init/migration.sql
- compilerOptions
- final-production-audit.mjs
- devDependencies
- devDependencies
- node_modules
- compilerOptions
- rabbitMQProducer
- LabelService
- compilerOptions
- bff/tsconfig.json
- CreateJID
- scripts
- fakeWhatsmeowService
- devDependencies
- ChatHandler
- MessageHandler
- BffAuthService.ts
- health-worker/package.json
- src/index.js
- LabelHandler
- NewsletterHandler
- include
- shouldConnectOnStartup
- legal-contract/index.js
- legal-contract/package.json
- typescript
- .run
- bff/package.json
- eslint
- CommunityHandler
- Middleware
- eslint-plugin-unused-imports
- onboarding/types.ts
- @prisma/client
- @types/node
- natsProducer
- BffServiceCatalogService.ts
- @prisma/adapter-pg
- next.config.ts
- lib
- 20260829180000_rag_pgvector/migration.sql
- check-legal-config.mjs
- agenda/layout.tsx
- clientes/layout.tsx
- configuracoes/layout.tsx
- conversas/layout.tsx
- inicio/layout.tsx
- migracao/layout.tsx
- servicos/layout.tsx
- send-sample-webhook.mjs
- frontend/eslint.config.mjs
- 20260828203000_add_calendar_mutation_idempotency/migration.sql
- .prettierrc.json
- build-all.sh
- "Conversation"
- "Message"
- "Conversation"
- "Conversation"
- github.com/EvolutionAPI/evolution-go

## God Nodes (most connected - your core abstractions)
1. `Instance` - 132 edges
2. `AppError` - 71 edges
3. `getProductServices()` - 59 edges
4. `WhatsmeowService` - 46 edges
5. `setupRouter()` - 45 edges
6. `InternalRequestContext` - 42 edges
7. `SchedulingClient` - 42 edges
8. `LoggerManager` - 41 edges
9. `registerManagementRoutes()` - 39 edges
10. `ParseJID()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `BufferedMessage` --references--> `ChannelInboundMessage`  [EXTRACTED]
  apps/ai-orchestrator/src/modules/channel/InboundMessageProcessor.ts → apps/ai-orchestrator/src/modules/channel/domain/ChannelMessage.ts
- `ToolExecutionContext` --references--> `BusinessContext`  [EXTRACTED]
  apps/ai-orchestrator/src/modules/tools/assistant-tools.ts → apps/ai-orchestrator/src/modules/tenant-config/business-context.ts
- `logout()` --calls--> `getProductServices()`  [EXTRACTED]
  apps/frontend/src/features/onboarding/ProductOnboardingScreen.tsx → apps/frontend/src/shared/runtime/ProductRuntime.tsx
- `registerV1AuthRoutes()` --indirect_call--> `requireTenantContext()`  [INFERRED]
  apps/bff/src/modules/auth/routes.ts → apps/bff/src/lib/tenant-context.ts
- `registerV1ConversationRoutes()` --indirect_call--> `requireTenantContext()`  [INFERRED]
  apps/bff/src/modules/conversations/routes.ts → apps/bff/src/lib/tenant-context.ts

## Import Cycles
- None detected.

## Communities (192 total, 31 thin omitted)

### Community 0 - "AppError"
Cohesion: 0.05
Nodes (66): buildApp(), registerHealthRoute(), env, envSchema, checkDatabaseConnection(), disconnectPrisma(), getPrisma(), availabilityQuerySchema (+58 more)

### Community 1 - "assistant.service.ts"
Cohesion: 0.05
Nodes (53): requireOpenAiEnv(), AiDecision, AiDecisionAction, AppointmentDraft, AssistantGraphAgentStep, AssistantGraphSession, AssistantGraphToolStep, AssistantService (+45 more)

### Community 2 - "InboundMessageProcessor.ts"
Cohesion: 0.07
Nodes (19): BufferedMessage, buildDebounceConfig(), ConversationMessageBuffer, getDebounceDelayMs(), HandoffPort, hasBufferedAutomation(), InboundMessageProcessor, InboundOutboundMessage (+11 more)

### Community 3 - "send_service.go"
Cohesion: 0.10
Nodes (33): convertAudioToOpusWithDuration(), convertAudioWithApi(), convertToWebP(), fetchLinkMetadata(), findURL(), MessageSendStruct, mapKeyType(), sectionsToString() (+25 more)

### Community 4 - "ProductAgendaScreen.tsx"
Cohesion: 0.06
Nodes (40): AvailabilitySlot, TimeBlock, addDays(), AgendaScenario, AppointmentDetail(), AppointmentList(), AppointmentRow(), BlockTime() (+32 more)

### Community 5 - "atendly/provider.ts"
Cohesion: 0.07
Nodes (22): CalendarAppointmentServiceItem, CalendarCustomerSummary, CalendarProvider, CancelCalendarAppointmentInput, CreateCalendarAppointmentInput, ListAppointmentsInput, RescheduleCalendarAppointmentInput, calendarAppointmentSchema (+14 more)

### Community 6 - "c0.go"
Cohesion: 0.06
Nodes (53): _2vm0(), _3qky(), _3tss(), _6yl(), ActivateIntegrity(), _bgrz(), ComputeSessionSeed(), _czg() (+45 more)

### Community 7 - "ProductDirectoryScreen.tsx"
Cohesion: 0.07
Nodes (25): Appointment, CalendarState, Customer, CustomerList, Service, ServiceList, addDays(), CustomerDetail() (+17 more)

### Community 8 - "message-graph.ts"
Cohesion: 0.12
Nodes (25): AiCommand, detectAiCommand(), InboundProcessingResult, MessageGraphStateUpdate, MessageGraphStateValue, classifyMessageIntent(), GraphAutomationPort, hasBufferedAutomation() (+17 more)

### Community 9 - "publicApiSchemas.ts"
Cohesion: 0.06
Nodes (38): aiToneSchema, appointmentSchema, availabilityRuleSchema, AvailabilitySettings, availabilitySlotSchema, businessProfileSchema, calendarCapabilitiesSchema, calendarIntegrationSchema (+30 more)

### Community 10 - "ParseJID"
Cohesion: 0.11
Nodes (22): AddParticipantStruct, validateMessageFields(), ParseJID(), go.mau.fi/whatsmeow.ParticipantChange, go.mau.fi/whatsmeow/types.GroupInfo, go.mau.fi/whatsmeow/types.GroupParticipant, go.mau.fi/whatsmeow/types.JID, CreateGroupStruct (+14 more)

### Community 11 - "ProductMigrationScreen.tsx"
Cohesion: 0.07
Nodes (28): steps, Migration, MigrationDiagnosis, Frame(), MigrationScreen(), Route(), SideNotes(), Status() (+20 more)

### Community 12 - "ProductSettingsScreen.tsx"
Cohesion: 0.10
Nodes (19): CalendarSettings(), SettingsHub(), sourceLabel(), toneLabel(), weekdayLabels, LinkPayload, Icon(), IconName (+11 more)

### Community 14 - "AppError"
Cohesion: 0.12
Nodes (28): PasswordResetDeliveryClient, AuthenticatedUser, clearSessionCookie(), currentUser(), requireAuth(), secretKey(), setSessionCookie(), signSession() (+20 more)

### Community 15 - "bff/src/modules/calendar/routes.ts"
Cohesion: 0.11
Nodes (34): dataResponse(), parseBody(), parseParams(), parseQuery(), requireTenantContext(), appointmentBodySchema, appointmentsQuerySchema, availabilityQuerySchema (+26 more)

### Community 16 - "whatsmeow.go"
Cohesion: 0.13
Nodes (15): GetMessageType(), GetStringValue(), UpdateUserInfo(), TestApplyWhatsAppVersionUpdatesLoginPayload(), applyWhatsAppVersion(), cleanSenderID(), fetchWhatsAppWebVersion(), getExtensionFromMimeType() (+7 more)

### Community 17 - "evolutionWebhook.routes.ts"
Cohesion: 0.10
Nodes (19): buildApp(), Env, envSchema, prisma, channelMessageLogContext(), toErrorMessage(), fetchJson(), HttpErrorDetails (+11 more)

### Community 18 - "internal/routes.ts"
Cohesion: 0.12
Nodes (23): startOfTodayInTimeZone(), AppError, ChannelConnectionService, BOT_OFF_PAUSE_UNTIL, HandoffPauseInput, HandoffTenantScope, aiTenantConfigSchema, contactNumber() (+15 more)

### Community 19 - "EvolutionProvider.ts"
Cohesion: 0.11
Nodes (20): ChannelMessageLogInput, DiagnosticLogger, maskPhone(), noopDiagnosticLogger, truncateDiagnostic(), buildHeaders(), buildSendTextBody(), EvolutionProvider (+12 more)

### Community 20 - "PreviewScreen.tsx"
Cohesion: 0.05
Nodes (27): OnboardingPage(), states, nextByKind, OnboardingScreen(), PrototypeOnboardingScreen(), isOnboardingScenario(), onboardingOrder, OnboardingScenario (+19 more)

### Community 21 - "ChannelInboundMessage"
Cohesion: 0.08
Nodes (31): AssistantReply, IncomingAssistantMessage, EVOLUTION_PROVIDER, ProvisionEvolutionChannelInput, UpdateAiTenantConfigInput, ChannelExecutionContext, ChannelInboundMessage, ChannelMessageKind (+23 more)

### Community 22 - "AuthScreen.tsx"
Cohesion: 0.09
Nodes (16): metadata, metadata, metadata, metadata, metadata, metadata, authErrorMessage(), AuthScenario (+8 more)

### Community 23 - ".request"
Cohesion: 0.10
Nodes (4): BffAuthService, BffCalendarService, BffSettingsService, BffWhatsAppService

### Community 24 - "minha-agenda/provider.ts"
Cohesion: 0.09
Nodes (32): AvailabilityInput, buildBusyIntervals(), computeAvailableSlots(), dayPrefixes, Interval, MigrationAvailabilityRule, migrationAvailabilityRules(), readBoolean() (+24 more)

### Community 25 - "WhatsmeowService"
Cohesion: 0.14
Nodes (27): setupRouter(), NewCallService(), NewChatService(), NewCommunityService(), NewNatsProducer(), NewRabbitMQProducer(), NewWebhookProducer(), TestProduceSendsOnlyToInstanceWebhookURL() (+19 more)

### Community 26 - "UserService"
Cohesion: 0.12
Nodes (18): UserCollection, go.mau.fi/whatsmeow/types.Blocklist, go.mau.fi/whatsmeow/types.PrivacySetting, go.mau.fi/whatsmeow/types.PrivacySettings, go.mau.fi/whatsmeow/types.ProfilePictureInfo, go.mau.fi/whatsmeow/types.VerifiedName, BlockStruct, CheckUserCollection (+10 more)

### Community 27 - "graph-state.ts"
Cohesion: 0.13
Nodes (12): GraphRuntimePort, PrismaGraphRuntime, GraphBufferedRecord, GraphConversationContext, GraphCustomerContext, GraphGuardDecision, GraphIntent, GraphResponse (+4 more)

### Community 28 - "calendar-migration-service.ts"
Cohesion: 0.07
Nodes (27): AtendlyCustomerService, CreateAtendlyCustomerInput, DatabaseClient, normalizeName(), activeStatuses, Analysis, CalendarMigrationService, CalendarSource (+19 more)

### Community 29 - "scripts"
Cohesion: 0.12
Nodes (15): engines, node, name, private, scripts, build, build:release, dev (+7 more)

### Community 30 - "onboarding/routes.ts"
Cohesion: 0.19
Nodes (23): getPrisma(), currentTenantContext(), assertTimezone(), internalSource(), onboardingState(), patchSchema, publicSource(), registerV1OnboardingRoutes() (+15 more)

### Community 31 - "InternalRequestContext"
Cohesion: 0.19
Nodes (3): InternalRequestContext, envelope(), SchedulingClient

### Community 32 - "SettingsScreen.tsx"
Cohesion: 0.09
Nodes (4): ProductSettingsScreen(), SettingsScreen(), SettingsScenario, SettingsService

### Community 33 - "common/index.ts"
Cohesion: 0.07
Nodes (19): ErrorResponse, errorResponseSchema, Id, idSchema, IsoDateTime, isoDateTimeSchema, currencyCodeSchema, Money (+11 more)

### Community 34 - "registry.ts"
Cohesion: 0.11
Nodes (11): BffHttpClient, BffHttpClientOptions, dashboardSchema, BffCustomerService, BffDashboardService, BffOnboardingService, BffServiceCatalogService, BffServiceRegistry (+3 more)

### Community 35 - "knowledge-vector-store.ts"
Cohesion: 0.09
Nodes (28): requireEnv(), InboundMessageProcessorOptions, EmbeddingProvider, KNOWLEDGE_EMBEDDING_DIMENSIONS, OpenAIEmbeddingProvider, requireEmbeddingEnv(), isOperationalKnowledgeQuery(), KNOWLEDGE_DOCUMENT_TYPES (+20 more)

### Community 36 - "evolution/index.ts"
Cohesion: 0.18
Nodes (14): booleanValue(), createDataSchema, DEFAULT_SUBSCRIPTIONS, envelope(), EvolutionClient, normalizeQrDataUrl(), pairDataSchema, qrDataSchema (+6 more)

### Community 37 - "Instance"
Cohesion: 0.05
Nodes (15): ProxyConfig, advancedUpdateCall, fakeInstanceService, AdvancedSettings, Instance, ConnectStruct, CreateStruct, fakeInstanceRepository (+7 more)

### Community 38 - "atendly-availability.ts"
Cohesion: 0.13
Nodes (26): AtendlyAvailability, BusyInterval, DatabaseClient, instantForMinute(), Interval, mergeIntervals(), resolveIntervals(), subtract() (+18 more)

### Community 39 - "scheduling-service/client.ts"
Cohesion: 0.15
Nodes (13): addDays(), todayInTimeZone(), appointmentSchema, extractUpstreamError(), normalizeBaseUrl(), parseJson(), requireContext(), SchedulingClient (+5 more)

### Community 40 - "AssistantToolRegistry"
Cohesion: 0.21
Nodes (4): AssistantToolRegistry, getLookupKey(), getLookupServices(), schedulingContext()

### Community 41 - "assistant-tools.ts"
Cohesion: 0.09
Nodes (24): addMinutesToTime(), AssistantToolCall, AvailabilityLookup, availableSlotsSchema, buildAppointmentComment(), calculateServiceBlockMinutes(), calculateTotalPrice(), cancelAppointmentSchema (+16 more)

### Community 42 - ""User""
Cohesion: 0.11
Nodes (17): "Conversation", "Message", "User", "UserSettings", "WhatsAppInstance", "UserProfile", "BusinessSettings", "AiSuppressionLog" (+9 more)

### Community 43 - "assistant-tools.test.ts"
Cohesion: 0.11
Nodes (13): SchedulingGateway, RescheduleAppointmentInput, ScheduleAppointmentInput, SchedulingAppointment, SchedulingAppointmentServiceItem, SchedulingCustomerSummary, SchedulingServiceDefinition, browService (+5 more)

### Community 44 - "LabelRepository"
Cohesion: 0.12
Nodes (8): SetDB(), NewLabelRepository(), NewMessageRepository(), gorm.io/gorm.DB, Label, Message, LabelRepository, MessageRepository

### Community 45 - "DashboardScreen.tsx"
Cohesion: 0.13
Nodes (12): BffHttpError, parseJson(), Dashboard, DashboardScreen(), formatCurrency(), formatDateTime(), ProductDashboardScreen(), RealDashboard() (+4 more)

### Community 46 - "scheduling/index.ts"
Cohesion: 0.13
Nodes (15): HttpMethod, InternalHttpClient, normalizedBaseUrl(), parseJson(), shouldRetry(), upstreamError(), appointmentSchema, availabilitySettingsSchema (+7 more)

### Community 47 - "MessageService"
Cohesion: 0.18
Nodes (11): MessageSendStruct, github.com/vincent-petithory/dataurl.DataURL, go.mau.fi/whatsmeow/proto/waE2E.ContextInfo, ChatPresenceStruct, DownloadMediaStruct, EditMessageStruct, MarkReadStruct, MessageService (+3 more)

### Community 48 - "getProductServices"
Cohesion: 0.09
Nodes (34): ConversationContext(), ConversationDetail(), mutate(), send(), ConversationFilter, conversationLabel(), ConversationList(), ConversationRow() (+26 more)

### Community 49 - "AgendaScreen.tsx"
Cohesion: 0.11
Nodes (9): AgendaMain(), AgendaScreen(), AppointmentForm(), subscribeCompact(), useCompactAgenda(), AgendaScenario, Appointment, CalendarService (+1 more)

### Community 50 - "DirectoryScreen.tsx"
Cohesion: 0.09
Nodes (20): Customer, CustomerScenario, CustomerService, DirectoryForm(), DirectoryProps, DirectoryScreen(), CatalogService, ServiceCatalogService (+12 more)

### Community 51 - "dependencies"
Cohesion: 0.14
Nodes (14): @atendly-ia/legal-contract, @atendly-ia/legal-contract, dependencies, @atendly-ia/legal-contract, clsx, next, react, react-dom (+6 more)

### Community 52 - "bff/src/app.ts"
Cohesion: 0.15
Nodes (12): buildApp(), Env, envSchema, ErrorCode, toErrorMessage(), redactRequestUrl(), SENSITIVE_QUERY_KEYS, disconnectPrisma() (+4 more)

### Community 53 - "github.com/gin-gonic/gin.Context"
Cohesion: 0.15
Nodes (5): authenticatedInstance(), authorizeInstanceTarget(), github.com/gin-gonic/gin.Context, GetLogsQuery, InstanceHandler

### Community 54 - "ProductRuntime.tsx"
Cohesion: 0.14
Nodes (13): metadata, viewport, Session, isAuthPath(), isOnboardingPath(), isPreviewPath(), isPublicDocument(), ProductRuntimeContext (+5 more)

### Community 55 - "politica-de-privacidade/page.tsx"
Cohesion: 0.18
Nodes (14): metadata, PrivacyPolicyPage(), metadata, TermsOfUsePage(), LegalDocumentLayout(), getLegalDetails(), LegalDetails, legalDetailSources (+6 more)

### Community 56 - "MinhaAgendaCalendarProvider"
Cohesion: 0.25
Nodes (6): CalendarAppointment, CalendarServiceDefinition, MinhaAgendaCalendarProvider, parseExternalId(), toCalendarAppointment(), MinhaAgendaService

### Community 57 - "Config"
Cohesion: 0.20
Nodes (13): initAuthDB(), initPostgresAuthDB(), main(), migrate(), serverPort(), ensureDBExists(), extractDBNameAndAdminDSN(), Config (+5 more)

### Community 58 - "ProductOnboardingScreen.tsx"
Cohesion: 0.09
Nodes (20): metadata, OnboardingState, draftFromState(), initialDraft, nextRequiredStep(), OnboardingDraft, OnboardingResume(), OnboardingRuntimeContext (+12 more)

### Community 59 - "ConversationsScreen.tsx"
Cohesion: 0.14
Nodes (11): ConversationDetail(), ConversationsScreen(), stateClass, stateEvent, stateLabel, threadState, ConversationService, ConversationsScenario (+3 more)

### Community 60 - "testing.T"
Cohesion: 0.23
Nodes (18): TestServerPort(), assertForbidden(), assertNoSecretsLeaked(), assertTargetNeverAccessed(), assertUnauthorized(), doRequest(), newFakeInstanceService(), newRequest() (+10 more)

### Community 61 - "CommunityService"
Cohesion: 0.42
Nodes (4): AddParticipantStruct, github.com/gin-gonic/gin.H, CommunityService, CreateCommunityStruct

### Community 62 - "AtendlyServiceService"
Cohesion: 0.15
Nodes (7): AtendlyServiceService, CreateAtendlyServiceInput, DatabaseClient, PriceType, serviceData(), toCalendarService(), UpdateAtendlyServiceInput

### Community 63 - "scripts"
Cohesion: 0.11
Nodes (17): engines, node, name, private, scripts, build:ai-orchestrator, build:all, build:bff (+9 more)

### Community 64 - "contracts/package.json"
Cohesion: 0.11
Nodes (17): import, types, dependencies, zod, exports, ./common, files, dist (+9 more)

### Community 65 - "BffHttpClient.ts"
Cohesion: 0.12
Nodes (14): BffRequestOptions, buildUrl(), createRequestId(), errorEnvelopeSchema, HttpMethod, isAbortError(), isSafeMethod(), normalizeBaseUrl() (+6 more)

### Community 66 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, bcryptjs, @fastify/cookie, @fastify/rate-limit, jose, pg, zod, pg (+5 more)

### Community 67 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+8 more)

### Community 68 - "BffSettingsService.ts"
Cohesion: 0.16
Nodes (10): AiTone, availabilitySettingsSchema, CalendarSource, onboardingStateSchema, settingsStateSchema, BffMigrationService, OnboardingPatch, AiSettingsInput (+2 more)

### Community 69 - "20260511000000_init/migration.sql"
Cohesion: 0.22
Nodes (13): "AiToolCall", "Conversation", "CustomerLink", "ExternalAppointment", "Handoff", "Message", "ProcessedEvent", "ToolCall" (+5 more)

### Community 70 - "scripts"
Cohesion: 0.10
Nodes (19): name, private, scripts, build, dev, format, format:check, knowledge:seed (+11 more)

### Community 71 - "EvolutionInboundMapper.ts"
Cohesion: 0.29
Nodes (12): normalizePhone(), phoneMatches(), booleanValue(), EvolutionInboundInspection, extractText(), inspectEvolutionInboundPayload(), isRecord(), mapEvolutionInbound() (+4 more)

### Community 72 - "NewsletterService"
Cohesion: 0.27
Nodes (7): go.mau.fi/whatsmeow/types.NewsletterMessage, go.mau.fi/whatsmeow/types.NewsletterMetadata, CreateNewsletterStruct, GetNewsletterInviteStruct, GetNewsletterMessagesStruct, GetNewsletterStruct, NewsletterService

### Community 75 - "compilerOptions"
Cohesion: 0.13
Nodes (15): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, module, moduleResolution (+7 more)

### Community 76 - "devDependencies"
Cohesion: 0.14
Nodes (14): typescript-eslint, typescript-eslint, typescript-eslint, devDependencies, eslint-config-next, prettier, @types/react, @types/react-dom (+6 more)

### Community 77 - "NewRouter"
Cohesion: 0.23
Nodes (7): NewCallHandler(), newRequestID(), NewRouter(), NewServerHandler(), CallHandler, ServerHandler, Routes

### Community 78 - "webhookProducer"
Cohesion: 0.36
Nodes (3): newRequestID(), time.Duration, webhookProducer

### Community 80 - "PollService"
Cohesion: 0.24
Nodes (7): NewPollHandler(), NewPollService(), postgresArrayToStringSlice(), stringArrayToPostgresArray(), database/sql.DB, PollHandler, PollService

### Community 81 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @fastify/cors, @langchain/core, @langchain/langgraph, @langchain/langgraph-checkpoint-postgres, @langchain/openai, pg, zod (+8 more)

### Community 82 - "dependencies"
Cohesion: 0.15
Nodes (13): dotenv, fastify, dotenv, fastify, dotenv, fastify, dependencies, dotenv (+5 more)

### Community 83 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, check, dev, format, format:check, lint, prisma:deploy (+5 more)

### Community 84 - "AiOrchestratorClient"
Cohesion: 0.19
Nodes (10): AiOrchestratorClient, conversationSchema, envelope(), messageSchema, registerV1ConversationRoutes(), platformSummary(), publicSchedulingDashboard(), registerV1DashboardRoutes() (+2 more)

### Community 85 - "bff/src/lib/phone.ts"
Cohesion: 0.31
Nodes (13): addBrazilianNinthDigit(), BRAZILIAN_DDDS, extractPhoneDigits(), isWhatsappGroup(), isWhatsappLid(), jidLocalPart(), normalizeBrazilianWhatsappPhone(), normalizeWhatsappJid() (+5 more)

### Community 86 - "ChatService"
Cohesion: 0.24
Nodes (7): BuildPollVoteFromEvent(), go.mau.fi/whatsmeow/proto/waE2E.PollVoteMessage, go.mau.fi/whatsmeow.SendResponse, go.mau.fi/whatsmeow/types.MessageInfo, BodyStruct, ChatService, HistorySyncRequestStruct

### Community 87 - "websocketProducer"
Cohesion: 0.30
Nodes (5): NewWebsocketProducer(), ServeWs(), github.com/gorilla/websocket.Conn, net/http.ResponseWriter, websocketProducer

### Community 88 - "Logger"
Cohesion: 0.28
Nodes (5): newLogger(), sanitizeLogMessage(), sync.Mutex, Logger, lumberjack.Logger

### Community 89 - "NormalizeSubscriptions"
Cohesion: 0.32
Nodes (4): IsEventType(), NormalizeSubscriptions(), contains(), resolveInstanceWebhookUrl()

### Community 90 - "context.Context"
Cohesion: 0.33
Nodes (6): generateFilePath(), NewMinioMediaStorage(), setBucketPolicy(), context.Context, minio.Client, MinioMediaStorage

### Community 91 - "utils.go"
Cohesion: 0.10
Nodes (18): BuildProxyAddress(), CreateHTTPProxy(), CreateSocks5Proxy(), Find(), GenerateRandomString(), GenerateVC(), VCardStruct, NormalizeProxyProtocol() (+10 more)

### Community 92 - "BffConversationService"
Cohesion: 0.19
Nodes (4): conversationSchema, messageSchema, BffConversationService, ConversationQuery

### Community 93 - "20260828175825_init/migration.sql"
Cohesion: 0.21
Nodes (12): "Appointment", "AppointmentItem", "AvailabilityException", "AvailabilityRule", "CalendarSettings", "Customer", "ExternalEntityMap", "IntegrationConnection" (+4 more)

### Community 94 - "compilerOptions"
Cohesion: 0.15
Nodes (13): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir (+5 more)

### Community 95 - "final-production-audit.mjs"
Cohesion: 0.29
Nodes (12): auditProductionHealth(), check(), count(), expectedServices, joinSources(), main(), matchingFiles(), read() (+4 more)

### Community 96 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, prettier, prisma, tsx, vitest, prettier, tsx, vitest (+3 more)

### Community 97 - "devDependencies"
Cohesion: 0.17
Nodes (12): @eslint/js, devDependencies, @eslint/js, prettier, tsx, vitest, @eslint/js, prettier (+4 more)

### Community 98 - "node_modules"
Cohesion: 0.17
Nodes (10): exclude, include, dist, src/**/*.ts, node_modules, exclude, include, dist (+2 more)

### Community 99 - "compilerOptions"
Cohesion: 0.17
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 101 - "LabelService"
Cohesion: 0.33
Nodes (4): ChatLabelStruct, EditLabelStruct, LabelService, MessageLabelStruct

### Community 102 - "compilerOptions"
Cohesion: 0.17
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 103 - "bff/tsconfig.json"
Cohesion: 0.18
Nodes (9): exclude, include, dist, src/**/*.d.ts, src/**/*.ts, exclude, include, dist (+1 more)

### Community 104 - "CreateJID"
Cohesion: 0.20
Nodes (10): NewJIDValidationMiddleware(), CreateJID(), formatBRNumber(), formatMXOrARNumber(), TestCreateJID(), TestFormatBRNumber(), TestFormatMXOrARNumber(), TestParseJID() (+2 more)

### Community 105 - "scripts"
Cohesion: 0.11
Nodes (17): engines, node, name, private, scripts, build, dev, format (+9 more)

### Community 106 - "fakeWhatsmeowService"
Cohesion: 0.14
Nodes (3): TestConnectPreservesExistingConfigurationOnEmptyPayload(), TestStatusStructSerializesConnectedPhoneJID(), fakeWhatsmeowService

### Community 107 - "devDependencies"
Cohesion: 0.14
Nodes (14): eslint-plugin-simple-import-sort, @types/pg, eslint-plugin-simple-import-sort, @types/pg, eslint-plugin-simple-import-sort, @types/pg, eslint-plugin-simple-import-sort, devDependencies (+6 more)

### Community 110 - "BffAuthService.ts"
Cohesion: 0.20
Nodes (9): loginResultSchema, messageResultSchema, okSchema, registerResultSchema, sessionSchema, ChangePasswordInput, LoginInput, RegisterInput (+1 more)

### Community 111 - "health-worker/package.json"
Cohesion: 0.20
Nodes (9): engines, node, name, private, scripts, check, start, type (+1 more)

### Community 112 - "src/index.js"
Cohesion: 0.29
Nodes (8): checkTarget(), defaultTargets, hostnameFromUrl(), nowIso(), parseTargets(), pollOnce(), PORT, server

### Community 115 - "include"
Cohesion: 0.22
Nodes (8): exclude, include, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, **/*.ts, **/*.tsx

### Community 116 - "shouldConnectOnStartup"
Cohesion: 0.33
Nodes (4): TestResolveInstanceWebhookUrl(), TestShouldConnectOnStartup(), isTransientStartupDisconnectReason(), shouldConnectOnStartup()

### Community 117 - "legal-contract/index.js"
Cohesion: 0.25
Nodes (7): CURRENT_LEGAL_VERSIONS, PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_LAST_UPDATED_DATE, PRIVACY_POLICY_VERSION, TERMS_EFFECTIVE_DATE, TERMS_LAST_UPDATED_DATE, TERMS_VERSION

### Community 118 - "legal-contract/package.json"
Cohesion: 0.25
Nodes (7): exports, main, name, private, type, types, version

### Community 119 - "typescript"
Cohesion: 0.29
Nodes (7): typescript, typescript, typescript, typescript, typescript, devDependencies, typescript

### Community 120 - ".run"
Cohesion: 0.38
Nodes (4): isDomainFailure(), isRecord(), isStructuredToolResult(), resultContext()

### Community 121 - "bff/package.json"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 122 - "eslint"
Cohesion: 0.40
Nodes (5): eslint, eslint, eslint, eslint, eslint

### Community 124 - "Middleware"
Cohesion: 0.47
Nodes (3): NewMiddleware(), Middleware, InstanceService

### Community 125 - "eslint-plugin-unused-imports"
Cohesion: 0.40
Nodes (5): eslint-plugin-unused-imports, eslint-plugin-unused-imports, eslint-plugin-unused-imports, eslint-plugin-unused-imports, eslint-plugin-unused-imports

### Community 126 - "onboarding/types.ts"
Cohesion: 0.33
Nodes (3): CalendarSource, OnboardingDraft, OnboardingService

### Community 127 - "@prisma/client"
Cohesion: 0.50
Nodes (4): @prisma/client, @prisma/client, @prisma/client, @prisma/client

### Community 129 - "@types/node"
Cohesion: 0.40
Nodes (5): @types/node, @types/node, @types/node, @types/node, @types/node

### Community 131 - "BffServiceCatalogService.ts"
Cohesion: 0.40
Nodes (4): serviceListSchema, serviceSchema, ServiceInput, UpdateServiceInput

### Community 133 - "@prisma/adapter-pg"
Cohesion: 0.50
Nodes (4): @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg

### Community 137 - "lib"
Cohesion: 0.50
Nodes (4): lib, dom, dom.iterable, esnext

## Knowledge Gaps
- **564 isolated node(s):** `GetLogsQuery`, `MinhaAgendaConnectionRecord`, `AiDecision`, `AiDecisionAction`, `AppointmentDraft` (+559 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 905 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Instance` connect `Instance` to `send_service.go`, `LabelService`, `c0.go`, `NewsletterService`, `fakeWhatsmeowService`, `ParseJID`, `LabelRepository`, `InstanceRepository`, `MessageService`, `shouldConnectOnStartup`, `github.com/gin-gonic/gin.Context`, `ChatService`, `NormalizeSubscriptions`, `UserService`, `utils.go`, `CommunityService`, `WhatsmeowService`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `DiagnosticLogger` connect `EvolutionProvider.ts` to `message-graph.ts`, `assistant.service.ts`, `InboundMessageProcessor.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `AppError` connect `AppError` to `atendly/provider.ts`, `atendly-availability.ts`, `minha-agenda/provider.ts`, `MinhaAgendaCalendarProvider`, `calendar-migration-service.ts`, `AtendlyServiceService`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `GetLogsQuery`, `MinhaAgendaConnectionRecord`, `AiDecision` to the rest of the system?**
  _564 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AppError` be split into smaller, more focused modules?**
  _Cohesion score 0.05335628227194492 - nodes in this community are weakly interconnected._
- **Should `assistant.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0547945205479452 - nodes in this community are weakly interconnected._
- **Should `InboundMessageProcessor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06565656565656566 - nodes in this community are weakly interconnected._