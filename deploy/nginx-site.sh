#!/usr/bin/env bash
# Сайт «Крока» в уже работающем nginx (deploy-server.yml, режим nginx): отдельный файл
# конфигурации, сертификат Let's Encrypt через certbot (webroot), прокси на контейнер
# 127.0.0.1:KROK_PORT. Чужие сайты не трогаем. Каждое изменение проверяется `nginx -t`;
# если nginx его не принимает — свой файл убираем, и nginx остаётся как был.
#
#   KROK_DOMAIN=krok.example.by KROK_PORT=8090 bash nginx-site.sh   (от root)
set -euo pipefail

domain="${KROK_DOMAIN:-}"
port="${KROK_PORT:-}"
[[ "$domain" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "::error title=nginx::Некорректный домен"; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] || { echo "::error title=nginx::Некорректный порт"; exit 1; }

reload() { systemctl reload nginx 2>/dev/null || nginx -s reload; }

if ! nginx -t >/dev/null 2>&1; then
  echo "::error title=nginx уже с ошибкой::nginx -t не проходит ещё до изменений — ничего не трогаю. Проверьте: nginx -t"
  exit 1
fi

# Куда класть файл: как принято на этом сервере (sites-enabled у Debian/Ubuntu или conf.d).
layout="$(nginx -T 2>/dev/null || true)"
if [ -d /etc/nginx/sites-enabled ] && grep -qE 'include[[:space:]]+/etc/nginx/sites-enabled/' <<<"$layout"; then
  conf=/etc/nginx/sites-available/krok.conf
  link=/etc/nginx/sites-enabled/krok.conf
elif grep -qE 'include[[:space:]]+/etc/nginx/conf\.d/' <<<"$layout"; then
  conf=/etc/nginx/conf.d/krok.conf
  link=""
else
  echo "::error title=nginx::Не нашёл, куда nginx подключает сайты (sites-enabled или conf.d)"
  exit 1
fi
mkdir -p "$(dirname "$conf")"

backup=""
if [ -f "$conf" ]; then
  backup="$(mktemp)"
  cp "$conf" "$backup"
fi

rollback() {
  echo "::error title=nginx не принял настройки «Крока»::Возвращаю как было — другие сайты не затронуты"
  if [ -n "$backup" ]; then cp "$backup" "$conf"; else rm -f "$conf" ${link:+"$link"}; fi
  if nginx -t >/dev/null 2>&1; then reload; fi
  exit 1
}

webroot=/var/www/krok-acme
challenge="$webroot/.well-known/acme-challenge"
mkdir -p "$challenge"
cert="/etc/letsencrypt/live/$domain"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -s --max-time 3 -H "Host: $domain" "$1"; else wget -q -T 3 -O - --header "Host: $domain" "$1"; fi
}

# nginx перечитывает настройки асинхронно: у каждой версии нашего файла своя метка
# (/.well-known/krok-version), и мы ждём, пока nginx отдаст именно её. Заодно до обращения
# к Let's Encrypt убеждаемся, что проверка домена (/.well-known/acme-challenge/) пройдёт.
version=""
live() {
  local probe="krok-probe-$$" ok=1
  echo "$probe" >"$challenge/$probe"
  for _ in $(seq 1 30); do
    if [ "$(fetch "http://127.0.0.1/.well-known/krok-version" 2>/dev/null)" = "$version" ] &&
      [ "$(fetch "http://127.0.0.1/.well-known/acme-challenge/$probe" 2>/dev/null)" = "$probe" ]; then
      ok=0
      break
    fi
    sleep 0.5
  done
  rm -f "$challenge/$probe"
  return "$ok"
}

apply() {
  if [ -n "$link" ]; then ln -sfn "$conf" "$link"; fi
  if ! nginx -t; then rollback; fi
  reload
  if ! live; then
    echo "::error title=nginx не отдаёт сайт «Крока»::Другой сайт на этом сервере перехватывает домен $domain"
    rollback
  fi
}

proxy() {
  cat <<EOF
    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # IP клиента ставим сами, а не дописываем присланный: приложение ему доверяет.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        # Ответ ИИ идёт потоком (SSE): без буферизации и с запасом по времени.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
EOF
}

acme() {
  cat <<EOF
    location /.well-known/acme-challenge/ {
        root $webroot;
    }

    location = /.well-known/krok-version {
        default_type text/plain;
        return 200 "$version";
    }
EOF
}

if [ ! -f "$cert/fullchain.pem" ]; then
  # Сначала сайт по HTTP — чтобы Let's Encrypt мог проверить домен.
  version="$(date +%s%N)"
  {
    echo "# «Крок» (github.com/benji-hue/ct-math-blitz) — файл создаёт deploy/nginx-site.sh"
    echo "server {"
    echo "    listen 80;"
    echo "    server_name $domain;"
    acme
    proxy
    echo "}"
  } >"$conf"
  apply

  if ! command -v certbot >/dev/null 2>&1; then
    echo "Ставлю certbot"
    if command -v apt-get >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot >/dev/null
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q certbot
    else
      echo "::error title=Нет certbot::Установите certbot и запустите деплой ещё раз"
      exit 1
    fi
  fi
  certbot certonly --webroot -w "$webroot" -d "$domain" --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring \
    --deploy-hook 'systemctl reload nginx || nginx -s reload'
fi

version="$(date +%s%N)"
{
  echo "# «Крок» (github.com/benji-hue/ct-math-blitz) — файл создаёт deploy/nginx-site.sh"
  echo "server {"
  echo "    listen 80;"
  echo "    server_name $domain;"
  acme
  echo "    location / {"
  echo "        return 301 https://\$host\$request_uri;"
  echo "    }"
  echo "}"
  echo
  echo "server {"
  echo "    listen 443 ssl;"
  echo "    server_name $domain;"
  echo "    ssl_certificate $cert/fullchain.pem;"
  echo "    ssl_certificate_key $cert/privkey.pem;"
  proxy
  echo "}"
} >"$conf"
apply
echo "nginx: сайт https://$domain → 127.0.0.1:$port"
