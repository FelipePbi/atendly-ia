# Postgres de produção com o init de bancos embutido na imagem.
# Bind mount do script não serve: plataformas como o Coolify não garantem o
# arquivo do repositório no host, e o Docker cria um diretório vazio no lugar.
FROM pgvector/pgvector:0.8.6-pg17-bookworm

COPY --chmod=755 init-databases.sh /docker-entrypoint-initdb.d/10-init-databases.sh
