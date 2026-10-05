#!/bin/sh
set -e

# No JWT_SECRET given: create one per installation and keep it on the data
# volume, so sessions survive restarts and no two installs share a secret.
if [ -z "$JWT_SECRET" ]; then
  SECRET_FILE="${DATA_DIR:-/data}/jwt_secret"
  if [ ! -s "$SECRET_FILE" ]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
  fi
  JWT_SECRET="$(cat "$SECRET_FILE")"
  export JWT_SECRET
fi

node src/db/migrate.js

# Runs on every start, so it only ever fills gaps: the first admin while there
# is none, sample data into an empty database (see src/db/seed.js).
if [ "$SEED_ON_START" = "true" ]; then
  node src/db/seed.js
fi

exec node server.js
