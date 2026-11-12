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
#   limpa                   esvazia a área de recebimento
#   recebe release.tgz.NNN  grava o stdin como uma parte do pacote
#   instala <sha256> <sha>  junta as partes, confere o checksum e publica
#
# O pacote vai em partes porque transferência longa para este VPS leva
# `Connection reset by peer` no meio — medido na subida de 12/11/2026.
# =============================================================================
set -euo pipefail

BASE=/opt/procert
IN=$BASE/incoming
APP=$BASE/app
SAUDE=http://127.0.0.1:3000/api/health

read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"
ACAO=${ARGS[0]:-}

case "$ACAO" in
  limpa)
    rm -rf "$IN"
    mkdir -p "$IN"
    ;;

  recebe)
    NOME=${ARGS[1]:-}
    [[ "$NOME" =~ ^release\.tgz\.[0-9]{3}$ ]] || { echo "nome de parte inválido" >&2; exit 2; }
    mkdir -p "$IN"
    cat > "$IN/$NOME.tmp"
    mv "$IN/$NOME.tmp" "$IN/$NOME"
    stat -c %s "$IN/$NOME"
    ;;

  instala)
    SHA=${ARGS[1]:-}
    COMMIT=${ARGS[2]:-}
    [[ "$SHA" =~ ^[0-9a-f]{64}$ && "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "argumentos inválidos" >&2; exit 2; }
    exec > >(tee -a "$BASE/deploy.log") 2>&1
    echo "=== $(date -Is) instalando $COMMIT"

    cat "$IN"/release.tgz.* > "$IN/release.tgz"
    echo "$SHA  $IN/release.tgz" | sha256sum -c -

    NOVO=$BASE/novo
    rm -rf "$NOVO"
    mkdir -p "$NOVO"
    tar xzf "$IN/release.tgz" -C "$NOVO"
    [ -f "$NOVO/backend/dist/main.js" ] && [ -f "$NOVO/dist/index.html" ] || { echo "pacote incompleto" >&2; exit 1; }

    # O .env de produção vive só no servidor; o pacote nunca o traz.
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
    rmdir "$NOVO"
    systemctl start procert-api

    for _ in $(seq 1 30); do
      if curl -fsS -m 5 "$SAUDE" | grep -q '"banco":"ok"'; then
        echo "$COMMIT" > "$APP/REVISION"
        rm -rf "$IN"
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
