# Graph Report - atendly-ia  (2026-09-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3039 nodes · 6639 edges · 196 communities (126 shown, 31 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0559981e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 149
- Community 152
- Community 153
- Community 154
- Community 159
- Community 161
- Community 167
- Community 168
- Community 195

## God Nodes (most connected - your core abstractions)
1. `Instance` - 119 edges
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
- `ToolExecutionContext` --references--> `BusinessContext`  [EXTRACTED]
  apps/ai-orchestrator/src/modules/tools/assistant-tools.ts → apps/ai-orchestrator/src/modules/tenant-config/business-context.ts
- `logout()` --calls--> `getProductServices()`  [EXTRACTED]
  apps/frontend/src/features/onboarding/ProductOnboardingScreen.tsx → apps/frontend/src/shared/runtime/ProductRuntime.tsx
- `registerV1AuthRoutes()` --indirect_call--> `requireTenantContext()`  [INFERRED]
  apps/bff/src/modules/auth/routes.ts → apps/bff/src/lib/tenant-context.ts
- `registerV1ConversationRoutes()` --indirect_call--> `requireTenantContext()`  [INFERRED]
  apps/bff/src/modules/conversations/routes.ts → apps/bff/src/lib/tenant-context.ts
- `registerV1DashboardRoutes()` --indirect_call--> `requireTenantContext()`  [INFERRED]
  apps/bff/src/modules/dashboard/routes.ts → apps/bff/src/lib/tenant-context.ts

## Import Cycles
- None detected.

## Communities (196 total, 31 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (66): buildApp(), registerHealthRoute(), env, envSchema, checkDatabaseConnection(), disconnectPrisma(), getPrisma(), availabilityQuerySchema (+58 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (53): requireOpenAiEnv(), AiDecision, AiDecisionAction, AppointmentDraft, AssistantGraphAgentStep, AssistantGraphSession, AssistantGraphToolStep, AssistantService (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (36): AssistantReply, ChannelInboundMessage, AutomationPort, BufferedMessage, buildDebounceConfig(), ConversationMessageBuffer, getDebounceDelayMs(), HandoffPort (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (33): convertAudioToOpusWithDuration(), convertAudioWithApi(), convertToWebP(), fetchLinkMetadata(), findURL(), MessageSendStruct, mapKeyType(), sectionsToString() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (40): AvailabilitySlot, TimeBlock, addDays(), AgendaScenario, AppointmentDetail(), AppointmentList(), AppointmentRow(), BlockTime() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (23): AtendlyAvailability, CalendarAppointmentServiceItem, CalendarCustomerSummary, CalendarProvider, CancelCalendarAppointmentInput, CreateCalendarAppointmentInput, ListAppointmentsInput, RescheduleCalendarAppointmentInput (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (42): _2vm0(), _3qky(), _3tss(), _6yl(), ActivateIntegrity(), _bgrz(), ComputeSessionSeed(), _czg() (+34 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (34): Appointment, CalendarState, Customer, CustomerList, Service, ServiceList, addDays(), CustomerDetail() (+26 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (25): AiCommand, detectAiCommand(), InboundProcessingResult, MessageGraphStateUpdate, MessageGraphStateValue, classifyMessageIntent(), GraphAutomationPort, hasBufferedAutomation() (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (38): aiToneSchema, appointmentSchema, availabilityRuleSchema, AvailabilitySettings, availabilitySlotSchema, businessProfileSchema, calendarCapabilitiesSchema, calendarIntegrationSchema (+30 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (26): AddParticipantStruct, validateMessageFields(), UserCollection, ParseJID(), UserCollection, go.mau.fi/whatsmeow.ParticipantChange, go.mau.fi/whatsmeow/types.GroupInfo, go.mau.fi/whatsmeow/types.GroupParticipant (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (27): steps, Migration, MigrationDiagnosis, Frame(), MigrationScreen(), Route(), SideNotes(), Status() (+19 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (31): AccountSettings(), changePassword(), logout(), AiSettings(), save(), AvailabilitySettings(), save(), BusinessSettings() (+23 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (5): NewInstanceRepository(), AdvancedSettings, Instance, InstanceRepository, fakeInstanceRepository

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (30): PasswordResetDeliveryClient, AuthenticatedUser, clearSessionCookie(), currentUser(), requireAuth(), secretKey(), setSessionCookie(), signSession() (+22 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (34): dataResponse(), parseBody(), parseParams(), parseQuery(), requireTenantContext(), appointmentBodySchema, appointmentsQuerySchema, availabilityQuerySchema (+26 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (26): IsEventType(), NormalizeSubscriptions(), BuildProxyAddress(), Find(), GetMessageType(), GetStringValue(), NormalizeProxyProtocol(), UpdateUserInfo() (+18 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (22): buildApp(), Env, envSchema, requireEnv(), prisma, channelMessageLogContext(), toErrorMessage(), graphToolFailure() (+14 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (27): startOfTodayInTimeZone(), AppError, ChannelConnectionService, EVOLUTION_PROVIDER, ProvisionEvolutionChannelInput, MappedChannelInboundMessage, BOT_OFF_PAUSE_UNTIL, HandoffPauseInput (+19 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (24): ChannelMessageLogInput, DiagnosticLogger, maskPhone(), noopDiagnosticLogger, truncateDiagnostic(), fetchJson(), HttpErrorDetails, HttpMethod (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (21): OnboardingPage(), states, isOnboardingScenario(), agendaPreview, authPreview, conversationsPreview, customerPreview, dashboardPreview (+13 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (23): IncomingAssistantMessage, UpdateAiTenantConfigInput, ChannelExecutionContext, ChannelMessageKind, KnowledgeSearchResult, RawKnowledgeSearchRow, buildHandoffPrompt(), buildKnowledgePrompt() (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (15): metadata, metadata, metadata, metadata, metadata, metadata, authErrorMessage(), AuthScenario (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (4): BffAuthService, BffCalendarService, BffSettingsService, BffWhatsAppService

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (15): AvailabilityInput, buildUrl(), createMinhaAgendaClient(), fetchJson(), MinhaAgendaClient, TokenCache, MinhaAgendaConnectionConfig, AppointmentRangeQuery (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.16
Nodes (21): setupRouter(), NewCallService(), NewChatService(), AddParticipantStruct, NewCommunityService(), NewNatsProducer(), NewGroupService(), NewInstanceService() (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (15): go.mau.fi/whatsmeow/types.Blocklist, go.mau.fi/whatsmeow/types.PrivacySetting, go.mau.fi/whatsmeow/types.PrivacySettings, go.mau.fi/whatsmeow/types.ProfilePictureInfo, BlockStruct, CheckUserCollection, CheckUserStruct, ContactInfo (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (15): nextByKind, OnboardingScreen(), PrototypeOnboardingScreen(), flow, onboardingError(), ProductOnboardingScreen(), go(), logout() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (20): activeStatuses, Analysis, CalendarMigrationService, CalendarSource, count(), databaseTime(), deduplicateConflicts(), diagnoseSnapshot() (+12 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (29): @atendly-ia/legal-contract, @atendly-ia/legal-contract, dependencies, @atendly-ia/legal-contract, clsx, next, react, react-dom (+21 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (25): getPrisma(), currentTenantContext(), platformSummary(), publicSchedulingDashboard(), registerV1DashboardRoutes(), settled(), whatsappSummary(), assertTimezone() (+17 more)

### Community 31 - "Community 31"
Cohesion: 0.19
Nodes (3): InternalRequestContext, envelope(), SchedulingClient

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (4): ProductSettingsScreen(), SettingsScreen(), SettingsScenario, SettingsService

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (19): ErrorResponse, errorResponseSchema, Id, idSchema, IsoDateTime, isoDateTimeSchema, currencyCodeSchema, Money (+11 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (11): BffHttpClient, BffHttpClientOptions, dashboardSchema, BffCustomerService, BffDashboardService, BffOnboardingService, BffServiceCatalogService, BffServiceRegistry (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (19): InboundMessageProcessorOptions, EmbeddingProvider, isOperationalKnowledgeQuery(), KNOWLEDGE_DOCUMENT_TYPES, KnowledgeChunkInput, KnowledgeDocumentStatus, KnowledgeDocumentType, KnowledgeIndexDocumentInput (+11 more)

### Community 36 - "Community 36"
Cohesion: 0.16
Nodes (18): booleanValue(), createDataSchema, DEFAULT_SUBSCRIPTIONS, envelope(), EvolutionClient, normalizeQrDataUrl(), pairDataSchema, qrDataSchema (+10 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (10): ProxyConfig, ConnectStruct, CreateStruct, ForceReconnectStruct, instances, PairReturnStruct, PairStruct, QrcodeStruct (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (23): BusyInterval, DatabaseClient, instantForMinute(), Interval, mergeIntervals(), resolveIntervals(), subtract(), addDays() (+15 more)

### Community 39 - "Community 39"
Cohesion: 0.15
Nodes (13): addDays(), todayInTimeZone(), appointmentSchema, extractUpstreamError(), normalizeBaseUrl(), parseJson(), requireContext(), SchedulingClient (+5 more)

### Community 40 - "Community 40"
Cohesion: 0.21
Nodes (4): AssistantToolRegistry, getLookupKey(), getLookupServices(), schedulingContext()

### Community 41 - "Community 41"
Cohesion: 0.09
Nodes (24): addMinutesToTime(), AssistantToolCall, AvailabilityLookup, availableSlotsSchema, buildAppointmentComment(), calculateServiceBlockMinutes(), calculateTotalPrice(), cancelAppointmentSchema (+16 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (17): "Conversation", "Message", "User", "UserSettings", "WhatsAppInstance", "UserProfile", "BusinessSettings", "AiSuppressionLog" (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (13): SchedulingGateway, RescheduleAppointmentInput, ScheduleAppointmentInput, SchedulingAppointment, SchedulingAppointmentServiceItem, SchedulingCustomerSummary, SchedulingServiceDefinition, browService (+5 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (8): SetDB(), NewLabelRepository(), NewMessageRepository(), gorm.io/gorm.DB, Label, Message, LabelRepository, MessageRepository

### Community 45 - "Community 45"
Cohesion: 0.11
Nodes (16): Dashboard, DashboardScreen(), formatCurrency(), formatDateTime(), ProductDashboardScreen(), RealDashboard(), scenarioContent, DashboardScenario (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (17): conversationSchema, messageSchema, HttpMethod, InternalHttpClient, normalizedBaseUrl(), parseJson(), shouldRetry(), upstreamError() (+9 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (14): MessageSendStruct, CreateHTTPProxy(), github.com/vincent-petithory/dataurl.DataURL, go.mau.fi/whatsmeow/proto/waE2E.ContextInfo, net/http.Request, net/url.URL, ChatPresenceStruct, DownloadMediaStruct (+6 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (17): ConversationContext(), ConversationDetail(), mutate(), send(), ConversationFilter, conversationLabel(), ConversationList(), ConversationRow() (+9 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (9): AgendaMain(), AgendaScreen(), AppointmentForm(), subscribeCompact(), useCompactAgenda(), AgendaScenario, Appointment, CalendarService (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (11): Customer, CustomerScenario, CustomerService, DirectoryForm(), DirectoryProps, DirectoryScreen(), CatalogService, ServiceCatalogService (+3 more)

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (16): AvailableSlot, GetAvailabilityInput, buildBusyIntervals(), computeAvailableSlots(), dayPrefixes, Interval, MigrationAvailabilityRule, migrationAvailabilityRules() (+8 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (10): buildApp(), Env, envSchema, toErrorMessage(), redactRequestUrl(), SENSITIVE_QUERY_KEYS, disconnectPrisma(), checkHealth() (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.16
Nodes (3): github.com/gin-gonic/gin.Context, GetLogsQuery, InstanceHandler

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (15): metadata, viewport, BffHttpError, parseJson(), Session, isAuthPath(), isOnboardingPath(), isPreviewPath() (+7 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (14): metadata, PrivacyPolicyPage(), metadata, TermsOfUsePage(), LegalDocumentLayout(), getLegalDetails(), LegalDetails, legalDetailSources (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (8): CalendarAppointment, CalendarServiceDefinition, appointmentServices(), MinhaAgendaCalendarProvider, parseExternalId(), toCalendarAppointment(), toCalendarService(), MinhaAgendaService

### Community 57 - "Community 57"
Cohesion: 0.19
Nodes (14): initAuthDB(), initPostgresAuthDB(), main(), migrate(), serverPort(), ensureDBExists(), extractDBNameAndAdminDSN(), Config (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.14
Nodes (12): metadata, OnboardingState, draftFromState(), initialDraft, nextRequiredStep(), OnboardingDraft, OnboardingResume(), OnboardingRuntimeContext (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.14
Nodes (11): ConversationDetail(), ConversationsScreen(), stateClass, stateEvent, stateLabel, threadState, ConversationService, ConversationsScenario (+3 more)

### Community 60 - "Community 60"
Cohesion: 0.14
Nodes (13): TestServerPort(), TestConnectPreservesExistingConfigurationOnEmptyPayload(), TestStatusStructSerializesConnectedPhoneJID(), TestNormalizeSubscriptions(), formatBRNumber(), formatMXOrARNumber(), TestCreateJID(), TestFormatBRNumber() (+5 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (8): AtendlyCustomerService, CreateAtendlyCustomerInput, DatabaseClient, normalizeName(), MinhaAgendaCustomer, digitsOnly(), normalizePhone(), phoneMatches()

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (7): AtendlyServiceService, CreateAtendlyServiceInput, DatabaseClient, PriceType, serviceData(), toCalendarService(), UpdateAtendlyServiceInput

### Community 63 - "Community 63"
Cohesion: 0.11
Nodes (17): engines, node, name, private, scripts, build:ai-orchestrator, build:all, build:bff (+9 more)

### Community 64 - "Community 64"
Cohesion: 0.11
Nodes (17): import, types, dependencies, zod, exports, ./common, files, dist (+9 more)

### Community 65 - "Community 65"
Cohesion: 0.12
Nodes (14): BffRequestOptions, buildUrl(), createRequestId(), errorEnvelopeSchema, HttpMethod, isAbortError(), isSafeMethod(), normalizeBaseUrl() (+6 more)

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (16): @fastify/cors, dependencies, bcryptjs, @fastify/cookie, @fastify/cors, @fastify/rate-limit, jose, pg (+8 more)

### Community 67 - "Community 67"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+8 more)

### Community 68 - "Community 68"
Cohesion: 0.16
Nodes (10): AiTone, availabilitySettingsSchema, CalendarSource, onboardingStateSchema, settingsStateSchema, BffMigrationService, OnboardingPatch, AiSettingsInput (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.22
Nodes (13): "AiToolCall", "Conversation", "CustomerLink", "ExternalAppointment", "Handoff", "Message", "ProcessedEvent", "ToolCall" (+5 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (15): scripts, build, dev, format, format:check, knowledge:seed, lint, prisma:deploy (+7 more)

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (12): normalizePhone(), phoneMatches(), booleanValue(), EvolutionInboundInspection, extractText(), inspectEvolutionInboundPayload(), isRecord(), mapEvolutionInbound() (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.27
Nodes (7): go.mau.fi/whatsmeow/types.NewsletterMessage, go.mau.fi/whatsmeow/types.NewsletterMetadata, CreateNewsletterStruct, GetNewsletterInviteStruct, GetNewsletterMessagesStruct, GetNewsletterStruct, NewsletterService

### Community 75 - "Community 75"
Cohesion: 0.13
Nodes (15): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, module, moduleResolution (+7 more)

### Community 76 - "Community 76"
Cohesion: 0.14
Nodes (14): eslint, eslint, eslint, devDependencies, eslint, eslint-config-next, prettier, @types/react (+6 more)

### Community 77 - "Community 77"
Cohesion: 0.21
Nodes (8): NewCallHandler(), newRequestID(), NewRouter(), NewServerHandler(), github.com/gin-gonic/gin.Engine, CallHandler, ServerHandler, Routes

### Community 78 - "Community 78"
Cohesion: 0.18
Nodes (7): newRequestID(), NewWebhookProducer(), TestProduceSendsOnlyToInstanceWebhookURL(), NewLoggerManager(), time.Duration, Producer, webhookProducer

### Community 80 - "Community 80"
Cohesion: 0.23
Nodes (8): NewPollHandler(), NewPollService(), postgresArrayToStringSlice(), stringArrayToPostgresArray(), NewWhatsmeowService(), database/sql.DB, PollHandler, PollService

### Community 81 - "Community 81"
Cohesion: 0.15
Nodes (13): dependencies, @langchain/core, @langchain/langgraph, @langchain/langgraph-checkpoint-postgres, @langchain/openai, pg, zod, pg (+5 more)

### Community 82 - "Community 82"
Cohesion: 0.15
Nodes (13): dotenv, @prisma/client, dotenv, @prisma/client, dotenv, @prisma/client, dependencies, dotenv (+5 more)

### Community 83 - "Community 83"
Cohesion: 0.15
Nodes (13): scripts, build, check, dev, format, format:check, lint, prisma:deploy (+5 more)

### Community 84 - "Community 84"
Cohesion: 0.35
Nodes (3): AiOrchestratorClient, envelope(), registerV1ConversationRoutes()

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (12): addBrazilianNinthDigit(), BRAZILIAN_DDDS, extractPhoneDigits(), isWhatsappGroup(), isWhatsappLid(), jidLocalPart(), normalizeWhatsappJid(), normalizeWhatsappPhone() (+4 more)

### Community 86 - "Community 86"
Cohesion: 0.33
Nodes (4): go.mau.fi/whatsmeow.SendResponse, BodyStruct, ChatService, HistorySyncRequestStruct

### Community 87 - "Community 87"
Cohesion: 0.27
Nodes (6): NewWebsocketProducer(), ServeWs(), github.com/gorilla/websocket.Conn, net/http.ResponseWriter, sync.RWMutex, websocketProducer

### Community 88 - "Community 88"
Cohesion: 0.28
Nodes (5): newLogger(), sanitizeLogMessage(), sync.Mutex, Logger, lumberjack.Logger

### Community 89 - "Community 89"
Cohesion: 0.22
Nodes (10): PollResults, PollVote, BuildPollVoteFromEvent(), encoding/json.RawMessage, go.mau.fi/whatsmeow/proto/waE2E.PollVoteMessage, go.mau.fi/whatsmeow/types.MessageInfo, time.Time, LogEntry (+2 more)

### Community 90 - "Community 90"
Cohesion: 0.26
Nodes (7): generateFilePath(), NewMinioMediaStorage(), setBucketPolicy(), context.Context, MediaStorage, minio.Client, MinioMediaStorage

### Community 91 - "Community 91"
Cohesion: 0.18
Nodes (10): CreateSocks5Proxy(), GenerateRandomString(), GenerateVC(), VCardStruct, PrepareNumberForWhatsAppCheck(), PrepareNumbersForWhatsAppCheck(), WhatsAppGetUserAgent(), go.mau.fi/whatsmeow/proto/waCompanionReg.DeviceProps_PlatformType (+2 more)

### Community 92 - "Community 92"
Cohesion: 0.19
Nodes (4): conversationSchema, messageSchema, BffConversationService, ConversationQuery

### Community 93 - "Community 93"
Cohesion: 0.21
Nodes (12): "Appointment", "AppointmentItem", "AvailabilityException", "AvailabilityRule", "CalendarSettings", "Customer", "ExternalEntityMap", "IntegrationConnection" (+4 more)

### Community 94 - "Community 94"
Cohesion: 0.15
Nodes (13): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir (+5 more)

### Community 95 - "Community 95"
Cohesion: 0.29
Nodes (12): auditProductionHealth(), check(), count(), expectedServices, joinSources(), main(), matchingFiles(), read() (+4 more)

### Community 96 - "Community 96"
Cohesion: 0.17
Nodes (12): devDependencies, eslint-plugin-unused-imports, prettier, tsx, vitest, prettier, tsx, vitest (+4 more)

### Community 97 - "Community 97"
Cohesion: 0.17
Nodes (12): typescript-eslint, devDependencies, prettier, tsx, typescript-eslint, vitest, prettier, tsx (+4 more)

### Community 98 - "Community 98"
Cohesion: 0.17
Nodes (10): exclude, include, dist, src/**/*.ts, node_modules, exclude, include, dist (+2 more)

### Community 99 - "Community 99"
Cohesion: 0.17
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 100 - "Community 100"
Cohesion: 0.29
Nodes (4): NewRabbitMQProducer(), github.com/rabbitmq/amqp091-go.Channel, github.com/rabbitmq/amqp091-go.Connection, rabbitMQProducer

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (4): ChatLabelStruct, EditLabelStruct, LabelService, MessageLabelStruct

### Community 102 - "Community 102"
Cohesion: 0.17
Nodes (12): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 103 - "Community 103"
Cohesion: 0.18
Nodes (9): exclude, include, dist, src/**/*.d.ts, src/**/*.ts, exclude, include, dist (+1 more)

### Community 104 - "Community 104"
Cohesion: 0.40
Nodes (4): NewJIDValidationMiddleware(), CreateJID(), github.com/gin-gonic/gin.HandlerFunc, JIDValidationMiddleware

### Community 105 - "Community 105"
Cohesion: 0.18
Nodes (11): scripts, build, dev, format, format:check, lint, prisma:deploy, prisma:generate (+3 more)

### Community 107 - "Community 107"
Cohesion: 0.20
Nodes (10): @eslint/js, @eslint/js, @eslint/js, @eslint/js, devDependencies, @eslint/js, prettier, tsx (+2 more)

### Community 110 - "Community 110"
Cohesion: 0.20
Nodes (9): loginResultSchema, messageResultSchema, okSchema, registerResultSchema, sessionSchema, ChangePasswordInput, LoginInput, RegisterInput (+1 more)

### Community 111 - "Community 111"
Cohesion: 0.20
Nodes (9): engines, node, name, private, scripts, check, start, type (+1 more)

### Community 112 - "Community 112"
Cohesion: 0.29
Nodes (8): checkTarget(), defaultTargets, hostnameFromUrl(), nowIso(), parseTargets(), pollOnce(), PORT, server

### Community 115 - "Community 115"
Cohesion: 0.22
Nodes (8): exclude, include, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, **/*.ts, **/*.tsx

### Community 117 - "Community 117"
Cohesion: 0.25
Nodes (7): CURRENT_LEGAL_VERSIONS, PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_LAST_UPDATED_DATE, PRIVACY_POLICY_VERSION, TERMS_EFFECTIVE_DATE, TERMS_LAST_UPDATED_DATE, TERMS_VERSION

### Community 118 - "Community 118"
Cohesion: 0.25
Nodes (7): exports, main, name, private, type, types, version

### Community 119 - "Community 119"
Cohesion: 0.29
Nodes (7): typescript, typescript, typescript, typescript, typescript, devDependencies, typescript

### Community 120 - "Community 120"
Cohesion: 0.38
Nodes (4): isDomainFailure(), isRecord(), isStructuredToolResult(), resultContext()

### Community 121 - "Community 121"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 122 - "Community 122"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 124 - "Community 124"
Cohesion: 0.47
Nodes (3): NewMiddleware(), Middleware, InstanceService

### Community 125 - "Community 125"
Cohesion: 0.47
Nodes (4): NewTelemetryService(), SendTelemetry(), TelemetryData, telemetryService

### Community 126 - "Community 126"
Cohesion: 0.33
Nodes (3): CalendarSource, OnboardingDraft, OnboardingService

### Community 127 - "Community 127"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 128 - "Community 128"
Cohesion: 0.40
Nodes (5): eslint-plugin-simple-import-sort, eslint-plugin-simple-import-sort, eslint-plugin-simple-import-sort, eslint-plugin-simple-import-sort, eslint-plugin-simple-import-sort

### Community 129 - "Community 129"
Cohesion: 0.40
Nodes (5): @types/node, @types/node, @types/node, @types/node, @types/node

### Community 131 - "Community 131"
Cohesion: 0.40
Nodes (4): serviceListSchema, serviceSchema, ServiceInput, UpdateServiceInput

### Community 132 - "Community 132"
Cohesion: 0.50
Nodes (4): fastify, fastify, fastify, fastify

### Community 133 - "Community 133"
Cohesion: 0.50
Nodes (4): @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg

### Community 134 - "Community 134"
Cohesion: 0.50
Nodes (4): prisma, prisma, prisma, prisma

### Community 135 - "Community 135"
Cohesion: 0.50
Nodes (4): @types/pg, @types/pg, @types/pg, @types/pg

### Community 137 - "Community 137"
Cohesion: 0.50
Nodes (4): lib, dom, dom.iterable, esnext

## Knowledge Gaps
- **564 isolated node(s):** `MinhaAgendaConnectionRecord`, `AiDecision`, `AiDecisionAction`, `AppointmentDraft`, `ContactClassification` (+559 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 902 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DiagnosticLogger` connect `Community 19` to `Community 0`, `Community 1`, `Community 2`, `Community 8`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `AppError` connect `Community 0` to `Community 5`, `Community 38`, `Community 51`, `Community 24`, `Community 56`, `Community 28`, `Community 61`, `Community 62`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `Instance` connect `Community 13` to `Community 3`, `Community 37`, `Community 101`, `Community 72`, `Community 106`, `Community 10`, `Community 44`, `Community 47`, `Community 16`, `Community 86`, `Community 89`, `Community 26`, `Community 25`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `MinhaAgendaConnectionRecord`, `AiDecision`, `AiDecisionAction` to the rest of the system?**
  _564 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05170998632010944 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0547945205479452 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.050078247261345854 - nodes in this community are weakly interconnected._