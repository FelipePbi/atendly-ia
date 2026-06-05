# Plano Codex — Refatoração de Arquitetura para Monorepo + BFF

## Nome do projeto

`atendly-ia`

## Objetivo final

Refatorar a arquitetura atual, que hoje está dividida em quatro projetos/repositórios separados, para um **monorepo privado** chamado `atendly-ia`, adicionando um **BFF** como camada intermediária entre o frontend e os serviços internos.

Ao final, o sistema deve continuar funcionando como funciona hoje, mas com a seguinte arquitetura-alvo:

- um único repositório privado no GitHub;
- serviços organizados em um monorepo;
- frontend consumindo apenas o BFF;
- BFF responsável pela autenticação dos usuários da plataforma via JWT;
- BFF intermediando chamadas do frontend para API e Evolution Go;
- serviços existentes preservados e rodando no Render;
- novos serviços criados no Render quando necessário;
- URLs públicas configuradas;
- `AGENTS.md` e `AGENT.md` no repositório com contexto, arquitetura, regras de negócio e instruções para o Codex.

> Observação importante: o Codex reconhece oficialmente `AGENTS.md`. Como foi solicitado `AGENT.md`, criar os dois arquivos com o mesmo conteúdo ou criar `AGENT.md` apontando para `AGENTS.md`. O arquivo principal deve ser `AGENTS.md`.

---

## Contexto atual informado

Hoje existem quatro projetos separados, cada um em seu próprio repositório Git:

1. `api`
   - Responsável por integrar com a IA.
   - Responsável por gerar respostas.
   - Responsável por fazer agendamentos na API da “Minha Agenda”.

2. `evolution-go`
   - Responsável por criar a instância com WhatsApp.
   - Responsável por receber mensagens e eventos do WhatsApp.
   - Responsável por enviar mensagens/eventos para a API.
   - Responsável por receber a resposta da API e enviar ao cliente no WhatsApp.

3. `health-worker`
   - Responsável por verificar se os serviços estão funcionando.
   - Responsável por evitar que serviços entrem em hibernação.

4. `whatsapp-ia-inbox-frontend`
   - Responsável pela interface visual da plataforma.
   - Usuário gerencia e configura a IA pela plataforma.
   - Atualmente consome diretamente serviços da API e do Evolution Go.

---

## Problema atual

O frontend está acoplado diretamente a serviços internos.

Isso causa problemas:

- URLs internas expostas no frontend.
- Possibilidade de expor fluxos que deveriam ser server-side.
- Autenticação espalhada ou frágil.
- Dificuldade de evoluir regras de negócio por usuário.
- Dificuldade de versionar mudanças coordenadas entre frontend, API, Evolution Go e worker.
- Cada repositório precisa ser mantido separadamente.
- Mais trabalho para deploy, configuração de ambiente e documentação.

---

## Arquitetura-alvo

### Fluxo principal do usuário na plataforma

```text
Browser / Frontend
        |
        v
BFF
        |
        +--> API
        |
        +--> Evolution Go
```

### Fluxo de mensagens WhatsApp

Na primeira fase, manter o fluxo atual para reduzir risco:

```text
WhatsApp
   |
   v
Evolution Go
   |
   v
API
   |
   v
Evolution Go
   |
   v
WhatsApp / Cliente
```

O BFF não deve ser inserido no fluxo crítico de recebimento e envio de mensagens do WhatsApp nesta primeira refatoração, a menos que o código atual já dependa disso ou que seja necessário para autenticação/identificação do usuário.

Motivo: o objetivo da primeira fase é refatorar a arquitetura da plataforma sem quebrar o comportamento que já está funcionando.

### Responsabilidade do BFF

O BFF deve ser a única API consumida diretamente pelo frontend.

Responsabilidades:

- autenticar usuários da plataforma;
- emitir e validar JWT;
- expor endpoint de sessão do usuário logado;
- proteger rotas privadas;
- intermediar chamadas para API;
- intermediar chamadas para Evolution Go;
- centralizar CORS para o frontend;
- esconder URLs internas e tokens dos serviços;
- validar permissões do usuário antes de chamar serviços internos;
- traduzir payloads quando necessário;
- padronizar erros para o frontend.

### Responsabilidade da API

A API deve continuar sendo o serviço de domínio para:

- IA;
- geração de respostas;
- lógica de atendimento;
- regras de agendamento;
- integração com “Minha Agenda”;
- configurações de negócio e IA que influenciam o prompt;
- lista de ignorados, se atualmente estiver ou for decidido que ficará no domínio da IA.

### Responsabilidade do Evolution Go

O Evolution Go deve continuar sendo o serviço de domínio para:

- instância WhatsApp;
- QR Code;
- status de conexão;
- eventos do WhatsApp;
- envio de mensagens;
- recebimento de mensagens;
- contatos do WhatsApp, caso já esteja implementado.

### Responsabilidade do frontend

O frontend deve:

- chamar apenas o BFF;
- não conhecer URL da API;
- não conhecer URL do Evolution Go;
- não armazenar tokens de serviços internos;
- não ter acesso a chaves secretas;
- usar sessão/JWT gerenciada pelo BFF;
- continuar responsável apenas por interface e experiência.

### Responsabilidade do health-worker

O health-worker deve:

- monitorar health checks públicos dos serviços;
- incluir o novo BFF no monitoramento;
- não depender de endpoints privados com dados sensíveis;
- não executar lógica de negócio;
- não simular usuário real;
- não enviar mensagens reais.

---

## Não objetivos desta refatoração

Não fazer nesta etapa, a menos que seja necessário para manter compatibilidade:

- reescrever a API de IA;
- reescrever o Evolution Go;
- mudar a API da “Minha Agenda”;
- mudar o fluxo crítico WhatsApp → Evolution Go → API;
- migrar tudo para microsserviços novos;
- trocar banco de dados sem necessidade;
- alterar regras de agendamento;
- implementar novas features de IA;
- criar testes complexos se o projeto ainda não tem estrutura de testes;
- expor endpoints internos diretamente ao frontend.

---

## Estrutura recomendada do monorepo

Codex deve criar um novo repositório privado chamado `atendly-ia`.

Estrutura-alvo:

```text
atendly-ia/
  apps/
    frontend/
      # antigo whatsapp-ia-inbox-frontend

    bff/
      # novo serviço BFF

    api/
      # antigo api

    evolution-go/
      # antigo evolution-go

    health-worker/
      # antigo health-worker

  packages/
    shared/
      # tipos, DTOs, schemas e helpers compartilhados quando fizer sentido

    config/
      # configs compartilhadas somente se forem realmente úteis

  docs/
    architecture/
      current-architecture.md
      target-architecture.md
      bff-contract.md
      render-deploy.md

  infra/
    render/
      # arquivos auxiliares se necessário

  render.yaml
  README.md
  AGENTS.md
  AGENT.md
  .gitignore
  .env.example
```

### Regra importante

Não mover código cegamente sem primeiro entender como cada projeto está estruturado.

Antes de reorganizar, Codex deve identificar:

- linguagem de cada serviço;
- framework de cada serviço;
- gerenciador de pacotes;
- comandos de build;
- comandos de start;
- variáveis de ambiente;
- arquivos Docker, se existirem;
- dependências entre serviços;
- endpoints usados pelo frontend;
- endpoints usados entre API e Evolution Go;
- health checks existentes;
- banco de dados usado por cada serviço.

---

## Estratégia de migração Git

### Opção preferencial: preservar histórico com `git subtree`

Se Codex tiver acesso aos repositórios atuais e permissão de Git, usar `git subtree` para preservar histórico de cada projeto dentro do monorepo.

Exemplo conceitual:

```bash
mkdir atendly-ia
cd atendly-ia
git init
git checkout -b main

git subtree add --prefix=apps/api <URL_DO_REPO_API> main
git subtree add --prefix=apps/evolution-go <URL_DO_REPO_EVOLUTION_GO> main
git subtree add --prefix=apps/health-worker <URL_DO_REPO_HEALTH_WORKER> main
git subtree add --prefix=apps/frontend <URL_DO_REPO_FRONTEND> main
```

Ajustar branch principal de cada repo conforme existir no projeto atual.

### Opção alternativa: cópia simples

Se preservar histórico dificultar a execução, fazer cópia simples dos arquivos para a nova estrutura.

Mesmo nessa opção, documentar no README:

- origem de cada projeto;
- data de migração;
- hash do último commit importado de cada repositório antigo.

---

## Etapa 1 — Inventário técnico antes de alterar

Codex deve começar apenas lendo e documentando.

Criar arquivo:

```text
docs/architecture/current-architecture.md
```

Esse documento deve conter:

- lista dos quatro projetos atuais;
- stack de cada projeto;
- comandos de instalação;
- comandos de build;
- comandos de start;
- variáveis de ambiente exigidas;
- endpoints públicos;
- endpoints internos;
- fluxo atual frontend → API;
- fluxo atual frontend → Evolution Go;
- fluxo atual Evolution Go → API;
- fluxo atual API → Evolution Go;
- health endpoints;
- bancos de dados;
- dependências externas;
- problemas encontrados.

Critério para avançar: conseguir rodar ou pelo menos validar build/start de cada serviço conforme as instruções atuais.

---

## Etapa 2 — Criar monorepo privado

Criar o repositório privado `atendly-ia` no GitHub.

Tarefas:

1. Criar repositório privado.
2. Importar os quatro projetos atuais.
3. Criar estrutura `apps/*`.
4. Criar `README.md` inicial.
5. Criar `.env.example` raiz.
6. Criar `docs/architecture/current-architecture.md`.
7. Criar `docs/architecture/target-architecture.md`.
8. Criar `AGENTS.md`.
9. Criar `AGENT.md`.
10. Fazer primeiro commit.

Mensagem de commit sugerida:

```text
chore: initialize atendly-ia monorepo
```

---

## Etapa 3 — Definir estratégia de workspaces

Codex não deve assumir que todos os serviços usam Node.js.

### Se todos ou a maioria dos serviços forem Node.js/TypeScript

Usar workspace na raiz.

Opções aceitáveis:

- `pnpm-workspace.yaml`;
- `npm workspaces`;
- `turbo.json`, se houver ganho real;
- manter scripts independentes por app, se for mais simples.

Estrutura possível:

```json
{
  "scripts": {
    "dev:frontend": "cd apps/frontend && npm run dev",
    "dev:bff": "cd apps/bff && npm run dev",
    "build:frontend": "cd apps/frontend && npm run build",
    "build:bff": "cd apps/bff && npm run build"
  }
}
```

### Se existirem serviços em linguagens diferentes

Não forçar workspace único.

Manter cada app com seus próprios comandos.

Na raiz, criar scripts apenas para facilitar:

```bash
./scripts/dev-frontend.sh
./scripts/dev-bff.sh
./scripts/build-all.sh
```

---

## Etapa 4 — Criar o BFF

Criar novo app:

```text
apps/bff/
```

### Stack

Codex deve usar a stack mais coerente com o projeto atual.

Recomendação, caso o frontend seja Next/TypeScript e não exista padrão backend dominante:

- Node.js;
- TypeScript;
- Fastify, Express ou NestJS;
- validação com Zod ou biblioteca já usada no projeto;
- JWT;
- bcrypt ou argon2 para senha;
- banco via ORM já existente, caso exista padrão consolidado.

Não adicionar framework pesado sem necessidade.

### Responsabilidades iniciais do BFF

1. Autenticação:
   - cadastro;
   - login;
   - logout;
   - refresh token, se necessário;
   - `/me`;
   - troca de senha, se já existir no frontend.

2. Sessão/JWT:
   - emitir token JWT;
   - validar token JWT;
   - proteger rotas privadas;
   - expirar tokens;
   - não expor dados sensíveis.

3. Proxy/adapters:
   - Evolution Go;
   - API;
   - health dos serviços;
   - configurações usadas pelo frontend.

4. Segurança:
   - CORS somente para domínio do frontend;
   - rate limit em login;
   - sanitização de entrada;
   - logs sem segredos;
   - tokens internos para chamadas service-to-service.

---

## Estratégia de autenticação JWT

### Recomendação para browser

Usar JWT em cookie `HttpOnly`, `Secure` em produção e `SameSite=Lax` ou `Strict`.

Motivo:

- reduz risco de token exposto via JavaScript;
- mantém experiência simples no frontend;
- BFF controla sessão.

### Endpoints mínimos

```http
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/change-password
```

### Payload mínimo do JWT

```json
{
  "sub": "user_id",
  "email": "user_email",
  "iat": 0,
  "exp": 0
}
```

Não colocar no JWT:

- senha;
- tokens da API;
- tokens do Evolution Go;
- chaves da “Minha Agenda”;
- dados sensíveis;
- configurações completas da IA.

### Onde o usuário deve ser persistido

Codex deve verificar se já existe tabela/coleção de usuários em algum serviço.

Opções:

1. Se já existe autenticação funcional no frontend/API:
   - migrar para BFF com cuidado;
   - preservar modelagem útil.

2. Se não existe autenticação centralizada:
   - criar persistência no BFF;
   - usar banco relacional se já houver PostgreSQL;
   - criar tabela de usuários com hash de senha.

### Modelo conceitual

Ajustar ao ORM/banco real do projeto:

```text
User
- id
- email
- passwordHash
- createdAt
- updatedAt

UserSession ou RefreshToken, se necessário
- id
- userId
- tokenHash
- expiresAt
- createdAt
- revokedAt
```

---

## Autorização entre serviços internos

O frontend autentica no BFF.

O BFF autentica nos serviços internos usando token de serviço.

### Exemplo de headers internos

```http
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
X-User-Id: <userId>
X-Request-Id: <requestId>
```

Melhor opção: usar um JWT interno assinado pelo BFF contendo `userId`, `scope`, `audience` e expiração curta.

Exemplo conceitual:

```json
{
  "iss": "bff",
  "aud": "api",
  "sub": "user_id",
  "scope": ["settings:read", "settings:write"],
  "iat": 0,
  "exp": 0
}
```

### Regra

A API e o Evolution Go não devem confiar apenas em `X-User-Id` vindo de qualquer origem.

Eles devem aceitar `X-User-Id` somente se a chamada vier autenticada com token interno válido.

---

## Mapa de rotas do BFF

Codex deve adaptar nomes conforme o frontend atual, mas o frontend deve passar a consumir somente rotas do BFF.

### Auth

```http
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/change-password
```

### WhatsApp / Evolution Go

```http
GET  /whatsapp/status
POST /whatsapp/instance
POST /whatsapp/connect
GET  /whatsapp/qr
GET  /whatsapp/contacts
POST /whatsapp/logout
```

O BFF deve:

- validar usuário autenticado;
- garantir que usuário só acesse sua própria instância;
- chamar Evolution Go com token interno;
- mapear erros técnicos para mensagens seguras.

### Configurações de IA / Atendente Virtual

```http
GET   /virtual-attendant/settings
PATCH /virtual-attendant/settings
GET   /virtual-attendant/prompt-preview
POST  /virtual-attendant/persona/import
POST  /virtual-attendant/persona/generate
```

O BFF pode encaminhar para a API se a API for dona dessas configurações.

### Configurações do negócio

```http
GET   /business-settings
PATCH /business-settings
```

### Lista de ignorados

```http
GET    /ignored-contacts
POST   /ignored-contacts
DELETE /ignored-contacts/:id
```

### Chat

```http
GET /conversations
GET /conversations/:id/messages
```

Se existir envio manual:

```http
POST /conversations/:id/send
```

### Health

```http
GET /health
GET /health/dependencies
```

`/health` deve ser simples e público.

`/health/dependencies` pode exigir token interno ou retornar apenas status resumido.

---

## Estratégia de data ownership

Evitar espalhar dados por serviços sem necessidade.

### Regra inicial

- BFF é dono da autenticação da plataforma.
- API é dona da lógica de IA e agendamento.
- Evolution Go é dono da conexão WhatsApp.
- Frontend não é dono de nenhum dado sensível.

### Configurações de negócio e IA

Como a API usa essas configurações para gerar respostas e agendamentos, existem duas opções:

#### Opção A — API como dona das configurações

BFF apenas autentica o usuário e encaminha requisições para a API.

Vantagens:

- API já está no domínio da IA.
- API acessa configurações sem depender do BFF durante processamento de mensagens.
- Menos acoplamento no fluxo WhatsApp.

Essa é a opção recomendada para a primeira fase.

#### Opção B — BFF como dono das configurações

API consulta o BFF quando precisar montar prompt.

Desvantagem:

- API passa a depender do BFF no fluxo crítico de mensagem.
- BFF deixa de ser apenas frontend gateway.

Não recomendar para esta fase.

### Decisão recomendada

Para esta refatoração:

- BFF autentica;
- API persiste configurações de negócio, IA, persona, lista de ignorados e dados necessários para gerar respostas;
- BFF encaminha o `userId` autenticado para a API usando token interno;
- API valida token interno e aplica autorização por `userId`.

---

## Refatoração do frontend

Objetivo: remover qualquer dependência direta do frontend com API e Evolution Go.

### Tarefas

1. Localizar todos os clients/fetchers atuais.
2. Identificar chamadas para API.
3. Identificar chamadas para Evolution Go.
4. Criar client único para BFF.
5. Substituir chamadas diretas por BFF.
6. Remover variáveis de ambiente públicas que apontam para API/Evolution Go.
7. Manter apenas variável pública do BFF, se necessário.

### Variáveis permitidas no frontend

```env
NEXT_PUBLIC_BFF_URL=
```

Ou, se frontend e BFF usarem mesmo domínio/proxy no futuro:

```text
usar paths relativos /api ou /bff
```

### Variáveis proibidas no frontend

Não devem existir no bundle/browser:

```env
API_URL=
EVOLUTION_GO_URL=
EVOLUTION_GO_API_KEY=
MINHA_AGENDA_API_KEY=
OPENAI_API_KEY=
INTERNAL_SERVICE_TOKEN=
JWT_SECRET=
```

---

## Contratos de resposta do BFF

Padronizar respostas para o frontend.

### Sucesso

```json
{
  "data": {},
  "requestId": "..."
}
```

### Erro

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Sua sessão expirou. Faça login novamente."
  },
  "requestId": "..."
}
```

### Códigos mínimos

```text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
CONFLICT
UPSTREAM_ERROR
INTERNAL_ERROR
```

---

## Observabilidade

Adicionar ou padronizar:

- `requestId`;
- logs estruturados;
- logs sem segredos;
- health check por serviço;
- logs de proxy do BFF com status e latência;
- alertas simples no health-worker.

### Health endpoints sugeridos

Cada serviço deve ter:

```http
GET /health
```

Retorno conceitual:

```json
{
  "status": "ok",
  "service": "bff",
  "timestamp": "2026-06-04T00:00:00.000Z"
}
```

Não retornar:

- tokens;
- string de conexão;
- payloads de cliente;
- configurações sensíveis.

---

## Health-worker

Manter o `health-worker`, mas atualizar targets.

Targets mínimos:

- frontend;
- BFF;
- API;
- Evolution Go.

O worker deve verificar:

- `/health`;
- status HTTP;
- tempo de resposta;
- falhas consecutivas.

Melhoria recomendada:

- criar uma configuração central para URLs dos serviços;
- adicionar logs claros;
- não depender de endpoints autenticados;
- não disparar mensagens reais;
- não usar credenciais de usuário real.

### Alternativa futura

Se o Render Free estiver sendo usado apenas para evitar hibernação, avaliar depois:

- usar plano sem hibernação;
- usar Cron Job do Render para verificações pontuais;
- transformar parte do health-worker em monitoramento real.

Não mudar isso agora sem decisão explícita.

---

## Render — plano de deploy

### Estratégia geral

Manter os serviços existentes no Render quando possível e conectar todos ao novo repositório `atendly-ia`.

Criar o novo serviço:

- `atendly-ia-bff`

Atualizar serviços existentes para apontarem para o monorepo:

- frontend;
- api;
- evolution-go;
- health-worker.

### Monorepo no Render

Cada serviço no Render deve usar `rootDir` correspondente:

```text
apps/frontend
apps/bff
apps/api
apps/evolution-go
apps/health-worker
```

Também configurar build filters quando possível para evitar deploy desnecessário.

Exemplo:

```yaml
services:
  - type: web
    name: atendly-ia-bff
    rootDir: apps/bff
    buildCommand: <comando real do bff>
    startCommand: <comando real do bff>
    buildFilter:
      paths:
        - apps/bff/**
        - packages/**
        - render.yaml
```

Codex deve preencher comandos reais após inspecionar cada app.

### `render.yaml`

Criar `render.yaml` na raiz do repositório.

Não commitar segredos.

Usar placeholders para variáveis sensíveis.

Exemplo conceitual:

```yaml
services:
  - type: web
    name: atendly-ia-frontend
    rootDir: apps/frontend
    runtime: node
    buildCommand: <preencher>
    startCommand: <preencher>
    envVars:
      - key: NEXT_PUBLIC_BFF_URL
        sync: false

  - type: web
    name: atendly-ia-bff
    rootDir: apps/bff
    runtime: node
    buildCommand: <preencher>
    startCommand: <preencher>
    envVars:
      - key: JWT_SECRET
        sync: false
      - key: API_BASE_URL
        sync: false
      - key: EVOLUTION_GO_BASE_URL
        sync: false
      - key: INTERNAL_SERVICE_TOKEN
        sync: false
      - key: FRONTEND_ORIGIN
        sync: false

  - type: web
    name: atendly-ia-api
    rootDir: apps/api
    runtime: <preencher>
    buildCommand: <preencher>
    startCommand: <preencher>
    envVars:
      - key: INTERNAL_SERVICE_TOKEN
        sync: false

  - type: web
    name: atendly-ia-evolution-go
    rootDir: apps/evolution-go
    runtime: <preencher>
    buildCommand: <preencher>
    startCommand: <preencher>
    envVars:
      - key: INTERNAL_SERVICE_TOKEN
        sync: false

  - type: worker
    name: atendly-ia-health-worker
    rootDir: apps/health-worker
    runtime: <preencher>
    buildCommand: <preencher>
    startCommand: <preencher>
    envVars:
      - key: HEALTH_TARGETS
        sync: false
```

Se algum serviço usar Docker, adaptar para `dockerfilePath` e `dockerContext`.

### Variáveis de ambiente

Criar `.env.example` por app e na raiz.

Nunca commitar:

- JWT_SECRET;
- API keys;
- tokens internos;
- tokens do Evolution Go;
- credenciais da “Minha Agenda”;
- secrets de IA;
- strings de conexão reais.

### URLs públicas esperadas

Ao final, documentar no README:

```text
Frontend:      <URL_PUBLICA_RENDER_FRONTEND>
BFF:           <URL_PUBLICA_RENDER_BFF>
API:           <URL_PUBLICA_RENDER_API>
Evolution Go:  <URL_PUBLICA_RENDER_EVOLUTION_GO>
Health Worker: <URL_OU_IDENTIFICADOR_RENDER_WORKER>
```

Se `health-worker` for worker sem URL pública, documentar isso claramente.

---

## Segurança

### Regras obrigatórias

- Frontend só chama BFF.
- BFF valida JWT em rotas privadas.
- BFF não expõe tokens internos ao frontend.
- API e Evolution Go exigem token interno para chamadas sensíveis.
- CORS da API e Evolution Go não deve permitir chamadas diretas do frontend.
- CORS do BFF deve permitir apenas a URL do frontend.
- Logs não podem conter segredos.
- `.env` real não deve ir para Git.
- JWT deve ter expiração.
- Senhas devem ser armazenadas com hash forte.
- Endpoints de login devem ter rate limit.

### Migração segura

Antes de trocar URLs em produção:

1. Subir BFF no Render.
2. Testar BFF manualmente.
3. Apontar frontend em ambiente de teste para BFF.
4. Validar todos os fluxos.
5. Só depois remover chamadas diretas no frontend.
6. Só depois endurecer CORS dos serviços internos.

---

## Plano de execução por fases

## Fase 0 — Preparação

1. Obter acesso aos quatro repositórios atuais.
2. Obter acesso ao GitHub onde será criado `atendly-ia`.
3. Obter acesso ao Render.
4. Levantar variáveis de ambiente atuais.
5. Levantar URLs públicas atuais.
6. Identificar branch principal de cada repo.
7. Fazer backup dos bancos, se existirem dados que não podem ser perdidos.
8. Confirmar se ambiente atual é teste ou produção.

## Fase 1 — Inventário e documentação

1. Inspecionar cada projeto.
2. Documentar arquitetura atual.
3. Documentar comandos.
4. Documentar envs.
5. Documentar endpoints.
6. Documentar dependências externas.
7. Validar build/start local ou em ambiente equivalente.
8. Criar diagrama simples em Markdown.

Entrega:

```text
docs/architecture/current-architecture.md
```

## Fase 2 — Criação do monorepo

1. Criar repositório privado `atendly-ia`.
2. Importar projetos para `apps/*`.
3. Adicionar README raiz.
4. Adicionar `.env.example`.
5. Adicionar `AGENTS.md` e `AGENT.md`.
6. Criar primeiro commit.
7. Subir para GitHub.

Entrega:

```text
GitHub privado: atendly-ia
```

## Fase 3 — BFF base

1. Criar `apps/bff`.
2. Configurar build/start.
3. Criar `/health`.
4. Criar estrutura de config/env.
5. Criar middleware de erro.
6. Criar middleware de requestId.
7. Criar CORS para frontend.
8. Criar client para API.
9. Criar client para Evolution Go.

Entrega:

```text
BFF rodando localmente com /health
```

## Fase 4 — Autenticação JWT

1. Criar persistência de usuários se ainda não existir.
2. Implementar cadastro/login/logout/me.
3. Implementar hash de senha.
4. Implementar JWT.
5. Implementar cookie HttpOnly.
6. Implementar middleware de autenticação.
7. Implementar rate limit no login.
8. Validar sessão no frontend.

Entrega:

```text
Usuário consegue autenticar pelo BFF
```

## Fase 5 — Proxy para API e Evolution Go

1. Mapear chamadas atuais do frontend.
2. Criar endpoints equivalentes no BFF.
3. Encaminhar chamadas para API/Evolution Go.
4. Incluir token interno.
5. Incluir userId autenticado.
6. Padronizar erros.
7. Validar autorização.

Entrega:

```text
Frontend consegue executar fluxos atuais via BFF
```

## Fase 6 — Refatorar frontend

1. Criar client BFF.
2. Remover client direto da API.
3. Remover client direto do Evolution Go.
4. Atualizar telas para usar BFF.
5. Remover envs públicas antigas.
6. Garantir que build do frontend não contém segredos.
7. Testar fluxos principais.

Fluxos mínimos:

- login;
- logout;
- carregar usuário logado;
- conectar WhatsApp;
- QR Code;
- status da instância;
- chat/conversas;
- configurações da IA;
- configurações do negócio;
- lista de ignorados, se já existir;
- Atendente Virtual, se já existir.

## Fase 7 — Endurecer serviços internos

1. API deve aceitar chamadas do BFF com token interno.
2. Evolution Go deve aceitar chamadas do BFF com token interno.
3. Revisar CORS.
4. Bloquear chamadas diretas do frontend.
5. Garantir que endpoints de webhook necessários continuem acessíveis.
6. Não bloquear webhooks públicos necessários.

## Fase 8 — Render

1. Criar ou atualizar `render.yaml`.
2. Configurar rootDir por serviço.
3. Configurar env vars por serviço.
4. Criar novo serviço BFF.
5. Atualizar serviços existentes para o monorepo.
6. Configurar deploy automático.
7. Configurar health checks.
8. Validar URLs públicas.
9. Atualizar frontend com URL do BFF.
10. Atualizar health-worker com novas URLs.

## Fase 9 — QA final

Executar checklist:

- build de cada serviço;
- start de cada serviço;
- health de cada serviço;
- login;
- logout;
- sessão expirada;
- frontend sem chamadas diretas para API/Evolution Go;
- conexão WhatsApp;
- QR Code;
- recebimento de mensagem;
- envio de resposta pela IA;
- agendamento na “Minha Agenda”;
- configurações da IA;
- configurações do negócio;
- lista de ignorados;
- health-worker monitorando;
- logs sem segredos;
- deploy automático funcionando.

## Fase 10 — Documentação final

Atualizar:

- README raiz;
- README por app, se necessário;
- `docs/architecture/target-architecture.md`;
- `docs/architecture/bff-contract.md`;
- `docs/architecture/render-deploy.md`;
- `AGENTS.md`;
- `AGENT.md`.

---

## Critérios de aceite

### Monorepo

1. Existe um repositório privado chamado `atendly-ia`.
2. Os quatro projetos atuais estão dentro de `apps/*`.
3. O novo BFF está em `apps/bff`.
4. O histórico foi preservado ou a origem dos commits foi documentada.
5. O README explica como rodar o projeto.
6. `.env.example` existe e não contém segredos.
7. `AGENTS.md` existe na raiz.
8. `AGENT.md` existe na raiz.

### BFF

9. BFF possui `/health`.
10. BFF autentica usuário com JWT.
11. BFF expõe `/auth/login`, `/auth/logout` e `/auth/me`.
12. BFF protege rotas privadas.
13. BFF chama API com token interno.
14. BFF chama Evolution Go com token interno.
15. BFF padroniza erros para o frontend.
16. BFF não expõe segredos ao browser.

### Frontend

17. Frontend consome apenas o BFF.
18. Frontend não contém URL pública direta da API.
19. Frontend não contém URL pública direta do Evolution Go.
20. Frontend não contém API keys.
21. Login/logout funcionam.
22. Fluxos atuais continuam funcionando.

### API e Evolution Go

23. API continua gerando respostas da IA.
24. API continua fazendo agendamentos na “Minha Agenda”.
25. Evolution Go continua recebendo mensagens/eventos do WhatsApp.
26. Evolution Go continua enviando mensagens para clientes.
27. Pipeline WhatsApp atual continua funcionando.
28. Chamadas internas sensíveis exigem token interno.

### Render

29. Serviços estão no Render.
30. Serviços existentes foram mantidos quando possível.
31. Novo serviço BFF foi criado.
32. Cada serviço usa `rootDir` correto no monorepo.
33. Deploy automático está configurado.
34. URLs públicas foram documentadas.
35. Health-worker monitora o BFF e os serviços existentes.

---

## Riscos e mitigação

### Risco 1 — Quebrar o fluxo WhatsApp

Mitigação:

- não alterar inicialmente o fluxo Evolution Go → API → Evolution Go;
- refatorar primeiro apenas o consumo do frontend;
- validar recebimento e envio de mensagens antes de endurecer segurança.

### Risco 2 — Frontend continuar chamando serviços antigos

Mitigação:

- fazer busca global por URLs/envs antigas;
- remover variáveis públicas antigas;
- revisar bundle;
- bloquear CORS dos serviços internos depois da validação.

### Risco 3 — BFF virar uma API de domínio grande demais

Mitigação:

- BFF deve autenticar, autorizar, agregar e encaminhar;
- regras de IA/agendamento continuam na API;
- regras de WhatsApp continuam no Evolution Go.

### Risco 4 — Segredos vazarem no monorepo

Mitigação:

- revisar `.env`;
- adicionar `.gitignore`;
- usar `.env.example`;
- usar Render Environment Variables;
- não commitar tokens.

### Risco 5 — Deploy desnecessário de todos os serviços

Mitigação:

- usar `rootDir`;
- usar build filters;
- configurar comandos por serviço.

---

## Melhorias recomendadas

### 1. Criar ambiente de staging

Antes de mexer no ambiente público principal, criar serviços de staging no Render.

Nomes sugeridos:

```text
atendly-ia-frontend-staging
atendly-ia-bff-staging
atendly-ia-api-staging
atendly-ia-evolution-go-staging
```

### 2. Usar tokens internos com audience

Em vez de um único token fixo, usar JWT interno curto com `aud`.

Exemplo:

- BFF → API: `aud=api`;
- BFF → Evolution Go: `aud=evolution-go`;
- Evolution Go → API: `aud=api`.

### 3. Criar contratos compartilhados

Se os serviços forem TypeScript, criar:

```text
packages/shared
```

Para:

- DTOs;
- tipos;
- schemas de validação;
- códigos de erro;
- enums de configurações.

Não fazer isso se gerar acoplamento excessivo ou se os serviços estiverem em linguagens diferentes.

### 4. Criar documentação de fluxos críticos

Em `docs/architecture/target-architecture.md`, documentar:

- login;
- conexão WhatsApp;
- recebimento de mensagem;
- resposta da IA;
- agendamento;
- lista de ignorados;
- Atendente Virtual.

### 5. Criar smoke tests manuais

Mesmo sem suíte automatizada, criar arquivo:

```text
docs/qa/manual-smoke-test.md
```

Com passos simples para validar deploy.

---

# Goal completo para colar no Codex

## Tarefa

Refatorar a arquitetura atual para um monorepo privado chamado `atendly-ia`, criar um novo serviço BFF, migrar o frontend para consumir somente o BFF, manter os serviços existentes funcionando, configurar deploy no Render e adicionar documentação persistente para que o Codex entenda o projeto em prompts futuros.

## Contexto

Atualmente existem quatro projetos separados em quatro repositórios:

1. `api`: integra com IA, gera respostas e faz agendamentos na API da “Minha Agenda”.
2. `evolution-go`: cria instância WhatsApp, recebe mensagens/eventos, envia para API, recebe resposta da API e envia para o cliente.
3. `health-worker`: verifica se serviços estão funcionando e evita hibernação.
4. `whatsapp-ia-inbox-frontend`: interface visual onde o usuário gerencia e configura a IA.

Quero manter tudo em um único repositório privado chamado `atendly-ia`.

Também quero criar um BFF como intermediário: o frontend deve consumir apenas o BFF. O BFF será responsável pela autenticação do usuário na plataforma via JWT e por encaminhar chamadas autenticadas para API e Evolution Go.

## Regras importantes

- Não invente endpoints, comandos ou tecnologias. Primeiro inspecione o projeto.
- Não reescreva serviços existentes sem necessidade.
- Preserve o comportamento atual antes de implementar melhorias.
- O fluxo WhatsApp atual deve continuar funcionando.
- O frontend não pode mais consumir API ou Evolution Go diretamente.
- O frontend não pode ter segredos ou tokens internos.
- O BFF deve autenticar usuários via JWT.
- Chamadas do BFF para API/Evolution Go devem usar autenticação interna.
- API continua responsável por IA e agendamentos.
- Evolution Go continua responsável por WhatsApp.
- Health-worker deve continuar existindo e passar a monitorar o BFF também.
- Criar `AGENTS.md` e `AGENT.md` na raiz com contexto completo do projeto.
- Subir serviços no Render.
- Manter serviços existentes no Render quando possível e criar novos quando necessário.
- Configurar deploy automático por commit na branch principal.
- Documentar URLs públicas finais.
- Não commitar segredos.

## Execução

### 1. Inventário

Inspecione os quatro projetos atuais e crie:

```text
docs/architecture/current-architecture.md
```

Documente stack, comandos, envs, endpoints, bancos, dependências e fluxos.

### 2. Monorepo

Crie repo privado:

```text
atendly-ia
```

Estruture:

```text
apps/frontend
apps/bff
apps/api
apps/evolution-go
apps/health-worker
packages/shared
docs/architecture
infra/render
```

Importe os projetos atuais para `apps/*`.

Preserve histórico com `git subtree` se possível. Se não for possível, documente origem e último commit de cada repo antigo.

### 3. BFF

Crie o app `apps/bff`.

Implemente:

```http
GET /health
POST /auth/register
POST /auth/login
POST /auth/logout
GET /auth/me
POST /auth/change-password
```

Implemente autenticação JWT, preferencialmente com cookie HttpOnly no browser.

Crie clients internos para:

- API;
- Evolution Go.

Crie middleware para:

- autenticação;
- autorização;
- requestId;
- CORS;
- erro padrão;
- rate limit no login.

### 4. Proxies do BFF

Mapeie chamadas atuais do frontend e crie rotas equivalentes no BFF.

O frontend deve passar a chamar somente o BFF.

Rotas conceituais:

```http
/whatsapp/*
/virtual-attendant/*
/business-settings
/ignored-contacts
/conversations
```

Não criar rotas sem verificar as necessidades reais do frontend.

### 5. Frontend

Refatore o frontend:

- criar client BFF;
- remover client direto da API;
- remover client direto do Evolution Go;
- remover envs públicas antigas;
- validar login/logout;
- validar telas atuais;
- garantir que somente `NEXT_PUBLIC_BFF_URL` seja usado para comunicação externa da plataforma.

### 6. API e Evolution Go

Adicionar validação de token interno para chamadas vindas do BFF.

Não quebrar webhooks e endpoints públicos necessários.

Garantir que:

- API continue gerando respostas;
- API continue agendando na “Minha Agenda”;
- Evolution Go continue recebendo e enviando mensagens;
- pipeline atual continue funcionando.

### 7. Render

Criar `render.yaml` na raiz.

Configurar cada serviço com `rootDir`:

```text
apps/frontend
apps/bff
apps/api
apps/evolution-go
apps/health-worker
```

Manter serviços existentes quando possível.

Criar novo serviço:

```text
atendly-ia-bff
```

Configurar env vars no Render sem commitar segredos.

Configurar deploy automático.

Atualizar health-worker para monitorar BFF.

Documentar URLs finais.

### 8. Documentação

Criar/atualizar:

```text
README.md
AGENTS.md
AGENT.md
docs/architecture/current-architecture.md
docs/architecture/target-architecture.md
docs/architecture/bff-contract.md
docs/architecture/render-deploy.md
docs/qa/manual-smoke-test.md
```

### 9. QA

Validar:

- build/start dos serviços;
- health checks;
- login/logout;
- sessão JWT;
- frontend sem chamadas diretas para API/Evolution Go;
- conexão WhatsApp;
- QR Code;
- mensagens recebidas;
- resposta da IA;
- agendamento na “Minha Agenda”;
- configurações da IA;
- configurações do negócio;
- lista de ignorados, se existir;
- Render deploy automático;
- health-worker monitorando.

## Critério de conclusão

A tarefa só está concluída quando:

- monorepo privado existe;
- todos os serviços estão no monorepo;
- BFF está implementado;
- frontend consome somente BFF;
- autenticação JWT funciona;
- serviços continuam funcionando;
- Render está configurado;
- URLs públicas estão documentadas;
- `AGENTS.md` e `AGENT.md` existem com contexto do projeto;
- não há segredos no Git;
- README explica como rodar e fazer deploy.

---

# Conteúdo sugerido para `AGENTS.md` e `AGENT.md`

> Criar `AGENTS.md` como arquivo principal. Criar também `AGENT.md` com o mesmo conteúdo ou com uma nota apontando para `AGENTS.md`.

```md
# AGENTS.md — Atendly IA

## Visão geral

Este repositório contém a plataforma Atendly IA, uma solução para atendimento via WhatsApp com IA, automações e agendamentos.

O projeto é um monorepo privado.

## Estrutura

- `apps/frontend`: interface web da plataforma.
- `apps/bff`: backend-for-frontend. É a única API consumida pelo frontend.
- `apps/api`: serviço de domínio de IA, respostas e agendamentos na API da Minha Agenda.
- `apps/evolution-go`: serviço responsável por instância WhatsApp, eventos, QR Code, mensagens e envio.
- `apps/health-worker`: serviço de monitoramento/health check.
- `packages/shared`: tipos, DTOs e schemas compartilhados, quando aplicável.
- `docs`: documentação técnica e de produto.
- `infra`: arquivos auxiliares de infraestrutura.

## Arquitetura

O frontend deve consumir somente o BFF.

Fluxo da plataforma:

Browser → Frontend → BFF → API/Evolution Go

Fluxo de WhatsApp:

WhatsApp → Evolution Go → API → Evolution Go → WhatsApp

O BFF não deve ser colocado no fluxo crítico de mensagens WhatsApp sem decisão explícita.

## Responsabilidades

### Frontend

- Interface do usuário.
- Mobile-first.
- Não contém segredos.
- Não chama API diretamente.
- Não chama Evolution Go diretamente.
- Chama apenas o BFF.

### BFF

- Autenticação de usuários.
- JWT.
- Sessão.
- Autorização.
- Proxy seguro para API e Evolution Go.
- Padronização de erros.
- CORS para o frontend.
- Não implementa regras profundas de IA/agendamento.

### API

- IA.
- Prompt.
- Personas.
- Configurações de negócio usadas pela IA.
- Lista de ignorados, se estiver no domínio de IA.
- Agendamentos na Minha Agenda.
- Geração de respostas.

### Evolution Go

- Instância WhatsApp.
- QR Code.
- Status de conexão.
- Recebimento de eventos.
- Envio de mensagens.
- Contatos WhatsApp.

### Health-worker

- Monitoramento dos serviços.
- Health checks.
- Não executa regra de negócio.
- Não envia mensagens reais.

## Regras de negócio principais

- Cada usuário pode ter apenas um número de WhatsApp conectado.
- Cada usuário tem suas próprias configurações de negócio.
- Cada usuário tem suas próprias configurações de IA.
- O usuário pode ativar/desativar a IA.
- A IA deve respeitar lista de ignorados.
- A IA deve respeitar regras de persona e instruções adicionais.
- A IA deve validar disponibilidade antes de confirmar agendamento.
- A IA deve suportar agendamento com múltiplos serviços.
- Ao confirmar múltiplos serviços, informar valor total, horário de início e horário de fim.
- A IA deve analisar histórico antes de responder.
- A IA não deve responder imediatamente cada mensagem; deve respeitar debounce.
- Ao receber `/ia_pause` vindo do próprio número conectado, o contato deve entrar na lista de ignorados.
- Contatos pessoais devem poder ser ignorados para evitar respostas automáticas indevidas.

## Segurança

- Nunca commitar `.env` real.
- Nunca expor `JWT_SECRET`.
- Nunca expor API keys.
- Nunca expor tokens do Evolution Go.
- Nunca expor credenciais da Minha Agenda.
- Frontend não deve conter secrets.
- BFF é a única API pública consumida pelo frontend.
- API e Evolution Go devem exigir token interno para chamadas sensíveis.
- Logs não devem conter senhas, tokens ou payloads sensíveis completos.
- Senhas devem ser armazenadas com hash forte.
- JWT deve ter expiração.
- CORS deve ser restrito.

## Render

Cada serviço deve ter seu próprio rootDir no Render:

- `apps/frontend`
- `apps/bff`
- `apps/api`
- `apps/evolution-go`
- `apps/health-worker`

Usar `render.yaml` na raiz quando possível.

Não colocar valores secretos no `render.yaml`.

## Regras para o Codex

Antes de alterar código:

1. Inspecione a estrutura atual.
2. Leia READMEs.
3. Leia `.env.example`.
4. Leia documentação em `docs`.
5. Identifique comandos reais de build/start.
6. Não invente endpoints.
7. Não altere o fluxo WhatsApp sem necessidade.
8. Não mova regra de domínio para o BFF sem justificativa.
9. Não exponha segredos.
10. Preserve o comportamento atual antes de melhorar.

Ao finalizar qualquer tarefa:

1. Atualize documentação se a arquitetura mudou.
2. Atualize `.env.example` se novas envs foram adicionadas.
3. Rode build/lint se existirem comandos.
4. Verifique se frontend continua chamando apenas BFF.
5. Verifique se não há segredos no diff.
6. Descreva mudanças feitas e pendências.

## Padrão de commits

Usar commits claros:

- `chore:`
- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `infra:`

## Definição de pronto

Uma mudança está pronta quando:

- compila;
- não quebra fluxos principais;
- não expõe segredos;
- segue arquitetura do monorepo;
- atualiza documentação;
- mantém frontend consumindo apenas BFF;
- tem passos de validação manual documentados.
```
