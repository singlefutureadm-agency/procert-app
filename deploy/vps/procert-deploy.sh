#!/usr/bin/env bash
# =============================================================================
# Comando forçado da chave de deploy do GitHub Actions no VPS (Locaweb).
#
# Instalado em /usr/local/bin/procert-deploy (root:root, 0755) e amarrado à
# chave em /root/.ssh/authorized_keys:
#
#   restrict,command="/usr/local/bin/procert-deploy" ssh-ed25519 AAAA... procert-cd
#
# `restrict` tira shell, pty e forwarding: quem tiver a chave privada só
# consegue executar ESTE script, com as ações abaixo. O workflow não atualiza
# este arquivo de propósito — uma chave que reescreve o próprio comando forçado
# vale tanto quanto uma chave de root. Mudou aqui? Reinstale à mão (DEPLOY.md,
# Parte III).
#
# Ações (vêm em SSH_ORIGINAL_COMMAND):
#   rsync --server ...   o workflow sincroniza a versão nova em $STAGING, via
#                        rrsync: só escreve dentro dessa pasta
#   instala <sha>        copia $STAGING para uma versão nova e publica
#
# Por que rsync e não o pacote inteiro: a rede até este VPS corta transferência
# longa e, logo depois do corte, bloqueia o IP de origem por alguns minutos
# (medido em 12/11/2026 — a 5ª parte de 5 MB parou em 1,7 MB e as 8 tentativas
# seguintes nem chegaram ao sshd). $STAGING persiste entre deploys, então cada
# deploy manda só o que mudou, numa conexão só, retomável com --partial.
#
# Modelo de ameaça: quem tem a chave publica código que a API executa — ela vale
# o mesmo que o próprio código da aplicação. O que a chave NÃO consegue é shell,
# escrever fora de $STAGING ou trocar este script.
# =============================================================================
set -euo pipefail

BASE=/opt/procert
STAGING=$BASE/staging
APP=$BASE/app
SAUDE=http://127.0.0.1:3000/api/health

ORIGINAL=${SSH_ORIGINAL_COMMAND:-}

if [[ "$ORIGINAL" == "rsync --server "* ]]; then
  mkdir -p "$STAGING"
  exec /usr/bin/rrsync -wo "$STAGING"
fi

read -r -a ARGS <<< "$ORIGINAL"
ACAO=${ARGS[0]:-}

case "$ACAO" in
  instala)
    COMMIT=${ARGS[1]:-}
    [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "commit inválido" >&2; exit 2; }
    exec > >(tee -a "$BASE/deploy.log") 2>&1
    echo "=== $(date -Is) instalando $COMMIT"

    # O workflow grava o commit por último; se não bate, o rsync não terminou.
    [ "$(cat "$STAGING/COMMIT" 2>/dev/null)" = "$COMMIT" ] || { echo "staging não corresponde a $COMMIT" >&2; exit 1; }
    [ -f "$STAGING/backend/dist/main.js" ] && [ -f "$STAGING/dist/index.html" ] || { echo "staging incompleto" >&2; exit 1; }

    NOVO=$BASE/novo
    rm -rf "$NOVO"
    cp -a "$STAGING" "$NOVO"

    # O .env de produção vive só no servidor; o rsync nunca o traz.
    cp "$APP/backend/.env" "$NOVO/backend/.env"
    chown -R procert:procert "$NOVO"
    chmod 600 "$NOVO/backend/.env"

    # Migration antes da troca: o código em execução continua de pé enquanto
    # ela roda. Migration é forward-only — o rollback abaixo volta o código,
    # não o schema. Migration destrutiva exige janela combinada, não este CD.
    (cd "$NOVO/backend" && sudo -u procert -H npx prisma migrate deploy)

    systemctl stop procert-api
    rm -rf "$BASE/anterior"
    mkdir -p "$BASE/anterior"
    mv "$APP/backend" "$BASE/anterior/backend"
    mv "$APP/frontend/dist" "$BASE/anterior/dist"
    mv "$NOVO/backend" "$APP/backend"
    mv "$NOVO/dist" "$APP/frontend/dist"
    rm -rf "$NOVO"
    systemctl start procert-api

    for _ in $(seq 1 30); do
      if curl -fsS -m 5 "$SAUDE" | grep -q '"banco":"ok"'; then
        echo "$COMMIT" > "$APP/REVISION"
        echo "=== $(date -Is) publicado $COMMIT"
        exit 0
      fi
      sleep 2
    done

    echo "=== API não respondeu saudável em 60 s — voltando a versão anterior"
    systemctl stop procert-api
    rm -rf "$APP/backend" "$APP/frontend/dist"
    mv "$BASE/anterior/backend" "$APP/backend"
    mv "$BASE/anterior/dist" "$APP/frontend/dist"
    systemctl start procert-api
    exit 1
    ;;

  *)
    echo "ação desconhecida" >&2
    exit 2
    ;;
esac
