# Goal 002 — Base de validação reproduzível

## Objetivo

Tornar verificáveis os próximos Goals com comandos locais e CI que compilam os apps, executam os testes existentes e distinguem sucesso, falha e verificação não executada. Corrigir os defeitos de teste já comprovados: fixtures Go que deixam arquivos abertos, asserção IA sem requestId e integração BFF que usa rota antiga. Incluir Scheduling no build agregado.

Executor: **Claude Code / Opus**. Reviewer: **Astra**. **Status vigente: ACCEPTED**, conforme [review da rodada 3](../reviews/002-review.md#rodada-3). Este prompt é preservado como escopo histórico; implementação entregue pelo executor e aceite formalizado administrativamente em 2026-09-07.

## Por que agora

O review001 demonstrou que a proteção funciona, mas a suite Go completa falha no Windows por recursos de fixtures. Goal0 também encontrou Scheduling fora de build-all, IA com uma asserção antiga e integração BFF que pode ser pulada ou chamar `/auth/register` inexistente. Corrigir esses pontos antes de tenant/ownership reduz o risco de aceitar uma migração com verificações incompletas.

Este é o refinamento do Goal002 antes chamado “Base de validação e contratos de transporte”. **Não centralizar DTOs nem criar contratos novos agora.** Evolução contratual continua por operação nos Goals de domínio. O achado G-35 de `/message/status` pertence ao Goal003 e deve ser fechado antes de ampliar persistência no Goal004.

## Dependências

- [Review001 ACCEPTED](../reviews/001-review.md), com hashes do diff aceito. HEAD do review: `4ca130128cafd620ea316c3ed9c51a46b34f8541`; código-base `5fb5d51` mais implementação001 no working tree, ainda sem commit.
- Conferir git status/diff, preservar alterações anteriores e reconhecer o diff001 antes de iniciar. Não exigir commit como permissão nova nem declarar que existe commit de implementação sem evidência.
- Go1.25.0/CGO e Node/npm compatíveis com manifests/locks existentes. Usar versões já estabelecidas no projeto; sem upgrade de dependências de produção por conveniência.
- Banco de teste BFF descartável e isolado para a validação de integração. Ausência desse banco é verificação pendente, nunca aprovação por skip.

## Contexto necessário

- AGENTS global e dos apps afetados; `docs/AI_WORKFLOW.md`.
- [CURRENT_STATE](../CURRENT_STATE.md), infraestrutura/qualidade e delta001; [GAP_ANALYSIS](../GAP_ANALYSIS.md), G-33/G-35.
- [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md), contratos/testes/observabilidade; [DECISIONS](../DECISIONS.md), D-003/D-011/D-016.
- [MASTER_PLAN](../MASTER_PLAN.md) e review001 para separar falha preexistente de regressão.

Usar Graphify existente para localização e confirmar o código relevante. Leitura de produto somente se alguma alteração proposta ultrapassar infraestrutura de validação; nesse caso, registrar a necessidade e não implementar comportamento de domínio neste Goal.

## Arquivos/domínios relevantes

- `package.json`, `scripts/build-all.sh`, `scripts/final-production-audit.mjs`.
- `apps/evolution-go/pkg/instance/service/instance_service_test.go` e `pkg/events/webhook/webhook_producer_test.go`; `pkg/logger/logger.go` para uso de `Logger.Close()` existente.
- `apps/evolution-go/pkg/instance/handler/instance_authorization_test.go`: regressão001 a preservar.
- `apps/ai-orchestrator/tests/channel/inbound-message-processor.test.ts:423` e provider/processor correspondente para verificar propagação de requestId.
- `apps/bff/tests/auth-register.integration.test.ts`, `src/app.ts`, `src/modules/auth/routes.ts`, configuração/Prisma de teste; suites/configuração Vitest existentes.
- Manifests/locks e comandos de build de contracts, Scheduling, IA, BFF, frontend e health-worker.
- Novos scripts mínimos de validação sob `scripts/` e CI sob `.github/workflows/`, se necessários ao comando canônico descrito abaixo.

## Escopo

1. **Fixtures Go:** fechar o logger de cada instância de teste usando `Logger.Close()` existente, antes da remoção de TempDir. No teste webhook, garantir que a produção assíncrona terminou antes de fechar o logger; resposta HTTP recebida pode preceder o último log do producer. Usar sinal/espera determinística limitada ou injeção de teste mínima, sem sleeps arbitrários, sem ignorar falha de cleanup e sem modificar política de retry/entrega. Preferir solução nos testes; qualquer seam no código deve ser mínimo, preservar comportamento e ser justificado no diff. Não redesenhar LoggerManager.
2. **Teste IA:** corrigir a expectativa para verificar o requestId real propagado, preservando asserções de destinatário, texto, quote e correlação. Não retirar requestId do runtime nem afrouxar todo o objeto para fazer o teste passar. Não corrigir aqui os problemas de entrega/dedupe que pertencem ao Goal004.
3. **Integração BFF:** usar a rota real `/v1/auth/register`, payload e status vigentes. Executar com PostgreSQL exclusivo de teste e confirmar criação de User/Tenant/membership/perfil/configuração/aceite legal pertinentes. Encerrar app/conexões e remover apenas fixtures próprias. Não chamar isso de prova de rollback transacional se nenhum caso exercitar falha dentro de transação.
4. **Build e gate local:** incluir Scheduling no agregador; manter contracts antes dos apps consumidores. Criar/ajustar comandos npm canônicos `validate:core` e `validate:integration` na raiz, usando Node/Bash existente de forma reproduzível em Windows e Linux. Nenhum erro de subprocesso pode virar exit0. Não depender de pnpm workspaces inexistentes.
5. **Relato correto:** core cobre builds e suites locais; integration exige BFF de teste efetivamente executado. Packages sem testes e integração pulada aparecem separados. Ajustar contagem do script de auditoria estática para que health remoto pulado não seja contado como teste aprovado. Com nenhum alvo remoto explicitamente fornecido, não chamar produção. Script regex continua auxiliar, sem alegar E2E/isolamento.
6. **CI mínima:** executar os mesmos comandos, com PostgreSQL descartável para BFF e segredos sintéticos. Cobrir Go no Windows para reproduzir a classe de cleanup corrigida; build/integração Linux pode usar serviço PostgreSQL. Sem deploy, uso de banco compartilhado, nova plataforma de CI ou contratação. Se não houver execução remota disponível, validar configuração/comandos localmente e registrar que a execução hospedada ainda não ocorreu.
7. **Documentação do gate:** pré-requisitos, comandos, separação unitário/integração/estático, resultados e troubleshooting de recursos locais. Atualizar migration/status com evidência; não reescrever Product Vault, Claude Design ou a auditoria histórica como se toda qualidade já estivesse aprovada.

## Fora de escopo

Features, fluxos/copy/UI, novos schemas/migrations de produto, alteração de rotas/payloads públicos, centralização geral de contratos, tenant/CSRF/sessão, G-35, substituição indiscriminada de MustGet, fila/jobs, debounce/outbox, retenção, importação, novas dependências de produção e atualização ampla de Swagger/wiki. A dívida documental de segurança e G-35 ficam no Goal003. Não criar E2E de todo o MVP nem aumentar cobertura por meta numérica.

## Estado atual relevante

- `scripts/build-all.sh` compila contracts, IA, BFF, frontend, verifica health e roda testes Go; Scheduling está ausente.
- Teste IA espera envio sem o `requestId` emitido pelo processor.
- Teste BFF depende de `BFF_RUN_INTEGRATION_TESTS=true` e usa `/auth/register`; sem execução habilitada, um comando verde não prova persistência.
- As duas fixtures Go falham no Windows por arquivo aberto. `Logger.Close()` já existe. Não há regressão001 envolvida.
- `core.autocrlf=true` neste checkout: gofmt sobre arquivo CRLF difere somente por EOL. A verificação de formatação deve documentar sua política e não reformatar o repositório inteiro.
- `final-production-audit.mjs` contou um health skipped como passed; o script não verifica concorrência real.
- Não há CI versionada na baseline. Builds declarados não foram todos executados pelo Goal0/review001.

## Arquitetura esperada

Um conjunto pequeno de scripts compõe comandos existentes; cada ferramenta continua responsável pelo próprio build/teste. `validate:core` executa builds de contracts, Scheduling, IA, BFF e frontend, check do health, suite IA e Go build/vet/test. O teste BFF com banco é responsabilidade de `validate:integration`; não executar incidentalmente integração usando env pessoal ao rodar core.

`validate:integration` exige URL de teste explicitamente nomeada, por exemplo `BFF_TEST_DATABASE_URL`, aponta DATABASE_URL/DIRECT_DATABASE_URL do subprocesso para esse banco e ativa a flag de integração. O runner deve recusar URL ausente, destino que não pertença ao ambiente descartável provisionado ou fallback silencioso para `.env`/produção. Provisionar banco PostgreSQL local/CI próprio, aplicar somente nele as migrations existentes e eliminar só recursos criados pela fixture. Credenciais internas/URLs de dependências são sintéticas, com doubles ou endpoints locais sem acesso a serviços reais.

Build deve gerar artefatos/clients, sem executar migrations em banco de produto. Nada neste Goal modifica `render.yaml` nem faz deploy. Dependências de desenvolvimento adicionais, se indispensáveis, precisam de justificativa e lock restrito; usar ferramentas já disponíveis primeiro.

## Regras de compatibilidade/migração

- Nenhuma migração de dados de usuário ou alteração de contrato/runtime de domínio.
- Preservar a correção001 e os testes negativos de autorização.
- Manter comandos atuais funcionais; novos comandos apenas compõem/verificam. Mudanças de EOL limitadas a scripts tocados quando necessárias à execução.
- Migrations BFF existentes são executadas somente no banco de teste isolado; não reescrever migration aplicada nem usar `migrate reset` sobre URL herdada.
- Se um build revelar defeito funcional fora do escopo, registrar erro/reprodução e propor ajuste ao Astra. Não mascarar, inserir skip, reduzir testes ou abrir refatoração ampla para obter verde.

## Critérios de aceite

- As duas fixtures Go passam no Windows, fecham recursos e mantêm as asserções; execução repetida dirigida não depende de timing arbitrário.
- Suite Go inteira passa no ambiente suportado do executor, incluindo 31 nós de autorização001; build/vet passam. Qualquer nova falha tem classificação e impede declarar o gate completo verde.
- Suite IA passa preservando a verificação de requestId/correlação.
- Integração BFF executa de verdade, usa `/v1/auth/register`, verifica persistência e deixa somente recursos esperados no banco exclusivo.
- Scheduling participa efetivamente do build canônico; erro nele interrompe o gate com exit diferente de zero.
- `validate:core` e `validate:integration` têm pré-requisitos reproduzíveis, não usam env de produção nem escondem skipped/falhas.
- Auditoria estática distingue passed/failed/skipped corretamente; sem alvo remoto fornecido, não faz chamada de produção.
- Configuração CI reproduz comandos, não possui secrets reais, não faz deploy e não exige novo serviço pago. Execução hospedada não realizada deve ser registrada como tal.
- Diff e docs restritos a este escopo, preservando001 e alterações anteriores. Goal003 ainda não implementado.

## Testes obrigatórios

- Go: suite completa e repetição dirigida dos dois testes de cleanup (`-count=5`) no Windows; sem excluir testes/flakes e sem sleeps para ocultar corrida.
- IA: teste de envio que preserva requestId e suite existente inteira.
- BFF: teste real de cadastro/persistência com banco descartável; recusa antecipada do runner sem URL de teste e sem tocar banco default.
- Gate: teste pequeno com subprocesso sintético que falha, comprovando propagação do exit code; lista declarada de etapas inclui Scheduling. Pode usar `node:test` já fornecido pelo Node.
- Auditoria estática: caso health não configurado registrado como skipped, sem contabilização como passed. Nenhuma chamada remota real necessária.

Não exigir teste que apenas espelha funções internas. Testar efeitos úteis: recurso liberado, contrato de envio preservado, escrita no banco correto e falha do processo refletida no resultado.

## Validação obrigatória

Após preparar dependências existentes e banco de teste, na raiz:

```text
npm run validate:core
npm run validate:integration
git diff --check
```

O runner de integração recebe sua URL explicitamente pelo ambiente de teste descrito acima. Incluir no relatório os comandos reais de provisionamento/migrations/cleanup, sanitizados, e as versões usadas.

Comandos Go de referência em `apps/evolution-go`:

```text
go test -count=1 ./...
go test -count=5 ./pkg/instance/service ./pkg/events/webhook
go build ./...
go vet ./...
```

Formatar somente arquivos alterados e documentar normalização LF quando comparar gofmt em checkout CRLF. Usar RTK quando suportado e preservar logs suficientes. Nenhum comando com erro/skip impeditivo deve ser resumido como aprovação completa.

## Entrega esperada do Claude

- Arquivos/diff e motivo de cada alteração; identificar código001 preservado e mudanças preexistentes.
- RED/GREEN dos defeitos de validação corrigidos; comandos/resultados, plataformas, saída de falhas e skipped separados.
- Prova de banco de teste isolado, execução real BFF e cleanup; nenhum segredo/dado pessoal no relatório.
- Estado dos workflows CI: configuração validada versus execução hospedada efetiva.
- Novos problemas fora do escopo e impactos de planejamento, sem implementar G-35/Goal003.
- MIGRATION_STATUS em IMPLEMENTED/REVIEW_REQUIRED após entrega; nunca ACCEPTED em nome de Astra. Sem commit/push/merge/PR sem autorização do fluxo.

## Não fazer

- Não implementar produto, alterar providers/frameworks/bancos, liberar envio WhatsApp real ou chamar produção.
- Não “resolver” falha apagando teste, suprimindo cleanup, mudando runtime para satisfazer mock antigo ou fingindo que um teste pulado passou.
- Não migrar contratos vazios do package como se tivessem consumidores reais; isso pertence ao Goal da operação.
- Não regenerar todo Swagger ou reformar todos os handlers/MustGet neste Goal.
- Não detalhar Goal003 e seguintes antes do review002. Astra deve revisar o diff real e reavaliar G-35/segurança antes do próximo prompt.
