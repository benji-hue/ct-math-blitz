#!/usr/bin/env bash
# Подключение к серверу для деплоя (.github/workflows/deploy-server.yml): пишет в ~/.ssh/config
# хост «krok» и открывает одно общее соединение на весь деплой — пароль, если вход по паролю,
# вводится один раз, а следующие ssh/scp идут через это соединение.
#
# Переменные: SERVER_HOST, SERVER_USER, [SERVER_PORT], SERVER_SSH_KEY или SERVER_PASSWORD,
# [SERVER_KNOWN_HOSTS] — строка из `ssh-keyscan` или просто ключ из /etc/ssh/ssh_host_ed25519_key.pub.
set -euo pipefail

fail() {
  echo "::error title=Нет доступа по SSH::$1"
  exit 1
}

port="${SERVER_PORT:-22}"
[[ "${SERVER_HOST:-}" =~ ^[A-Za-z0-9.:-]+$ ]] || fail "SERVER_HOST должен быть IP или именем сервера"
[[ "${SERVER_USER:-}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "SERVER_USER должен быть именем пользователя, например root"
[[ "$port" =~ ^[0-9]+$ ]] || fail "SERVER_PORT должен быть числом"
if [ "$port" = 22 ]; then target="$SERVER_HOST"; else target="[$SERVER_HOST]:$port"; fi

install -d -m 700 ~/.ssh
known="$HOME/.ssh/known_hosts"
: > "$known"
if [ -n "${SERVER_KNOWN_HOSTS:-}" ]; then
  # Строку из ssh-keyscan берём как есть, к голому ключу («ssh-ed25519 AAAA…») дописываем адрес.
  while read -r first rest; do
    [ -n "$first" ] || continue
    case "$first" in
      ssh-* | ecdsa-* | sk-*) echo "$target $first $rest" ;;
      *) echo "$first $rest" ;;
    esac
  done <<<"$SERVER_KNOWN_HOSTS" >"$known"
  checking=yes
else
  checking=accept-new
fi

cat >~/.ssh/config <<EOF
Host krok
  HostName $SERVER_HOST
  User $SERVER_USER
  Port $port
  StrictHostKeyChecking $checking
  UserKnownHostsFile $known
  HashKnownHosts no
  ServerAliveInterval 30
  ConnectTimeout 20
  ControlMaster auto
  ControlPath ~/.ssh/krok-%C
  ControlPersist 30m
EOF

hint="проверьте SERVER_HOST, SERVER_USER и секрет для входа; если SERVER_KNOWN_HOSTS задан — что это ключ именно этого сервера"
if [ -n "${SERVER_SSH_KEY:-}" ]; then
  printf '%s\n' "$SERVER_SSH_KEY" >~/.ssh/krok
  chmod 600 ~/.ssh/krok
  printf '  IdentityFile ~/.ssh/krok\n  IdentitiesOnly yes\n' >>~/.ssh/config
  ssh -o BatchMode=yes -fN krok || fail "$hint"
elif [ -n "${SERVER_PASSWORD:-}" ]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null && sudo apt-get install -y -qq sshpass >/dev/null
  fi
  SSHPASS="$SERVER_PASSWORD" sshpass -e ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive \
    -o NumberOfPasswordPrompts=1 -fN krok ||
    fail "$hint. Вход root по паролю должен быть разрешён на сервере (PermitRootLogin yes)"
else
  fail "нужен секрет SERVER_PASSWORD (пароль) или SERVER_SSH_KEY (закрытый ключ)"
fi
ssh -O check krok 2>/dev/null || fail "$hint"
echo "SSH: подключение есть"

if [ "$checking" = accept-new ]; then
  # Адрес — секрет, в логе он скрыт звёздочками, поэтому печатаем только сам ключ.
  echo "::warning title=Ключ сервера не закреплён::Чтобы следующие деплои проверяли, что это ваш сервер, добавьте секрет SERVER_KNOWN_HOSTS — строку «ssh-…» из лога этого шага."
  awk '{ print $2, $3 }' "$known"
fi
