# Review formal — Goal 001

**Decisão: ACCEPTED.** Astra, 2026-09-05. Aceite restrito ao diff de autorização de GET/PUT advanced-settings, testes e documentação correspondente. Não certifica o restante do Evolution nem representa deploy, commit ou merge.

## Referência e preservação

- Goal: [001](../goals/001-autorizar-alvo-instancia-evolution.md); comparação com TARGET_ARCHITECTURE, D-003 e MASTER_PLAN.
- Baseline factual: `5fb5d51abc1de58cb24718e7349d7a68ccaa7356`.
- HEAD do review: `4ca130128cafd620ea316c3ed9c51a46b34f8541`, apenas documentação/manifesto desde a baseline; não há mudança de código entre esses commits.
- Implementação está no working tree, sem commit: `instance_handler.go` modificado; `instance_authorization.go` e `instance_authorization_test.go` novos; wiki de instâncias modificado. Diff rastreado de runtime: +10/−11 no handler; guard novo com 47 linhas, teste com 527. Nenhuma dependência, schema ou migration alterada.
- README/status já continham aceite externo do Goal0. Esse registro foi preservado, sem atribuir sua autoria ao executor ou ao presente review.
- Astra inspecionou o diff rastreado completo, arquivos novos, handlers, middleware, serviço, registro de rotas, consumers, testes e documentação. Não implementou correção funcional.

Fingerprint SHA-256 do conteúdo com finais de linha LF, para identificar exatamente o diff aceito mesmo em checkout CRLF:

| Arquivo relativo ao repositório | SHA-256 LF |
| --- | --- |
| `apps/evolution-go/pkg/instance/handler/instance_handler.go` | `e3d380b7d0a19be6ab11ed0a0b3fa4d872f2617697b690c291422e72b37fe8e3` |
| `apps/evolution-go/pkg/instance/handler/instance_authorization.go` | `77f8925196f05ec0e9fa7db4702579fd8bd463a72f3e8ba7cc548a5338089fa8` |
| `apps/evolution-go/pkg/instance/handler/instance_authorization_test.go` | `b0de47bb680117beec3d1d6b16a3291acaa16120964e882a9d46dad922ac62c3` |
| `apps/evolution-go/docs/wiki/guias-api/api-instances.md` | `9aef3dcd4380eb1cd1b773b85e7d20612faaf200b3d276ab2ecd3de17b948bf4` |

Mudança posterior nesses arquivos exige avaliar o novo diff; não atribuir aceite a um futuro commit só por seu nome.

## Autorização, tipos e compatibilidade

| Critério | Evidência e conclusão |
| --- | --- |
| A → A permitido | Auth real resolve A; helper devolve `instance.Id`; GET preserva payload e PUT preserva validação/sucesso. Testes verificam ID e argumentos recebidos pelo serviço |
| A → B negado | `authorizeInstanceTarget`, linhas 40–45, compara alvo com sujeito antes de qualquer service; ambos handlers retornam imediatamente quando false |
| Contexto inválido → 401 | `ctx.Get`, assertion com `ok`, teste de ponteiro nil e ID vazio, linhas 15–26. Ausente, tipo errado, struct em vez de ponteiro, interface nil e interface contendo ponteiro nil são recusados sem panic |
| PUT não lê body antes de autorizar | Helper vem antes de `ShouldBindJSON`; JSON inválido para B recebe 403, JSON inválido para A mantém 400 e zero updates |
| Sem oracle de existência | Recusa genérica 403 sem consulta ao alvo. GET compara bytes para B existente e ID desconhecido; PUT usa exatamente o mesmo guard anterior ao body/service |
| Sem fallback | ID retornado é o do contexto autenticado; jamais substituir contexto ausente pela URL |
| Limite admin | Registro real `routes.go:105–133` permanece intocado: admin sob AuthAdmin, advanced-settings sob Auth. Testes usam os dois middlewares reais e não concedem bypass global |

O helper exige ID não vazio; não normaliza ou reinterpreta o identificador autenticado. A aplicação gera UUID com `uuid.New().String()`, e o repository resolve o objeto pelo token. Não há necessidade de transformar o guard em um parser genérico de UUID para cumprir a autorização por igualdade. `ctx.Set` armazena `any`: o caso de ponteiro nil no teste já cobre uma interface contendo esse ponteiro.

O teste administrativo espelha somente as rotas relevantes. **Limitação aceita:** não detecta mudança futura no registro real. É evidência suficiente neste diff porque usa Auth/AuthAdmin e handlers reais, o registro foi inspecionado e não mudou. Não exigir onze interfaces falsas para construir o router inteiro. Revalidar registro quando ele mudar; uma asserção estrutural futura pode complementar, sem substituir teste de comportamento.

Consumers confirmados: BFF configura opções durante `/instance/create` e não chama advanced-settings; IA usa envio por token, sem essas rotas; manager usa ID e apikey da mesma instância no PUT. Bundle `manager/dist/assets/index-Dx4-byTC.js:395` contém os dois callers; interceptor na linha 305 preserva o apikey explícito. Nenhuma incompatibilidade legítima encontrada na busca delimitada com Graphify e confirmação no código.

## Testes reproduzidos por Astra

Ambiente: Go 1.25.0, Windows/amd64, CGO=1, gcc; módulos/toolchain locais, sem download ou WhatsApp real. Teste webhook usa servidor httptest local.

| Execução | Resultado observado |
| --- | --- |
| Working tree: `go test -count=1 -json ./...` | 31 nós do pacote handler passaram (3 testes e 28 subtestes). Suite total: 95 nós passaram e 2 testes falharam; não declarar suite inteira verde |
| Working tree: `go build ./...` | Exit 0 |
| Working tree: `go vet ./...` | Exit 0 |
| Formatação dos três Go alterados | Conteúdo normalizado LF é byte-idêntico à saída de gofmt. `gofmt -l` sobre checkout CRLF lista os três; `core.autocrlf=true`. O relatório completo do Claude explicitava a validação sobre LF, confirmada aqui |
| `git diff --check` | Exit 0 |
| Baseline limpa: `go test -count=1 -v ./pkg/instance/service ./pkg/events/webhook` | Mesmos dois testes falham pelo mesmo cleanup de arquivos; teste de serialização passa |
| Baseline + somente teste novo, sem guard/handler corrigido; seletor reproduzido abaixo | RED: GET B=200; PUT B válido=200; PUT B JSON inválido=400, todos contra 403 esperado |

Comando do RED, executado no diretório Evolution do baseline isolado:

```text
go test -count=1 -v -run 'TestAdvancedSettingsAuthorizationOverGinChain/(GET|PUT)_on_another_instance' ./pkg/instance/handler
```

O RED copiou literalmente apenas `instance_authorization_test.go`; SHA-256 bytes da origem/cópia: `ba4aaaaa890fd99a4314eec156ae41b46ef83ef555008ec92d2166e7e986dc83`. A fixture foi removida, o baseline voltou a ficar limpo e o worktree temporário próprio foi removido. O workspace principal não foi alterado por essa reprodução.

Falhas da suite:

1. `TestConnectPreservesExistingConfigurationOnEmptyPayload`, em `pkg/instance/service`.
2. `TestProduceSendsOnlyToInstanceWebhookURL`, em `pkg/events/webhook`.

Ambas terminam com `testing.go:1369: TempDir RemoveAll cleanup: unlinkat ... instance.log: The process cannot access the file because it is being used by another process.` Não há falha das asserções funcionais desses testes. Fixtures criam LoggerManager em TempDir e não chamam o `Logger.Close()` já existente; o writer lumberjack permanece aberto. Trata-se de defeito preexistente no fechamento de recursos dos testes que se manifesta no Windows, não uma falha inexplicada do ambiente.

`go list -deps -test` dos dois pacotes produziu 453 linhas idênticas no baseline e no working tree, sem `pkg/instance/handler`. Service, webhook, logger, go.mod e go.sum não têm diff desde `5fb5d51`. A independência foi demonstrada, não inferida apenas do nome dos pacotes. Pela regra explícita do usuário para este review, essas falhas preexistentes não bloqueiam Goal001; sua resolução fica no Goal002.

Logs locais auxiliares: `%TEMP%/atendly-astra-goal001-review-current/go-test-all.jsonl` e `%TEMP%/atendly-goal001-baseline-review-5cf4a323c0ff42febd96adaa8b92fbaa/` (REPORT.md, baseline-tests.log, baseline-red.log e listas de dependências). As conclusões e comandos essenciais ficam persistidos aqui para não depender da conservação de TEMP.

## Oito achados reportados pelo executor

O relatório completo foi recuperado do texto do artefato na entrada Write de 2026-09-05T23:11:07.509Z e da resposta final na sessão local do Claude `0aec0ffe-d135-46cd-abe4-76d19a7ba1c0`. Isso recupera o relato; a decisão abaixo depende das verificações de código/testes feitas por Astra.

| Achado | Resultado do review / destino |
| --- | --- |
| Cleanup Windows | Confirmado no baseline, causa identificada e independente do diff. Goal002 corrige fixtures, sem desabilitar testes |
| Swagger gerado defasado | Confirmado: GET/PUT em swagger.json ainda listam 200/400/404/500 e não 401/403. Docs gerados não mudaram. Dívida documental, sem bypass do handler; alinhar no Goal003 ao revisar contratos de segurança, com diff dirigido |
| Wiki diz que todo `:instanceId` é admin | Confirmado no cabeçalho e lista de gerenciamento avançado; texto preexistente contradiz a seção específica corrigida. Não é regressão de autorização; alinhar no Goal003 |
| Exemplos de payload divergentes | Confirmado: wiki usa msgCall/groupsIgnore/readStatus/syncFullHistory; modelo usa msgRejectCall/ignoreGroups/ignoreStatus. Preexistente, alinhar documentação específica no Goal003 |
| Conceitos-core usa POST | `docs/wiki/conceitos-core/instances.md:392` diverge de PUT em routes. Preexistente, mesmo lote documental dirigido |
| Anotações 404 | Ambos handlers continuam retornando 500 para erro do service; 404 documental é preexistente. Não mudar status de runtime por conveniência neste Goal; corrigir documentação ao alinhar o contrato |
| Aproximadamente 40 MustGet | Correção da contagem: 72 usos em dez arquivos de handlers. Ausência/nil pode provocar panic em outros caminhos, mas isso por si só não prova acesso cruzado. Análise de objetos encontrou a vulnerabilidade independente abaixo |
| D-003 PROPOSED | Era o estado correto antes do review; agora ACCEPTED somente para a autorização implementada |

As lentes adversariais foram separadas em falha/recuperação, compreensão/manutenção e autorização. Suas ressalvas concretas são, respectivamente, cleanup preexistente, espelho do router/documentação defasada e o achado independente a seguir. Não se atribui severidade maior só porque duas leituras citaram o mesmo ponto. Nenhuma delas revelou defeito bloqueante introduzido no guard do Goal001.

## Achado independente — G-35, consulta de status sem ownership

**FATO estático, risco de privacidade P1 no roadmap, condicionado à existência de dados; não incidente comprovado.** Token válido A, client A conectado e ID conhecido de mensagem armazenada de B podem alcançar metadados de B por `POST /message/status`.

Caminho confirmado no código inalterado:

`routes.go:175–181 → message_handler.go:223–255 → message_service.go:349–363 → message_repository.go:27–38`.

Auth fornece A; o handler recebe `body.id`; o service verifica somente a conexão de A e chama `GetMessageByID(data.Id)`. Repository compartilhado filtra apenas `message_id`, sem instância. Message não tem `instance_id`. Resposta inclui ID interno, message_id, timestamp, status e source; **source é identificador do chat/telefone**, atribuído em `whatsmeow.go:1645/1662`, não instância e não texto da mensagem.

Gravação examinada exige `DATABASE_SAVE_MESSAGES=true`; exemplo versionado usa false. Produção e população do banco não foram inspecionadas. Desligar novas gravações não demonstra ausência de linhas antigas. Não houve consulta real com token de cliente nem exploração remota.

Outros handlers examinados usam a instância autenticada/clientPointer; labels e polls restringem suas consultas por instância. O repository de Auth retorna ponteiro não nil em sucesso. Assim, `MustGet` é fragilidade de contexto; **G-35 é uma falha distinta de autorização do objeto consultado**, mesmo com contexto válido.

## Aceite e replanejamento

- Goal001 ACCEPTED; nenhum correction Goal para essa implementação.
- Goal002 READY, detalhado agora: estabilizar a base de validação, incluindo as duas fixtures Go, IA requestId, teste BFF real e build Scheduling. Nenhuma funcionalidade do Goal003 é implementada nessa etapa.
- Goal003 mantém seu ID e escopo de tenant/sessão/vínculo/credenciais; G-35 passa a ser requisito de segurança obrigatório: ownership de metadados no transporte, escrita/leitura por instância, teste negativo A/B, tratamento conservador de linhas sem dono e documentação correta. Detalhar o modelo somente após Goal002. Não usar source/telefone como prova de propriedade.
- Goal004 não pode ampliar armazenamento/entrega enquanto G-35 e os critérios de isolamento do Goal003 permanecerem abertos. Não se cria outro Goal de segurança redundante porque o Goal003 já é o escopo separado de segurança/ownership imediatamente seguinte à base de validação. Se surgir evidência de exploração ou exposição ativa, antecipar um security Goal independente; não esperar o roadmap normal.
- A ordem 001→002→003→004 permanece; há requisito concreto novo em003 e refinamento de002, registrados em D-016/MASTER_PLAN. Nenhum prompt posterior a002 foi produzido.
