#!/bin/sh
# Render start command. With R2 configured, Litestream restores the database
# (only when the file is missing, as on every fresh free-plan instance), then
# runs the server as its child and keeps streaming changes. Without R2 the
# server starts exactly as before, with an ephemeral database.
set -eu

DATABASE_PATH="${DATABASE_PATH:-$(pwd)/data/wildcatter.sqlite}"
export DATABASE_PATH
SERVER="node dist-server/server/index.js"

if [ -z "${LITESTREAM_REPLICA_URL:-}" ]; then
  echo "start-hosted: LITESTREAM_REPLICA_URL unset; database is ephemeral" >&2
  exec $SERVER
fi

mkdir -p "$(dirname "$DATABASE_PATH")"
exec ./bin/litestream replicate -config litestream.yml \
  -restore-if-db-not-exists -exec "$SERVER"
