#!/usr/bin/env bash
# Instala Zabbix Server 7.4 (última estável) + frontend + Agent 2 + PostgreSQL
# no Ubuntu 24.04. Rode DENTRO do container/VM (root), não no host do painel.
#
# Uso:
#   sudo bash install-zabbix-server.sh
#   sudo ZABBIX_IP=192.168.15.11 bash install-zabbix-server.sh
set -euo pipefail

ZABBIX_IP="${ZABBIX_IP:-192.168.15.11}"
ZABBIX_DB="${ZABBIX_DB:-zabbix}"
ZABBIX_DB_USER="${ZABBIX_DB_USER:-zabbix}"
ZABBIX_NAME="${ZABBIX_NAME:-AdelMSP}"
TIMEZONE="${TIMEZONE:-America/Sao_Paulo}"
CREDS_FILE="${CREDS_FILE:-/root/zabbix-credentials.txt}"
REPO_DEB="https://repo.zabbix.com/zabbix/7.4/release/ubuntu/pool/main/z/zabbix-release/zabbix-release_latest_7.4+ubuntu24.04_all.deb"

export DEBIAN_FRONTEND=noninteractive

log() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

need_root() {
  [[ ${EUID} -eq 0 ]] || die "Execute como root: sudo bash $0"
}

check_os() {
  [[ -f /etc/os-release ]] || die "Sem /etc/os-release."
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID}" == "ubuntu" ]] || die "Este script é para Ubuntu. Detectado: ${ID}"
  [[ "${VERSION_ID}" == "24.04" ]] || die "Use Ubuntu 24.04. Detectado: ${VERSION_ID}"
}

set_conf() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^#?${key}=" "${file}"; then
    sed -i -E "s|^#?${key}=.*|${key}=${value}|" "${file}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

psql_as_postgres() {
  if command -v runuser >/dev/null; then
    runuser -u postgres -- psql "$@"
  else
    su -s /bin/sh postgres -c "psql $*"
  fi
}

has_listen_ip() {
  ip -4 addr show | grep -q "inet ${ZABBIX_IP}/"
}

install_base() {
  log "Atualizando pacotes e instalando PostgreSQL + Nginx + PHP..."
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg lsb-release iproute2 \
    postgresql postgresql-contrib \
    nginx php8.3-fpm php8.3-pgsql php8.3-mbstring php8.3-bcmath php8.3-xml php8.3-gd php8.3-ldap \
    locales language-pack-en language-pack-pt
  sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
  sed -i 's/^# *pt_BR.UTF-8 UTF-8/pt_BR.UTF-8 UTF-8/' /etc/locale.gen
  grep -qxF 'en_US.UTF-8 UTF-8' /etc/locale.gen || echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen
  grep -qxF 'pt_BR.UTF-8 UTF-8' /etc/locale.gen || echo 'pt_BR.UTF-8 UTF-8' >> /etc/locale.gen
  locale-gen en_US.UTF-8 pt_BR.UTF-8
  update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
  timedatectl set-timezone "${TIMEZONE}" >/dev/null 2>&1 || true
  ln -sf "/usr/share/zoneinfo/${TIMEZONE}" /etc/localtime
  systemctl enable --now postgresql nginx php8.3-fpm
}

install_zabbix_repo() {
  log "Adicionando repositório oficial Zabbix 7.4..."
  local deb="/tmp/zabbix-release.deb"
  wget -qO "${deb}" "${REPO_DEB}"
  dpkg -i "${deb}"
  apt-get update -y
  apt-get install -y \
    zabbix-server-pgsql \
    zabbix-frontend-php \
    zabbix-nginx-conf \
    zabbix-sql-scripts \
    zabbix-agent2
}

db_password() {
  if [[ -n "${ZABBIX_DB_PASSWORD:-}" ]]; then
    printf '%s' "${ZABBIX_DB_PASSWORD}"
    return
  fi
  if [[ -f "${CREDS_FILE}" ]]; then
    awk -F= '/^DB_PASSWORD=/{print substr($0, index($0,$2)); exit}' "${CREDS_FILE}"
    return
  fi
  openssl rand -base64 24 | tr -d '\n/+' | cut -c1-24
}

setup_database() {
  local password="$1"
  log "Configurando banco PostgreSQL..."
  systemctl start postgresql

  psql_as_postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ZABBIX_DB_USER}') THEN
    CREATE ROLE ${ZABBIX_DB_USER} LOGIN PASSWORD '${password}';
  ELSE
    ALTER ROLE ${ZABBIX_DB_USER} WITH LOGIN PASSWORD '${password}';
  END IF;
END
\$\$;
SELECT 'ok';
SQL

  if ! psql_as_postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${ZABBIX_DB}'" | grep -q 1; then
    if command -v runuser >/dev/null; then
      runuser -u postgres -- createdb -O "${ZABBIX_DB_USER}" -E UTF8 -T template0 "${ZABBIX_DB}"
    else
      su -s /bin/sh postgres -c "createdb -O ${ZABBIX_DB_USER} -E UTF8 -T template0 ${ZABBIX_DB}"
    fi
  fi

  local schema=""
  for candidate in \
    /usr/share/zabbix-sql-scripts/postgresql/server.sql.gz \
    /usr/share/zabbix/sql-scripts/postgresql/server.sql.gz \
    /usr/share/zabbix-sql-scripts/postgresql/create.sql.gz
  do
    if [[ -f "${candidate}" ]]; then
      schema="${candidate}"
      break
    fi
  done
  [[ -n "${schema}" ]] || die "Não achei o SQL inicial do Zabbix."

  local tables
  tables="$(psql_as_postgres -d "${ZABBIX_DB}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users'" || true)"
  if [[ "${tables}" != "1" ]]; then
    log "Importando schema (${schema})... isso leva alguns minutos."
    zcat "${schema}" | psql_as_postgres -v ON_ERROR_STOP=1 -d "${ZABBIX_DB}" >/var/log/zabbix-schema-import.log
    psql_as_postgres -d "${ZABBIX_DB}" -c "ALTER DATABASE ${ZABBIX_DB} OWNER TO ${ZABBIX_DB_USER};" >/dev/null
    psql_as_postgres -d "${ZABBIX_DB}" -c "GRANT ALL ON SCHEMA public TO ${ZABBIX_DB_USER};" >/dev/null
    psql_as_postgres -d "${ZABBIX_DB}" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${ZABBIX_DB_USER};" >/dev/null
    psql_as_postgres -d "${ZABBIX_DB}" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${ZABBIX_DB_USER};" >/dev/null
  else
    log "Schema já existe, pulando importação."
  fi
}

configure_server() {
  local password="$1"
  log "Configurando zabbix_server..."
  set_conf /etc/zabbix/zabbix_server.conf DBHost localhost
  set_conf /etc/zabbix/zabbix_server.conf DBName "${ZABBIX_DB}"
  set_conf /etc/zabbix/zabbix_server.conf DBUser "${ZABBIX_DB_USER}"
  set_conf /etc/zabbix/zabbix_server.conf DBPassword "${password}"
  if has_listen_ip; then
    set_conf /etc/zabbix/zabbix_server.conf ListenIP "${ZABBIX_IP}"
  else
    log "AVISO: ${ZABBIX_IP} não está configurado neste host. O server escuta em todas as interfaces."
  fi
  set_conf /etc/zabbix/zabbix_server.conf Timeout 30
}

configure_agent() {
  log "Configurando Zabbix Agent 2..."
  local conf="/etc/zabbix/zabbix_agent2.conf"
  [[ -f "${conf}" ]] || conf="/etc/zabbix/zabbix_agentd.conf"
  set_conf "${conf}" Server "127.0.0.1,${ZABBIX_IP}"
  set_conf "${conf}" ServerActive "127.0.0.1"
  set_conf "${conf}" Hostname "${ZABBIX_NAME}"
  if has_listen_ip; then
    set_conf "${conf}" ListenIP "${ZABBIX_IP}"
  fi
}

configure_web() {
  local password="$1"
  log "Configurando frontend Nginx/PHP em http://${ZABBIX_IP}/ ..."

  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi

  local nginx_conf=""
  for candidate in /etc/zabbix/nginx.conf /etc/nginx/conf.d/zabbix.conf; do
    if [[ -f "${candidate}" ]]; then
      nginx_conf="${candidate}"
      break
    fi
  done
  [[ -n "${nginx_conf}" ]] || die "Pacote zabbix-nginx-conf não criou o arquivo de site."

  local listen_line="listen 80 default_server;"
  if has_listen_ip; then
    listen_line="listen ${ZABBIX_IP}:80 default_server;"
  fi

  cat > "${nginx_conf}" <<NGINX
server {
    ${listen_line}
    server_name ${ZABBIX_IP} zabbix;

    root /usr/share/zabbix/ui;
    index index.php;

    location = /favicon.ico {
        log_not_found off;
    }

    location / {
        try_files \$uri \$uri/ /index.php?\$args;
    }

    location /assets {
        access_log off;
        expires 10d;
    }

    location ~ /\.ht {
        deny all;
    }

    location ~ /(api\/|conf[^\.]|include|locale) {
        deny all;
        return 404;
    }

    location ~ [^/]\.php(/|$) {
        fastcgi_pass unix:/run/php/zabbix.sock;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_index index.php;
    }
}
NGINX

  if [[ ! -S /run/php/zabbix.sock && -S /run/php/php8.3-fpm.sock ]]; then
    sed -i "s|unix:/run/php/zabbix.sock|unix:/run/php/php8.3-fpm.sock|" "${nginx_conf}"
  fi

  local php_pool=""
  for candidate in \
    /etc/php/8.3/fpm/pool.d/zabbix.conf \
    /etc/zabbix/php-fpm.conf
  do
    if [[ -f "${candidate}" ]]; then
      php_pool="${candidate}"
      break
    fi
  done
  if [[ -n "${php_pool}" ]]; then
    if grep -q 'date.timezone' "${php_pool}"; then
      sed -i -E "s|^;?php_value\[date.timezone\].*|php_value[date.timezone] = ${TIMEZONE}|" "${php_pool}"
    else
      printf '\nphp_value[date.timezone] = %s\n' "${TIMEZONE}" >> "${php_pool}"
    fi
  fi

  mkdir -p /etc/zabbix/web
  cat > /etc/zabbix/web/zabbix.conf.php <<PHP
<?php
\$DB['TYPE']           = 'POSTGRESQL';
\$DB['SERVER']         = '127.0.0.1';
\$DB['PORT']           = '5432';
\$DB['DATABASE']       = '${ZABBIX_DB}';
\$DB['USER']           = '${ZABBIX_DB_USER}';
\$DB['PASSWORD']       = '${password}';
\$DB['SCHEMA']         = '';
\$DB['ENCRYPTION']     = false;
\$DB['KEY_FILE']       = '';
\$DB['CERT_FILE']      = '';
\$DB['CA_FILE']        = '';
\$DB['VERIFY_HOST']    = false;
\$DB['CIPHER_LIST']    = '';
\$DB['VAULT']          = '';
\$DB['VAULT_URL']      = '';
\$DB['VAULT_DB_PATH']  = '';
\$DB['VAULT_TOKEN']    = '';
\$DB['DOUBLE_IEEE754'] = true;
\$ZBX_SERVER           = '127.0.0.1';
\$ZBX_SERVER_PORT      = '10051';
\$ZBX_SERVER_NAME      = '${ZABBIX_NAME}';
\$IMAGE_FORMAT_NEW     = IMAGE_FORMAT_PNG;
PHP
  chown www-data:www-data /etc/zabbix/web/zabbix.conf.php
  chmod 640 /etc/zabbix/web/zabbix.conf.php
}

open_firewall() {
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    log "Liberando portas no UFW..."
    ufw allow 80/tcp comment "Zabbix web" || true
    ufw allow 10050/tcp comment "Zabbix agent" || true
    ufw allow 10051/tcp comment "Zabbix server" || true
  fi
}

start_services() {
  log "Iniciando serviços..."
  systemctl enable zabbix-server zabbix-agent2 nginx php8.3-fpm
  systemctl restart postgresql php8.3-fpm nginx zabbix-server zabbix-agent2
  sleep 3
  systemctl --no-pager --full status zabbix-server zabbix-agent2 nginx php8.3-fpm | sed -n '1,80p' || true
}

write_creds() {
  local password="$1"
  umask 077
  cat > "${CREDS_FILE}" <<EOF
URL=http://${ZABBIX_IP}/
WEB_USER=Admin
WEB_PASSWORD=zabbix
DB_NAME=${ZABBIX_DB}
DB_USER=${ZABBIX_DB_USER}
DB_PASSWORD=${password}
SERVER_IP=${ZABBIX_IP}
SERVER_PORT=10051
AGENT_PORT=10050
EOF
  chmod 600 "${CREDS_FILE}"
}

main() {
  need_root
  check_os
  log "Instalando Zabbix Server em ${ZABBIX_IP} (Ubuntu 24.04, série 7.4)..."
  install_base
  install_zabbix_repo
  local password
  password="$(db_password)"
  setup_database "${password}"
  configure_server "${password}"
  configure_agent
  configure_web "${password}"
  open_firewall
  start_services
  write_creds "${password}"

  cat <<EOF

Pronto.

  Interface:  http://${ZABBIX_IP}/
  Usuário:    Admin
  Senha:      zabbix   (troque no primeiro acesso)

  Porta server (agents):  ${ZABBIX_IP}:10051
  Credenciais DB:         ${CREDS_FILE}

No futuro, o painel AdelMSP pode consultar a API:
  http://${ZABBIX_IP}/api_jsonrpc.php

EOF
}

main "$@"
