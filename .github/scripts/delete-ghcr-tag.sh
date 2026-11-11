#!/bin/bash
# Deletes the GHCR package version carrying a tag, so that the next push of that tag starts clean.
#
#   delete-ghcr-tag.sh <owner> <package> <tag>      (GH_TOKEN: a token with packages:write)
#   DRY_RUN=1 delete-ghcr-tag.sh ...                 (only says what it would delete)
#
# Called by build.yaml right before an image is pushed as :main (after it was built, and for the frontend smoke
# tested), to avoid cache issues with the previous :main. Safe by design:
#  - no version with that tag: nothing to do;
#  - a version with other tags too (e.g. the same digest also tagged develop): skipped with a warning, since
#    deleting it would delete those tags as well; the push then moves the tag as before.
set -euo pipefail

OWNER="${1:?owner}"
PACKAGE="${2:?package}"
TAG="${3:?tag}"
API="/orgs/${OWNER}/packages/container/${PACKAGE}/versions"

# Versions are listed newest first: the tag is on one of the most recent ones.
versions=$(gh api "${API}?per_page=100" --jq "[.[] | select(.metadata.container.tags | index(\"${TAG}\"))]")
count=$(jq 'length' <<< "$versions")

if [ "$count" -eq 0 ]; then
  echo "${PACKAGE}: no version tagged ${TAG}, nothing to delete"
  exit 0
fi

id=$(jq -r '.[0].id' <<< "$versions")
tags=$(jq -r '.[0].metadata.container.tags | join(",")' <<< "$versions")

if [ "$tags" != "$TAG" ]; then
  echo "::warning::${PACKAGE}: version ${id} is tagged ${tags}, not only ${TAG}: not deleted (it would delete the other tags too)"
  exit 0
fi

if [ -n "${DRY_RUN:-}" ]; then
  echo "${PACKAGE}: would delete version ${id} (tagged ${TAG})"
  exit 0
fi

gh api -X DELETE "${API}/${id}"
echo "${PACKAGE}: deleted version ${id} (tagged ${TAG})"
