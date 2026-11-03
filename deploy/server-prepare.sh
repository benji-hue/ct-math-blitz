#!/usr/bin/env bash
# На сервере перед выкладкой (deploy-server.yml): ставит Docker, если его нет, и решает,
# кто будет отвечать по HTTPS:
#   caddy — порты 80 и 443 свободны (или их уже держит наш Caddy): HTTPS даёт Caddy из compose.yml;
#   nginx — на сервере уже работает nginx с другими сайтами: добавляем ему свой сайт
#           (deploy/nginx-site.sh), чужие сайты не трогаем.
# Последняя строка вывода — KROK_MODE=caddy или KROK_MODE=nginx.
set -euo pipefail

if ! (command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1); then
  if [ "$(id -u)" != 0 ]; then
    echo "::error title=На сервере нет Docker::Установите его один раз от root: curl -fsSL https://get.docker.com | sh — и добавьте пользователя в группу docker"
    exit 1
  fi
  echo "Docker не найден — ставлю официальным скриптом get.docker.com"
  curl -fsSL https://get.docker.com | sh
fi
docker --version
docker compose version

busy=""
if command -v ss >/dev/null 2>&1; then busy="$(ss -H -ltnp '( sport = :80 or sport = :443 )' || true)"; fi
owners="$(printf '%s\n' "$busy" | grep -o 'users:(("[^"]*"' | sed 's/^users:(("//; s/"$//' | sort -u || true)"
our_caddy="$(cd ~/krok 2>/dev/null && docker compose ps -q caddy 2>/dev/null || true)"

if [ -z "$busy" ] || [ -n "$our_caddy" ]; then
  echo "Порты 80 и 443 свободны — HTTPS даст Caddy"
  echo "KROK_MODE=caddy"
elif [ "$owners" = nginx ] && command -v nginx >/dev/null 2>&1; then
  if [ "$(id -u)" != 0 ]; then
    echo "::error title=Нужен root::На сервере работает nginx — чтобы добавить ему сайт «Крока», нужен вход под root"
    exit 1
  fi
  sites="$(nginx -T 2>/dev/null | grep -cE '^[[:space:]]*server_name' || true)"
  echo "На сервере уже работает nginx (блоков server_name: $sites) — добавлю ему сайт «Крока», остальные не трогаю"
  echo "KROK_MODE=nginx"
else
  # Только имена программ и образов — без конфигов и адресов сайтов: лог публичный.
  echo "Порты 80 и 443 уже заняты:"
  printf '%s\n' "$owners" | sed 's/^/  программа: /'
  docker ps --filter publish=80 --filter publish=443 --format '  контейнер: {{.Image}}' 2>/dev/null || true
  echo "::error title=Порты 80 и 443 заняты::На сервере работает другой веб-сервер (какой — выше). Автоматически «Крок» умеет вставать только рядом с nginx — напишите, разберёмся"
  exit 1
fi
