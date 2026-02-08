#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3001/api/v1"
PASS=0
FAIL=0
TOTAL=0

# ── Helpers ──────────────────────────────────────────

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    green "  PASS  $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label — expected $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_json() {
  local label="$1" json="$2" expr="$3" expected="$4"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$json" | jq -r "$expr" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$actual" = "$expected" ]; then
    green "  PASS  $label ($actual)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_exists() {
  local label="$1" json="$2" expr="$3"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$json" | jq -r "$expr" 2>/dev/null || echo "null")
  if [ "$actual" != "null" ] && [ "$actual" != "" ]; then
    green "  PASS  $label (present)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label — field missing or null"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_gt() {
  local label="$1" json="$2" expr="$3" min="$4"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$json" | jq -r "$expr" 2>/dev/null || echo "0")
  if [ "$actual" -gt "$min" ] 2>/dev/null; then
    green "  PASS  $label ($actual > $min)"
    PASS=$((PASS + 1))
  else
    red "  FAIL  $label — expected > $min, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

login_user() {
  local email="$1"
  curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"'"$email"'","password":"VinsConv2026!"}'
}

api_get() {
  local path="$1" token="$2"
  curl -s -w "\n%{http_code}" "$BASE$path" \
    -H "Authorization: Bearer $token"
}

api_get_public() {
  local path="$1"
  curl -s -w "\n%{http_code}" "$BASE$path"
}

split_response() {
  local raw="$1"
  BODY=$(echo "$raw" | sed '$d')
  STATUS=$(echo "$raw" | tail -1)
}

# ══════════════════════════════════════════════════════
# Login all users once (avoid rate limiting)
# ══════════════════════════════════════════════════════

echo ""
yellow "═══ 1. AUTHENTIFICATION ═══"

ADMIN_BODY=$(login_user "nicolas@vins-conversations.fr")
ADMIN_TOKEN=$(echo "$ADMIN_BODY" | jq -r '.accessToken')
assert_json_exists "Admin login returns token" "$ADMIN_BODY" '.accessToken'
assert_json "Admin role = super_admin" "$ADMIN_BODY" '.user.role' "super_admin"

STUDENT_BODY=$(login_user "ackavong@eleve.sc.fr")
STUDENT_TOKEN=$(echo "$STUDENT_BODY" | jq -r '.accessToken')
STUDENT_CAMPAIGN=$(echo "$STUDENT_BODY" | jq -r '.user.campaigns[0].campaign_id')
assert_json_exists "Student login returns token" "$STUDENT_BODY" '.accessToken'
assert_json "Student role = etudiant" "$STUDENT_BODY" '.user.role' "etudiant"

TEACHER_BODY=$(login_user "enseignant@sacrecoeur.fr")
TEACHER_TOKEN=$(echo "$TEACHER_BODY" | jq -r '.accessToken')
assert_json_exists "Teacher login returns token" "$TEACHER_BODY" '.accessToken'

CSE_BODY=$(login_user "cse@leroymerlin.fr")
CSE_TOKEN=$(echo "$CSE_BODY" | jq -r '.accessToken')
CSE_CAMPAIGN=$(echo "$CSE_BODY" | jq -r '.user.campaigns[0].campaign_id')
assert_json_exists "CSE login returns token" "$CSE_BODY" '.accessToken'

AMB_BODY=$(login_user "ambassadeur@example.fr")
AMBASSADOR_TOKEN=$(echo "$AMB_BODY" | jq -r '.accessToken')
AMB_CAMPAIGN=$(echo "$AMB_BODY" | jq -r '.user.campaigns[0].campaign_id')
assert_json_exists "Ambassador login returns token" "$AMB_BODY" '.accessToken'

BTS_BODY=$(login_user "bts@espl.fr")
BTS_TOKEN=$(echo "$BTS_BODY" | jq -r '.accessToken')
assert_json_exists "BTS login returns token" "$BTS_BODY" '.accessToken'

# Wrong password
WRONG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nicolas@vins-conversations.fr","password":"wrongpassword123"}')
assert_status "Wrong password → 401" "401" "$WRONG_STATUS"

# Missing fields
MISSING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nicolas@vins-conversations.fr"}')
assert_status "Missing password → 400" "400" "$MISSING_STATUS"

# ── Public Endpoints ─────────────────────────────────

echo ""
yellow "═══ 2. ENDPOINTS PUBLICS ═══"

split_response "$(api_get_public "/public/catalog")"
assert_status "Public catalog" "200" "$STATUS"
assert_json_gt "Catalog has products" "$BODY" '.data | length' "0"
assert_json_exists "Products have description" "$BODY" '.data[0].description'
assert_json_exists "Products have tasting_notes" "$BODY" '.data[0].tasting_notes'

split_response "$(api_get_public "/public/filters")"
assert_status "Public filters" "200" "$STATUS"
assert_json_exists "Filters have colors" "$BODY" '.colors'

FIRST_PRODUCT=$(curl -s "$BASE/public/catalog" | jq -r '.data[0].id')
split_response "$(api_get_public "/public/catalog/$FIRST_PRODUCT")"
assert_status "Product detail" "200" "$STATUS"
assert_json_exists "Product has name" "$BODY" '.name'

PDF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/public/catalog/$FIRST_PRODUCT/pdf")
assert_status "Single wine PDF" "200" "$PDF_STATUS"

# ── Student Dashboard ────────────────────────────────

echo ""
yellow "═══ 3. DASHBOARD ÉTUDIANT ═══"

split_response "$(api_get "/dashboard/student?campaign_id=$STUDENT_CAMPAIGN" "$STUDENT_TOKEN")"
assert_status "Student dashboard" "200" "$STATUS"
assert_json_exists "Has CA" "$BODY" '.ca'
assert_json_exists "Has position" "$BODY" '.position'
assert_json_exists "Has streak" "$BODY" '.streak'
assert_json_exists "Has freeBottles" "$BODY" '.freeBottles'
assert_json_exists "Has badgeDefinitions" "$BODY" '.badgeDefinitions'
assert_json_gt "badgeDefinitions count" "$BODY" '.badgeDefinitions | length' "0"

UNAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/dashboard/student?campaign_id=$STUDENT_CAMPAIGN")
assert_status "No token → 401" "401" "$UNAUTH_STATUS"

# ── Teacher Dashboard ────────────────────────────────

echo ""
yellow "═══ 4. DASHBOARD ENSEIGNANT ═══"

split_response "$(api_get "/dashboard/teacher?campaign_id=$STUDENT_CAMPAIGN" "$TEACHER_TOKEN")"
assert_status "Teacher dashboard" "200" "$STATUS"
assert_json_exists "Has classGroups" "$BODY" '.classGroups'
assert_json_exists "Has inactiveStudents" "$BODY" '.inactiveStudents'
assert_json_exists "Has students" "$BODY" '.students'

TOTAL=$((TOTAL + 1))
if echo "$BODY" | jq -e '.students[0].ca // empty' >/dev/null 2>&1; then
  red "  FAIL  Teacher response must NOT contain euros (found .ca)"
  FAIL=$((FAIL + 1))
else
  green "  PASS  No euros in teacher response (CDC §4.6)"
  PASS=$((PASS + 1))
fi

# ── CSE Dashboard ────────────────────────────────────

echo ""
yellow "═══ 5. DASHBOARD CSE ═══"

split_response "$(api_get "/dashboard/cse?campaign_id=$CSE_CAMPAIGN" "$CSE_TOKEN")"
assert_status "CSE dashboard" "200" "$STATUS"
assert_json_exists "Has products" "$BODY" '.products'
assert_json_exists "Has minOrder" "$BODY" '.minOrder'
assert_json_exists "Has discountPct" "$BODY" '.discountPct'
assert_json "minOrder = 200" "$BODY" '.minOrder' "200"
assert_json "discountPct = 10" "$BODY" '.discountPct' "10"
assert_json_exists "CSE products have description" "$BODY" '.products[0].description'
assert_json_exists "CSE products have cse_price_ttc" "$BODY" '.products[0].cse_price_ttc'

# ── Ambassador Dashboard ─────────────────────────────

echo ""
yellow "═══ 6. DASHBOARD AMBASSADEUR ═══"

split_response "$(api_get "/dashboard/ambassador?campaign_id=$AMB_CAMPAIGN" "$AMBASSADOR_TOKEN")"
assert_status "Ambassador dashboard" "200" "$STATUS"
assert_json_exists "Has tier" "$BODY" '.tier'
assert_json_exists "Has tiers array" "$BODY" '.tiers'
assert_json_gt "tiers count" "$BODY" '.tiers | length' "0"
assert_json_exists "Has sales" "$BODY" '.sales'
assert_json_exists "Has gains" "$BODY" '.gains'

# ── BTS Dashboard ────────────────────────────────────

echo ""
yellow "═══ 7. DASHBOARD BTS ═══"

split_response "$(api_get "/dashboard/bts" "$BTS_TOKEN")"
assert_status "BTS dashboard" "200" "$STATUS"
assert_json_exists "Has formation" "$BODY" '.formation'

# ── Admin Endpoints ──────────────────────────────────

echo ""
yellow "═══ 8. ADMIN ENDPOINTS ═══"

split_response "$(api_get "/products" "$ADMIN_TOKEN")"
assert_status "Admin products list" "200" "$STATUS"
assert_json_gt "Products count" "$BODY" '.data | length' "0"

split_response "$(api_get "/orders/admin/list" "$ADMIN_TOKEN")"
assert_status "Admin orders list" "200" "$STATUS"

split_response "$(api_get "/dashboard/admin/cockpit" "$ADMIN_TOKEN")"
assert_status "Admin cockpit" "200" "$STATUS"

split_response "$(api_get "/admin/analytics" "$ADMIN_TOKEN")"
assert_status "Admin analytics" "200" "$STATUS"

RBAC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/orders/admin/list" \
  -H "Authorization: Bearer $STUDENT_TOKEN")
assert_status "Student → admin orders = 403" "403" "$RBAC_STATUS"

# ── Catalog PDF with segments ────────────────────────

echo ""
yellow "═══ 9. CATALOGUE PDF ═══"

for SEGMENT in public cse ambassadeur_or; do
  PDF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/catalog/pdf?segment=$SEGMENT" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  assert_status "PDF segment=$SEGMENT" "200" "$PDF_STATUS"
done

# ── Order Creation ───────────────────────────────────

echo ""
yellow "═══ 10. COMMANDE ═══"

ORDER_BODY=$(curl -s -X POST "$BASE/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -d '{"campaign_id":"'"$STUDENT_CAMPAIGN"'","items":[{"productId":"'"$FIRST_PRODUCT"'","qty":2}]}')
ORDER_ID=$(echo "$ORDER_BODY" | jq -r '.id // empty')
assert_json_exists "Order created" "$ORDER_BODY" '.id'
assert_json "Order status = submitted" "$ORDER_BODY" '.status' "submitted"

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
  VAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/orders/admin/$ORDER_ID/validate" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  assert_status "Admin validates order" "200" "$VAL_STATUS"
fi

# ── Results ──────────────────────────────────────────

echo ""
echo "════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  ALL $TOTAL TESTS PASSED"
else
  red "  $FAIL/$TOTAL TESTS FAILED"
fi
echo "  Pass: $PASS  Fail: $FAIL  Total: $TOTAL"
echo "════════════════════════════════════════"
echo ""

exit "$FAIL"
