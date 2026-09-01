#!/usr/bin/env bash
# Constitution Verifier - Signal Notes
# Skeleton built pre-go; DB checks activate once the repo + Supabase project exist.
# Wire in package.json:  "constitution": "bash scripts/constitution.sh"
# Evidence is written to shiplog/evidence/ so SHIPLOG can reference it by filename.

set -uo pipefail
FAIL=0
STAMP=$(date +%Y%m%d-%H%M%S)
EVID="shiplog/evidence"
mkdir -p "$EVID"
REPORT="$EVID/constitution-$STAMP.txt"

say() { printf "%-6s %s\n" "$1" "$2" | tee -a "$REPORT"; }

# Search only app code; never node_modules.
SRC_DIRS="app components lib"

grep_absent() {  # $1 label  $2 extended-regex  (fails if any hit)
  local label="$1" pattern="$2" hits
  hits=$(grep -rnE "$pattern" $SRC_DIRS 2>/dev/null || true)
  if [ -n "$hits" ]; then
    say "FAIL" "$label"
    echo "$hits" | sed 's/^/       /' | tee -a "$REPORT"
    FAIL=1
  else
    say "PASS" "$label"
  fi
}

echo "== Constitution Verifier == $STAMP" | tee -a "$REPORT"

# R2: no wildcard or empty selects
grep_absent "R2 no select(\"*\") or empty select()" '\.select\(\s*("\*"|'"'"'\*'"'"')?\s*\)'

# R3: no empty catch blocks
grep_absent "R3 no empty catch {}" 'catch\s*(\([^)]*\))?\s*\{\s*\}'

# R3b: supabase writes must reference { error } nearby (heuristic; auditor confirms)
WRITES=$(grep -rnE '\.(insert|update|upsert|delete)\(' $SRC_DIRS 2>/dev/null | grep -vc 'error' || true)
if [ "${WRITES:-0}" -gt 0 ]; then
  say "WARN" "R3b $WRITES write call line(s) with no 'error' on the same line: auditor must confirm each is checked"
else
  say "PASS" "R3b writes reference their { error }"
fi

# R5: prompt-shaped strings only in lib/prompts/
PROMPT_HITS=$(grep -rnEi '(you are an?|system prompt|<\s*instructions)' $SRC_DIRS 2>/dev/null | grep -v '^lib/prompts/' || true)
if [ -n "$PROMPT_HITS" ]; then
  say "FAIL" "R5 prompt-like strings found outside lib/prompts/"
  echo "$PROMPT_HITS" | sed 's/^/       /' | tee -a "$REPORT"
  FAIL=1
else
  say "PASS" "R5 prompts only in lib/prompts/"
fi

# KEY LEAK: service-role key must never be client-reachable
grep_absent "KEY no SERVICE_ROLE in app code" 'SERVICE_ROLE'
if grep -rn 'NEXT_PUBLIC_[A-Z_]*SERVICE' .env* 2>/dev/null | tee -a "$REPORT"; then
  say "FAIL" "KEY service-role key exposed via NEXT_PUBLIC_ env"
  FAIL=1
fi

# KEY LEAK (LLM): the Anthropic key gets the same standard as the service-role key.
# - a literal key string anywhere in app code is an instant FAIL
# - the env var name may only be read in server route handlers (app/), never in
#   components/ or shared lib client code
grep_absent "KEY no hardcoded Anthropic key (sk-ant-) anywhere" 'sk-ant-'
LLM_HITS=$(grep -rn 'ANTHROPIC_API_KEY' components lib 2>/dev/null || true)
if [ -n "$LLM_HITS" ]; then
  say "FAIL" "KEY ANTHROPIC_API_KEY referenced outside server routes (components/ or lib/)"
  echo "$LLM_HITS" | sed 's/^/       /' | tee -a "$REPORT"
  FAIL=1
else
  say "PASS" "KEY ANTHROPIC_API_KEY only reachable from server code"
fi
if grep -rn 'NEXT_PUBLIC_[A-Z_]*ANTHROPIC' .env* $SRC_DIRS 2>/dev/null | tee -a "$REPORT"; then
  say "FAIL" "KEY Anthropic key exposed via NEXT_PUBLIC_ env"
  FAIL=1
fi

# DB access: DATABASE_URL from env, else from .env.local (never committed).
# This machine has no psql, so queries route through scripts/db-query.ts (pg).
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- || true)
fi
dbq() {  # $1 = sql; prints rows, tab-separated (psql -At compatible)
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -At -c "$1"
  else
    DATABASE_URL="$DATABASE_URL" npx tsx scripts/db-query.ts "$1"
  fi
}

# PROJECT PIN: every DB operation must target the pinned Signal Notes project.
# Added after catch #4 (a pre-connected production DB for another product was
# one apply_migration away from being polluted).
if [ -f supabase/PROJECT_REF ]; then
  PIN=$(tr -d '[:space:]' < supabase/PROJECT_REF)
  LINKED=""
  [ -f supabase/.temp/project-ref ] && LINKED=$(tr -d '[:space:]' < supabase/.temp/project-ref)
  if [ -n "$LINKED" ] && [ "$LINKED" != "$PIN" ]; then
    say "FAIL" "PIN linked project ($LINKED) is not the pinned Signal Notes project ($PIN)"
    FAIL=1
  else
    say "PASS" "PIN linked project matches pinned ref $PIN"
  fi
  if [ -n "${DATABASE_URL:-}" ] && ! printf '%s' "$DATABASE_URL" | grep -q "$PIN"; then
    say "FAIL" "PIN DATABASE_URL does not point at pinned project $PIN — refusing DB checks"
    FAIL=1
    DATABASE_URL=""
  fi
fi

# ---- Live database checks (need DATABASE_URL; skipped until foundation phase) ----
if [ -n "${DATABASE_URL:-}" ]; then
  # R1a: every public table has RLS enabled and at least one policy
  dbq "
    select c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and (c.relrowsecurity = false
           or not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename=c.relname));
  " > "$EVID/r1-naked-tables-$STAMP.txt" 2>&1
  if [ -s "$EVID/r1-naked-tables-$STAMP.txt" ]; then
    say "FAIL" "R1a table(s) without RLS or without any policy: $(tr '\n' ' ' < "$EVID/r1-naked-tables-$STAMP.txt")"
    FAIL=1
  else
    say "PASS" "R1a RLS enabled + policy present on every public table"
  fi

  # R4: every committed migration has a tracking row (ghost-migration detector).
  # This check IS the Part C structural answer, running in this repo's CI.
  for f in supabase/migrations/*.sql; do
    [ -e "$f" ] || continue
    v=$(basename "$f" | grep -oE '^[0-9]+')
    n=$(dbq "select count(*) from supabase_migrations.schema_migrations where version='$v';" 2>/dev/null || echo 0)
    if [ "$n" = "1" ]; then
      say "PASS" "R4 migration $v applied (tracking row present)"
    else
      say "FAIL" "R4 GHOST MIGRATION: $f is committed but has no tracking row in the live DB"
      FAIL=1
    fi
  done

  # R1b: two-org probe (committed script; signs in as both seeded users)
  if [ -f scripts/two-org-probe.ts ]; then
    if npx tsx scripts/two-org-probe.ts > "$EVID/r1-probe-$STAMP.txt" 2>&1; then
      say "PASS" "R1b two-org probe (output: $EVID/r1-probe-$STAMP.txt)"
    else
      say "FAIL" "R1b two-org probe FAILED: see $EVID/r1-probe-$STAMP.txt"
      FAIL=1
    fi
  else
    say "WARN" "R1b probe script not present yet (required by end of foundation phase)"
  fi
else
  say "WARN" "DB checks skipped: DATABASE_URL not set (activate in foundation phase)"
fi

# ---- Types + tests ----
if [ -f tsconfig.json ]; then
  # Next generates route types (.next/types) that tsc needs; a clean checkout
  # (CI) has none, so generate them first. Caught by the first CI run (#10).
  if grep -q '"next"' package.json 2>/dev/null; then
    npx next typegen >> "$REPORT" 2>&1 || true
  fi
  if npx tsc --noEmit >> "$REPORT" 2>&1; then say "PASS" "typecheck"; else say "FAIL" "typecheck"; FAIL=1; fi
fi
if [ -f package.json ] && grep -q '"test"' package.json; then
  if npm test --silent >> "$REPORT" 2>&1; then say "PASS" "tests"; else say "FAIL" "tests"; FAIL=1; fi
fi

echo "" | tee -a "$REPORT"
if [ "$FAIL" -eq 0 ]; then
  say "PASS" "CONSTITUTION: all checks green. Evidence: $REPORT"
else
  say "FAIL" "CONSTITUTION: violations above. Evidence: $REPORT"
fi
exit $FAIL
