#!/bin/sh
# Le disque persistant de l'hébergeur est souvent monté au nom de root :
# on le donne à l'utilisateur « node », puis on lance le site sans les droits root.
set -e
mkdir -p "${DATA_DIR:-/app/data}"
chown -R node:node "${DATA_DIR:-/app/data}" 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups node server.js
