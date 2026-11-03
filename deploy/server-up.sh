#!/usr/bin/env bash
# На сервере (deploy-server.yml): запускает «Крок» из ~/krok. Приложение слушает только
# 127.0.0.1:KROK_PORT — порт выбирается один раз (первый свободный из 8090–8099) и
# запоминается в ~/krok/port. HTTPS — Caddy (KROK_MODE=caddy) или уже работающий nginx.
# Последняя строка вывода — KROK_PORT=<порт>.
set -euo pipefail
mode="${KROK_MODE:-}"
[[ "$mode" = caddy || "$mode" = nginx ]] || { echo "::error::KROK_MODE должен быть caddy или nginx"; exit 1; }
cd ~/krok

port="$(cat port 2>/dev/null || true)"
if ! [[ "$port" =~ ^[0-9]+$ ]]; then
  port=""
  for candidate in $(seq 8090 8099); do
    if [ -z "$(ss -H -ltn "sport = :$candidate" 2>/dev/null)" ]; then
      port="$candidate"
      break
    fi
  done
  [ -n "$port" ] || { echo "::error title=Нет свободного порта::Порты 8090–8099 на сервере заняты"; exit 1; }
  echo "$port" >port
fi
echo "KROK_PORT=$port" >>.env

if [ "$mode" = caddy ]; then
  docker compose --profile caddy up -d --remove-orphans
else
  docker compose up -d --remove-orphans
fi
docker compose ps
echo "KROK_PORT=$port"
