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

## Backup

O volume `postgres_data` é o único estado da aplicação. O backup diário roda na
VM por um timer do systemd, com os arquivos de `infra/backup/`:

- `avenly-db-backup.sh` (em `/usr/local/bin/`) grava, em
  `/var/backups/avenly/<data UTC>/`, um `pg_dump -Fc` de cada banco do Postgres
  do compose, os roles (`globals.sql`), o banco do Coolify e um `SHA256SUMS`.
  Cada dump passa por `pg_restore --list` antes de ser aceito. O container é
  achado pelos labels do compose, porque o nome muda a cada deploy.
- `avenly-db-backup.timer` dispara às 06:30 UTC (03:30 de Brasília), com
  `Persistent=true`: se a VM estava desligada, o backup roda ao ligar.
- Ficam os últimos 14 dias. O diretório é só do root.
- `restore-check.sh` restaura o backup mais recente num Postgres descartável e
  conta as tabelas de cada banco. Rode depois de mudar o script.

Comandos na VM:

```bash
sudo systemctl start avenly-db-backup.service     # backup agora
sudo journalctl -u avenly-db-backup.service -n 20 # resultado do último
systemctl list-timers avenly-db-backup.timer      # próxima execução
```

Restaurar um banco (com a aplicação parada para ele):

```bash
sudo docker exec -i <container postgres> pg_restore -U postgres -d <banco> --clean --if-exists < /var/backups/avenly/<data>/<banco>.dump
```

### Cópia fora da VM

Cada backup também vai para o bucket privado `avenly-db-backups` do Object
Storage da Oracle (região `sa-vinhedo-1`), em `<data UTC>/<arquivo>`, com o
`SHA256SUMS` por último. Usa o OCI CLI da VM (`/opt/oci-cli`, link em
`/usr/local/bin/oci`), autenticado pelo instance principal: sem senha nem
token na VM.

- Grupo dinâmico `avenly-backup` (domínio Default): só a instância
  `avenly-prod`.
- Política `avenly-backup` (root): o grupo só tem `OBJECT_CREATE` e
  `OBJECT_INSPECT` no bucket. A VM cria e lista; não lê, não apaga nem
  sobrescreve (o upload usa `--no-overwrite`). Quem invadir a VM não destrói as
  cópias.
- A mesma política deixa o serviço `objectstorage-sa-vinhedo-1` gerenciar
  objetos, para a regra de ciclo de vida `apagar-30-dias` do bucket apagar o
  que passa de 30 dias.

Para restaurar a partir do bucket, baixe a pasta da data pelo console (ou por
um usuário com leitura) e use o `pg_restore` acima. A cópia fica no mesmo
provedor da VM: cobre a perda da VM, não a perda da conta Oracle.
