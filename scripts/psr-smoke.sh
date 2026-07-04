#!/usr/bin/env bash
# PSR admin API smoke test — exercises the actions the admin UI calls.
#
# Get your admin JWT from the browser console while signed in:
#   copy(localStorage.getItem('psr_token'))     # then paste as PSR_TOKEN
#
# Run:
#   PSR_TOKEN='<jwt>' PSR_SLUG=ondoguber2027 bash scripts/psr-smoke.sh
set -uo pipefail
BASE="${PSR_BASE:-https://sr.torama.money}"
TOKEN="${PSR_TOKEN:?set PSR_TOKEN to your admin JWT}"
SLUG="${PSR_SLUG:-ondoguber2027}"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Cookie: psr_tenant=$SLUG")
JSON=(-H "Content-Type: application/json")
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "BASE=$BASE  SLUG=$SLUG"
echo "-- auth/me      -> $(code "${AUTH[@]}" "$BASE/api/auth/me")"
echo "-- my-tenants   -> $(code "${AUTH[@]}" "$BASE/api/my-tenants")"
echo "-- tally        -> $(code "${AUTH[@]}" "$BASE/api/tally")"
echo "-- agents(list) -> $(code "${AUTH[@]}" "$BASE/api/admin/agents")"
echo "-- billing/seats-> $(code "${AUTH[@]}" "$BASE/api/billing/seats" 2>/dev/null)"

echo "-- unit search (q=biagbeni):"
UNITS=$(curl -s "${AUTH[@]}" "$BASE/api/admin/units?q=biagbeni")
echo "   ${UNITS:0:240}"
UID=$(printf '%s' "$UNITS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).units||[])[0]?.id||"")}catch{console.log("")}})')
echo "   picked unit id: ${UID:-<none>}"

if [ -n "$UID" ]; then
  echo "-- create agent (full response):"
  curl -sS -i -X POST "${AUTH[@]}" "${JSON[@]}" "$BASE/api/admin/agents" \
    -d "{\"name\":\"Smoke Test\",\"pollingUnitId\":\"$UID\"}" | sed -n '1,25p'
else
  echo "!! no unit id resolved — check the unit search output above"
fi
