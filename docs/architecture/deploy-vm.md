# Deploy em VM única (Docker Compose)

Forma de deploy de produção: a plataforma inteira em uma VM, com os serviços
sempre ligados. A Evolution Go mantém a sessão do WhatsApp aberta, e a IA roda
o inbox e os lembretes em laço contínuo. Por isso nenhum serviço pode dormir
por falta de tráfego.

O `render.yaml` e o `apps/health-worker` saíram do repositório. O plano free
do Render desligava os serviços ociosos, e o health-worker existia só para
mantê-los acordados.

Arquivos:

- `docker-compose.prod.yml`: topologia de produção.
- `.env.production.example`: variáveis e como gerar cada segredo.
- `apps/*/Dockerfile`: uma imagem por serviço. Frontend e BFF usam a raiz do
  repositório como contexto de build, porque dependem de `packages/`.
- `infra/postgres/`: imagem do Postgres (pgvector) com o
  `init-databases.sh` embutido, que cria usuário e banco por serviço na
  primeira subida do volume. O script vai dentro da imagem, não por bind
  mount: o Coolify não garante o arquivo do repositório no host, e o Docker
  monta um diretório vazio no lugar. A auditoria
  (`production_config_no_repository_bind_mounts`) reprova bind mount relativo
  no compose.

## Topologia

| Serviço | Exposição | Observação |
| --- | --- | --- |
| `frontend` | pública (`APP_URL`), porta 3001 | `NEXT_PUBLIC_BFF_URL` e os `AVENLY_*` são embutidos no build |
| `bff` | pública (`API_URL`), porta 3002 | CORS restrito a `APP_URL`, cookie `Secure`, `TRUST_PROXY_HOPS=1` (IP real para o rate limit) |
| `ai-orchestrator` | interna | recebe o webhook da Evolution pela rede do compose |
| `scheduling-service` | interna | |
| `evolution-go` | interna | `CONNECT_ON_STARTUP=true` reconecta as instâncias após restart |
| `postgres` | interna | pgvector; um usuário e um banco por serviço |

Os serviços Node aplicam `prisma migrate deploy` antes de subir. Cada serviço
tem healthcheck no compose.

O `validate:core` audita o `docker-compose.prod.yml` em
`scripts/final-production-audit.mjs`: cobertura das env obrigatórias, flags de
laço explícitas, nenhum host de desenvolvimento nem segredo literal, e
contexto de build e Dockerfile existentes.

## CI/CD

O job `deploy` de `.github/workflows/validate.yml` dispara o deploy no
Coolify. Ele só roda em push na `main` e só depois de `core`, `go-windows` e
`integration` passarem. PR e `workflow_dispatch` nunca publicam.

Configuração no GitHub (Settings → Secrets and variables → Actions):

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variable | `DEPLOY_ENABLED` | `true` quando a VM existir; ausente, o job fica pulado |
| Secret | `COOLIFY_DEPLOY_WEBHOOK` | URL de deploy do recurso no Coolify (`https://<coolify>/api/v1/deploy?uuid=<uuid>`) |
| Secret | `COOLIFY_API_TOKEN` | token de API do Coolify com permissão de deploy |

No Coolify, desligue o auto-deploy por push do recurso. Senão ele publica
antes do CI terminar, inclusive commit que vai reprovar.

O job só aciona o deploy, não espera o fim dele. O resultado do build e da
subida fica no painel do Coolify.

## Cuidados

- `NEXT_PUBLIC_BFF_URL` é lida no `next build`. Trocar `API_URL` exige rebuild
  do frontend.
- As senhas de banco são lidas só na criação do volume. Trocar depois exige
  `ALTER ROLE` no Postgres.
- Com `app.<domínio>` e `api.<domínio>`, o cookie `lax` funciona porque os dois
  são same-site. Se frontend e API ficarem em domínios registráveis diferentes,
  use `COOKIE_SAME_SITE=none`.
- `TRUST_PROXY_HOPS=1` vale com o DNS da Cloudflare em modo "DNS only" (nuvem
  cinza), com só o Traefik na frente do BFF. Com o proxy da Cloudflare ligado
  (nuvem laranja) são dois proxies: use `2` e restrinja as portas 80/443 da VM
  às faixas de IP da Cloudflare. Sem essa restrição, quem acessar a VM direto
  forja o IP do rate limit.
- Backup: o volume `postgres_data` é o único estado. Agende um `pg_dumpall`
  para fora da VM.
