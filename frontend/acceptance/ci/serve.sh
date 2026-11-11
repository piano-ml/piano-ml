#!/bin/bash
# Serves a frontend image as https://pianoml.org on 127.0.0.1:443 for the acceptance tests:
#
#   frontend/acceptance/ci/serve.sh start <image>
#   cd frontend/acceptance && SITE_ADDRESS=127.0.0.1 npx codeceptjs run --steps
#   frontend/acceptance/ci/serve.sh stop
#
# The browser maps only pianoml.org to 127.0.0.1 (codecept.conf.js): api.pianoml.org stays the production API,
# which accepts the requests because the page has the production origin.
set -euo pipefail

CI_DIR=$(dirname "$(realpath "$0")")
NETWORK=acceptance
CERTS="${RUNNER_TEMP:-/tmp}/acceptance-certs"

stop() {
  docker rm -f acceptance-proxy acceptance-frontend > /dev/null 2>&1 || true
  docker network rm "$NETWORK" > /dev/null 2>&1 || true
}

start() {
  local image="$1"
  stop
  mkdir -p "$CERTS"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=pianoml.org" \
    -keyout "$CERTS/site.key" -out "$CERTS/site.crt" 2> /dev/null
  chmod 644 "$CERTS/site.key"
  docker network create "$NETWORK" > /dev/null
  docker run -d --name acceptance-frontend --network "$NETWORK" "$image" > /dev/null
  docker run -d --name acceptance-proxy --network "$NETWORK" -p 443:443 \
    -v "$CI_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$CERTS:/etc/nginx/certs:ro" nginx:1.29 > /dev/null

  for _ in $(seq 1 30); do
    if curl -fsSk --resolve pianoml.org:443:127.0.0.1 -o /dev/null https://pianoml.org/; then
      echo "Frontend image $image served as https://pianoml.org on 127.0.0.1"
      return 0
    fi
    sleep 2
  done
  echo "The frontend image never answered:" >&2
  docker logs acceptance-frontend >&2 || true
  docker logs acceptance-proxy >&2 || true
  return 1
}

case "${1:-}" in
  start) start "${2:?usage: serve.sh start <image>}" ;;
  stop) stop ;;
  logs) docker logs acceptance-frontend; docker logs acceptance-proxy ;;
  *) echo "usage: serve.sh start <image> | stop | logs" >&2; exit 2 ;;
esac
