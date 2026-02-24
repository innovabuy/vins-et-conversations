#!/bin/bash
set -o pipefail

API="http://localhost:3001/api/v1"
REPORT="/root/vins-conversations/AUDIT_REPORT.md"
TIMESTAMP=$(date "+%d/%m/%Y à %H:%M")

# Counters
PASS=0
FAIL=0
WARN=0

log_pass() { echo "  ✅ $1"; ((PASS++)); }
log_fail() { echo "  ❌ $1"; ((FAIL++)); }
log_warn() { echo "  ⚠️  $1"; ((WARN++)); }
log_info() { echo "  ℹ️  $1"; }

# ════════════════════════════════════════════════════════════════
# PHASE 0 — LOGIN ALL ROLES
# ════════════════════════════════════════════════════════════════
echo "═══ PHASE 0 — AUTHENTIFICATION ═══"

do_login() {
  local email="$1"
  local pass="$2"
  local tmpfile=$(mktemp)
  cat > "$tmpfile" <<EOFJ
{"email":"$email","password":"$pass"}
EOFJ
  local token=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d @"$tmpfile" | jq -r '.accessToken // .token // empty')
  rm -f "$tmpfile"
  echo "$token"
}

TOKEN_ADMIN=$(do_login "nicolas@vins-conversations.fr" "VinsConv2026!")
TOKEN_STUDENT=$(do_login "ackavong@eleve.sc.fr" "eleve123")
TOKEN_TEACHER=$(do_login "enseignant@sacrecoeur.fr" "teacher123")
TOKEN_CSE=$(do_login "cse@leroymerlin.fr" "cse123")
TOKEN_AMBASSADOR=$(do_login "ambassadeur@example.fr" "ambassador123")

echo "TOKEN_ADMIN: ${TOKEN_ADMIN:0:20}..."
echo "TOKEN_STUDENT: ${TOKEN_STUDENT:0:20}..."
echo "TOKEN_TEACHER: ${TOKEN_TEACHER:0:20}..."
echo "TOKEN_CSE: ${TOKEN_CSE:0:20}..."
echo "TOKEN_AMBASSADOR: ${TOKEN_AMBASSADOR:0:20}..."

[ -z "$TOKEN_ADMIN" ] && echo "ÉCHEC LOGIN ADMIN — ABANDON" && exit 1

# ════════════════════════════════════════════════════════════════
# IDs de données existantes
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 0.3 — IDs DE RÉFÉRENCE ═══"

CAMPAIGN_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/campaigns" | jq -r '.campaigns[0].id // .data[0].id // .[0].id // empty')
PRODUCT_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/products" | jq -r '.products[0].id // .data[0].id // .[0].id // empty')
ORDER_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/orders" | jq -r '.orders[0].id // .data[0].id // .[0].id // empty')
BL_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/delivery-notes" | jq -r '.deliveryNotes[0].id // .data[0].id // .[0].id // empty')
USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/users" | jq -r '.users[0].id // .data[0].id // .[0].id // empty')

echo "CAMPAIGN_ID: $CAMPAIGN_ID"
echo "PRODUCT_ID: $PRODUCT_ID"
echo "ORDER_ID: $ORDER_ID"
echo "BL_ID: $BL_ID"
echo "USER_ID: $USER_ID"

# ════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ════════════════════════════════════════════════════════════════

test_ep() {
  local METHOD=$1 URL=$2 TOKEN=$3 BODY=$4 EXPECTED=$5 LABEL=$6
  local AUTH_HEADER=""
  [ -n "$TOKEN" ] && AUTH_HEADER="-H \"Authorization: Bearer $TOKEN\""

  if [ -n "$BODY" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "$API$URL" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY")
  elif [ -n "$TOKEN" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "$API$URL" \
      -H "Authorization: Bearer $TOKEN")
  else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "$API$URL")
  fi

  if echo "$EXPECTED" | grep -q "$HTTP_CODE"; then
    log_pass "$METHOD $URL → HTTP $HTTP_CODE [$LABEL]"
  else
    log_fail "$METHOD $URL → HTTP $HTTP_CODE (attendu: $EXPECTED) [$LABEL]"
  fi
}

# ════════════════════════════════════════════════════════════════
# PHASE 2 — AUDIT API ENDPOINTS
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 2 — AUDIT ENDPOINTS API (CDC §2.4) ═══"

echo ""
echo "--- Auth (CDC §2.4) ---"
test_ep POST "/auth/login" "" '{"email":"nicolas@vins-conversations.fr","password":"VinsConv2026!"}' "200" "Login admin"
test_ep POST "/auth/login" "" '{"email":"bad@bad.com","password":"wrong"}' "401 400" "Login mauvais credentials"
test_ep POST "/auth/refresh" "" "" "200 401 400" "Refresh token"

echo ""
echo "--- Produits (CDC §2.4) ---"
test_ep GET "/products" "" "" "200" "Catalogue public (sans auth)"
PRODUCTS_RESP=$(curl -s "$API/products")
HAS_IMAGE=$(echo "$PRODUCTS_RESP" | jq '.[0].image_url // .products[0].image_url // empty' 2>/dev/null)
[ -n "$HAS_IMAGE" ] && [ "$HAS_IMAGE" != "null" ] && log_pass "GET /products → image_url présent" || log_fail "GET /products → image_url ABSENT"

test_ep GET "/admin/products" "$TOKEN_ADMIN" "" "200" "Admin catalogue"
test_ep GET "/admin/products" "$TOKEN_STUDENT" "" "403 401" "Admin produits — étudiant bloqué (RBAC)"

echo ""
echo "--- Catégories V4.1 (Avenant §2) ---"
test_ep GET "/admin/categories" "$TOKEN_ADMIN" "" "200" "Liste catégories dynamiques"
CAT_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/categories")
CAT_TYPE=$(echo "$CAT_RESP" | jq '.[0].type // .categories[0].type // empty' 2>/dev/null)
[ -n "$CAT_TYPE" ] && [ "$CAT_TYPE" != "null" ] && log_pass "Catégories → champ 'type' présent" || log_warn "Catégories → champ 'type' absent ou non vérifié"

echo ""
echo "--- Commandes (CDC §2.4) ---"
test_ep GET "/admin/orders" "$TOKEN_ADMIN" "" "200" "Liste commandes admin"
test_ep GET "/admin/orders?status=pending" "$TOKEN_ADMIN" "" "200" "Filtre commandes par statut"
test_ep GET "/admin/orders?campaign_id=$CAMPAIGN_ID" "$TOKEN_ADMIN" "" "200" "Filtre commandes par campagne"
if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
  test_ep GET "/orders/$ORDER_ID" "$TOKEN_ADMIN" "" "200" "Détail commande"
  ORDER_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/orders/$ORDER_ID")
  HAS_ITEMS=$(echo "$ORDER_RESP" | jq '.items // .order.items // .order_items // empty' 2>/dev/null)
  [ -n "$HAS_ITEMS" ] && [ "$HAS_ITEMS" != "null" ] && log_pass "Détail commande → lignes items présentes" || log_warn "Détail commande → items non vérifiés"
fi

echo ""
echo "--- Stock (CDC §2.4) ---"
test_ep GET "/admin/stock" "$TOKEN_ADMIN" "" "200" "Stock temps réel"
STOCK_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/stock")
for field in initial current sold free returned; do
  HAS=$(echo "$STOCK_RESP" | jq ".[0].$field // .stock[0].$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Stock → champ '$field' présent" || log_fail "Stock → champ '$field' ABSENT"
done
test_ep GET "/admin/stock/alerts" "$TOKEN_ADMIN" "" "200" "Alertes stock bas"

echo ""
echo "--- Bons de Livraison (CDC §2.4) ---"
test_ep GET "/admin/delivery-notes" "$TOKEN_ADMIN" "" "200" "Liste BL"
if [ -n "$BL_ID" ] && [ "$BL_ID" != "null" ]; then
  test_ep GET "/admin/delivery-notes/$BL_ID" "$TOKEN_ADMIN" "" "200" "Détail BL"
  test_ep PUT "/admin/delivery-notes/$BL_ID" "$TOKEN_ADMIN" '{"status":"ready"}' "200 400" "MAJ statut BL"
  BL_PDF=$(curl -s -o /tmp/test_bl.pdf -w "%{http_code}" -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/delivery-notes/$BL_ID/pdf")
  BL_SIZE=$(wc -c < /tmp/test_bl.pdf 2>/dev/null || echo 0)
  [ "$BL_PDF" = "200" ] && [ "$BL_SIZE" -gt 100 ] && log_pass "BL PDF → HTTP 200, taille ${BL_SIZE}B" || log_fail "BL PDF → HTTP $BL_PDF, taille ${BL_SIZE}B"
fi
test_ep POST "/admin/delivery-notes/${BL_ID:-1}/sign" "$TOKEN_ADMIN" '{"signature":"data:image/png;base64,iVBOR"}' "200 400 404" "Signature BL"

echo ""
echo "--- Tournées (CDC §2.4) ---"
test_ep GET "/admin/delivery-routes" "$TOKEN_ADMIN" "" "200" "Liste tournées"
ROUTE_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/delivery-routes" | jq -r '.[0].id // .routes[0].id // empty')
if [ -n "$ROUTE_ID" ] && [ "$ROUTE_ID" != "null" ]; then
  ROUTE_PDF=$(curl -s -o /tmp/test_route.pdf -w "%{http_code}" -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/delivery-routes/$ROUTE_ID/pdf")
  ROUTE_SIZE=$(wc -c < /tmp/test_route.pdf 2>/dev/null || echo 0)
  [ "$ROUTE_PDF" = "200" ] && [ "$ROUTE_SIZE" -gt 100 ] && log_pass "Tournée PDF → HTTP 200, taille ${ROUTE_SIZE}B" || log_fail "Tournée PDF → HTTP $ROUTE_PDF, taille ${ROUTE_SIZE}B"
fi

echo ""
echo "--- Fournisseurs (CDC §2.4) ---"
test_ep GET "/admin/suppliers" "$TOKEN_ADMIN" "" "200" "Liste fournisseurs"
test_ep POST "/admin/suppliers" "$TOKEN_ADMIN" '{"name":"Test Fournisseur Audit","contact_name":"Test","contact_email":"test@test.fr"}' "200 201" "Création fournisseur"

echo ""
echo "--- CRM Contacts (CDC §2.4) ---"
test_ep GET "/admin/contacts" "$TOKEN_ADMIN" "" "200" "Liste contacts"
test_ep GET "/admin/contacts?search=test" "$TOKEN_ADMIN" "" "200" "Recherche contacts"
test_ep POST "/admin/contacts" "$TOKEN_ADMIN" '{"name":"Test Contact Audit","email":"contact.audit@test.fr","type":"particulier"}' "200 201" "Création contact"

echo ""
echo "--- Finance & Marges (CDC §2.4) ---"
test_ep GET "/admin/financial-events" "$TOKEN_ADMIN" "" "200" "Événements financiers (append-only)"
test_ep GET "/admin/margins" "$TOKEN_ADMIN" "" "200" "Analyse marges globale"
test_ep GET "/admin/margins?campaign_id=$CAMPAIGN_ID" "$TOKEN_ADMIN" "" "200" "Marges par campagne"
test_ep GET "/admin/margins/by-product" "$TOKEN_ADMIN" "" "200" "Marges par produit"
test_ep GET "/admin/margins/by-supplier" "$TOKEN_ADMIN" "" "200" "Marges par fournisseur"

# Append-only check
FE_DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/financial-events/1")
if [ "$FE_DEL" = "404" ] || [ "$FE_DEL" = "405" ] || [ "$FE_DEL" = "403" ]; then
  log_pass "financial_events: DELETE → $FE_DEL (append-only respecté)"
else
  log_fail "financial_events: DELETE → $FE_DEL (append-only VIOLÉ si 200/204)"
fi

echo ""
echo "--- Paiements (CDC §2.4) ---"
test_ep GET "/admin/payments" "$TOKEN_ADMIN" "" "200" "Liste paiements"
test_ep POST "/admin/payments/cash-deposit" "$TOKEN_ADMIN" '{"amount":150,"depositor":"Nicolas","reference":"DEP-AUDIT-001","notes":"Test audit"}' "200 201 400" "Dépôt espèces"

echo ""
echo "--- Retours/Avoirs (CDC §2.4) ---"
test_ep GET "/admin/returns" "$TOKEN_ADMIN" "" "200" "Liste retours"

echo ""
echo "--- Notifications (CDC §2.4) ---"
test_ep GET "/notifications" "$TOKEN_ADMIN" "" "200" "Liste notifications"
test_ep GET "/admin/notifications/settings" "$TOKEN_ADMIN" "" "200" "Paramétrage alertes"

echo ""
echo "--- Conditions Commerciales (CDC §2.4) ---"
test_ep GET "/admin/pricing-conditions" "$TOKEN_ADMIN" "" "200" "Conditions commerciales"
PRICING_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/pricing-conditions")
PRICING_COUNT=$(echo "$PRICING_RESP" | jq 'if type == "array" then length elif .conditions then (.conditions | length) else 0 end' 2>/dev/null)
log_info "Nombre de conditions: $PRICING_COUNT (attendu: 7)"

echo ""
echo "--- Journal d'Audit (CDC §2.4) ---"
test_ep GET "/admin/audit-log" "$TOKEN_ADMIN" "" "200" "Journal audit"
test_ep GET "/admin/audit-log" "$TOKEN_STUDENT" "" "403 401" "Audit — étudiant bloqué (RBAC)"

echo ""
echo "--- Campagnes (CDC §2.4) ---"
test_ep GET "/admin/campaigns" "$TOKEN_ADMIN" "" "200" "Liste campagnes"
CAMP_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/campaigns")
CAMP_COUNT=$(echo "$CAMP_RESP" | jq 'if .campaigns then (.campaigns | length) elif type == "array" then length else 0 end' 2>/dev/null)
log_info "Nombre de campagnes: $CAMP_COUNT"

echo ""
echo "--- Utilisateurs & Invitations (CDC §2.4) ---"
test_ep GET "/admin/users" "$TOKEN_ADMIN" "" "200" "Liste utilisateurs"
test_ep GET "/admin/invitations" "$TOKEN_ADMIN" "" "200" "Liste invitations"

echo ""
echo "--- Ambassadeurs (Avenant V4.1 §6) ---"
test_ep GET "/dashboard/ambassador" "$TOKEN_AMBASSADOR" "" "200" "Dashboard ambassadeur"
AMB_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_AMBASSADOR" "$API/dashboard/ambassador")
for field in tier ca referral_code stats; do
  HAS=$(echo "$AMB_RESP" | jq ".$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Dashboard ambassadeur → '$field' présent" || log_fail "Dashboard ambassadeur → '$field' ABSENT"
done

echo ""
echo "--- Referral / Lien partage (Avenant V4.1 §5) ---"
STUDENT_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_STUDENT" "$API/dashboard/student")
REFERRAL_CODE=$(echo "$STUDENT_RESP" | jq -r '.referral_code // .participation.referral_code // empty')
[ -n "$REFERRAL_CODE" ] && log_pass "Dashboard étudiant → referral_code: $REFERRAL_CODE" || log_fail "Dashboard étudiant → referral_code ABSENT"

echo ""
echo "--- Grille Transport K+N (Avenant V4.1 §6) ---"
test_ep GET "/admin/shipping-zones" "$TOKEN_ADMIN" "" "200" "Zones de livraison"
test_ep GET "/admin/shipping-rates" "$TOKEN_ADMIN" "" "200" "Grille tarifaire transport"
SHIPPING_CALC=$(curl -s "$API/public/shipping-calculate?dept=49&qty=12")
SHIPPING_AMOUNT=$(echo "$SHIPPING_CALC" | jq '.amount // .cost // .shipping_cost // .shipping // empty' 2>/dev/null)
[ -n "$SHIPPING_AMOUNT" ] && [ "$SHIPPING_AMOUNT" != "null" ] && log_pass "Calcul transport dept=49, 12 bouteilles → ${SHIPPING_AMOUNT}€" || log_fail "Calcul transport → résultat ABSENT"

echo ""
echo "--- App Settings / Logos (Avenant V4.1 §3) ---"
test_ep GET "/admin/settings" "$TOKEN_ADMIN" "" "200" "Paramètres application"
test_ep GET "/settings/public" "" "" "200" "Paramètres publics (sans auth)"

echo ""
echo "--- Ressources Campagne (Avenant V4.1 §8) ---"
test_ep GET "/admin/campaign-resources" "$TOKEN_ADMIN" "" "200" "Ressources campagne (admin)"
if [ -n "$CAMPAIGN_ID" ] && [ "$CAMPAIGN_ID" != "null" ]; then
  test_ep GET "/campaigns/$CAMPAIGN_ID/resources" "$TOKEN_STUDENT" "" "200" "Ressources campagne (étudiant)"
fi

# ════════════════════════════════════════════════════════════════
# PHASE 3 — DASHBOARDS
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 3 — AUDIT DASHBOARDS ═══"

echo ""
echo "--- Dashboard Admin Cockpit (CDC §4.1) ---"
test_ep GET "/dashboard/admin/cockpit" "$TOKEN_ADMIN" "" "200" "Cockpit admin"
COCKPIT=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/dashboard/admin/cockpit")
for field in ca_ttc ca_ht marge_globale commandes_total; do
  HAS=$(echo "$COCKPIT" | jq ".$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Cockpit → KPI '$field'" || log_fail "Cockpit → KPI '$field' ABSENT"
done
for field in commandes_a_valider paiements_non_rapproches bl_prets stock_bas; do
  HAS=$(echo "$COCKPIT" | jq ".$field // .action_cards.$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Cockpit → carte '$field'" || log_fail "Cockpit → carte '$field' ABSENTE"
done

echo ""
echo "--- Dashboard Étudiant (CDC §4.2) ---"
STUDENT_DASH=$(curl -s -H "Authorization: Bearer $TOKEN_STUDENT" "$API/dashboard/student")
for field in ca rank streak badges free_bottles_earned referral_code; do
  HAS=$(echo "$STUDENT_DASH" | jq ".$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Dashboard étudiant → '$field'" || log_fail "Dashboard étudiant → '$field' ABSENT"
done

# Double cagnotte V4.1 §4
FUND_COLL=$(echo "$STUDENT_DASH" | jq '.fund_collective // .commission.fund_collective // empty' 2>/dev/null)
FUND_INDIV=$(echo "$STUDENT_DASH" | jq '.fund_individual // .commission.fund_individual // empty' 2>/dev/null)
[ -n "$FUND_COLL" ] && [ "$FUND_COLL" != "null" ] && log_pass "Double cagnotte → fund_collective" || log_fail "Double cagnotte → fund_collective ABSENT (V4.1 §4)"
[ -n "$FUND_INDIV" ] && [ "$FUND_INDIV" != "null" ] && log_pass "Double cagnotte → fund_individual" || log_fail "Double cagnotte → fund_individual ABSENT (V4.1 §4)"

# Brand name
BRAND=$(echo "$STUDENT_DASH" | jq -r '.brand_name // .campaign.brand_name // empty' 2>/dev/null)
[ -n "$BRAND" ] && log_pass "Brand name → '$BRAND'" || log_warn "Brand name → non défini dans dashboard"

echo ""
echo "--- Dashboard Enseignant — ZÉRO EUROS (CDC §4.5) ---"
test_ep GET "/dashboard/teacher" "$TOKEN_TEACHER" "" "200" "Dashboard enseignant"
TEACHER_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_TEACHER" "$API/dashboard/teacher")

# Check monetary fields in teacher dashboard
FOUND_MONEY=0
for field in ca ca_ht ca_ttc total total_ht total_ttc amount price price_ttc price_ht commission montant revenue earnings; do
  VAL=$(echo "$TEACHER_RESP" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  def find(o,k,depth=0):
    if depth > 10: return None
    if isinstance(o,dict):
      if k in o and o[k] not in [None,'',0,0.0,'0','0.00']: return str(o[k])
      for v in o.values():
        r=find(v,k,depth+1)
        if r: return r
    elif isinstance(o,list):
      for i in o:
        r=find(i,k,depth+1)
        if r: return r
    return None
  r=find(d,'$field')
  if r: print(r)
except: pass
" 2>/dev/null)
  if [ -n "$VAL" ]; then
    log_fail "Dashboard enseignant → champ monétaire '$field' = $VAL DÉTECTÉ"
    FOUND_MONEY=1
  fi
done
[ $FOUND_MONEY -eq 0 ] && log_pass "Dashboard enseignant → ZÉRO champ monétaire"

echo ""
echo "--- Dashboard CSE (CDC §4.3) ---"
test_ep GET "/dashboard/cse" "$TOKEN_CSE" "" "200" "Dashboard CSE"
CSE_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_CSE" "$API/dashboard/cse")
for field in products campaign; do
  HAS=$(echo "$CSE_RESP" | jq ".$field // empty" 2>/dev/null)
  [ -n "$HAS" ] && [ "$HAS" != "null" ] && log_pass "Dashboard CSE → '$field'" || log_fail "Dashboard CSE → '$field' ABSENT"
done

echo ""
echo "--- Dashboard Analytics Admin (CDC §Module 10) ---"
test_ep GET "/dashboard/admin/analytics" "$TOKEN_ADMIN" "" "200" "Analytics avancées"

# ════════════════════════════════════════════════════════════════
# PHASE 4 — EXPORTS
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 4 — AUDIT EXPORTS (CDC §Module 15) ═══"

test_export() {
  local URL=$1 TYPE=$2 LABEL=$3 MIN_SIZE=${4:-50}
  local OUTFILE="/tmp/audit_export_$$_$(date +%s%N)"

  HTTP_CODE=$(curl -s -o "$OUTFILE" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    "$API$URL")
  SIZE=$(wc -c < "$OUTFILE" 2>/dev/null || echo 0)
  FTYPE=$(file -b "$OUTFILE" 2>/dev/null | head -c 50)

  if [ "$HTTP_CODE" = "200" ] && [ "$SIZE" -gt "$MIN_SIZE" ]; then
    log_pass "$LABEL → HTTP 200, ${SIZE}B ($FTYPE)"
    if [ "$TYPE" = "csv" ]; then
      BOM=$(xxd "$OUTFILE" 2>/dev/null | head -1 | grep -c "efbb bf" || echo 0)
      [ "$BOM" -gt 0 ] && log_info "  BOM UTF-8 présent (Excel compatible)" || log_info "  BOM UTF-8 absent"
    fi
  else
    log_fail "$LABEL → HTTP $HTTP_CODE, ${SIZE}B"
  fi
  rm -f "$OUTFILE"
}

test_export "/admin/exports/pennylane" "csv" "Export Pennylane CSV (CDC §M15)" 100
test_export "/admin/exports/sales-journal" "csv" "Journal des ventes CSV (CDC §M15)" 100
test_export "/admin/exports/commissions" "pdf" "Récap commissions PDF (CDC §M15)" 500
test_export "/admin/exports/commissions?format=csv" "csv" "Récap commissions CSV (CDC §M15)" 100
test_export "/admin/exports/stock" "csv" "État des stocks CSV (CDC §M15)" 100
test_export "/admin/exports/delivery-notes" "pdf" "BL du mois PDF (CDC §M15)" 500
test_export "/admin/exports/activity-report" "pdf" "Rapport activité PDF (CDC §M15)" 500

echo ""
echo "--- Exports supplémentaires ---"
if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  test_export "/admin/products/$PRODUCT_ID/pdf" "pdf" "Fiche produit PDF" 1000
fi
if [ -n "$CAMPAIGN_ID" ] && [ "$CAMPAIGN_ID" != "null" ]; then
  test_export "/admin/campaigns/$CAMPAIGN_ID/report-pdf" "pdf" "Rapport campagne PDF" 1000
fi
test_export "/admin/exports/catalog-pdf" "pdf" "Catalogue PDF complet" 2000
if [ -n "$CAMPAIGN_ID" ] && [ "$CAMPAIGN_ID" != "null" ]; then
  test_export "/admin/exports/campaign-pivot?campaign_id=$CAMPAIGN_ID" "xlsx" "Pivot XLSX (V4.2)" 2000
  test_export "/admin/exports/campaign-pivot?campaign_id=$CAMPAIGN_ID&format=csv" "csv" "Pivot CSV (V4.2)" 100
fi

echo ""
echo "--- Vérification contenu Pennylane ---"
PENNY_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/exports/pennylane")
for col in journal compte debit credit date; do
  echo "$PENNY_RESP" | grep -qi "$col" && log_pass "Pennylane → colonne '$col'" || log_fail "Pennylane → colonne '$col' ABSENTE"
done

echo ""
echo "--- Vérification TVA journal des ventes ---"
JOURNAL_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/exports/sales-journal")
echo "$JOURNAL_RESP" | grep -qiE "tva.20|20%" && log_pass "Journal → TVA 20% présente" || log_fail "Journal → TVA 20% ABSENTE"
echo "$JOURNAL_RESP" | grep -qiE "tva.5|5.5%" && log_pass "Journal → TVA 5.5% présente" || log_fail "Journal → TVA 5.5% ABSENTE"

# ════════════════════════════════════════════════════════════════
# PHASE 5 — RÈGLES MÉTIER
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 5 — RÈGLES MÉTIER (CDC §3) ═══"

echo ""
echo "--- Moteur de règles JSONB ---"
for field in pricing_rules commission_rules free_bottle_rules tier_rules; do
  COUNT=$(docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
    "SELECT COUNT(*) FROM client_types WHERE $field IS NOT NULL AND $field::text != 'null';" 2>/dev/null | tr -d ' ')
  [ "${COUNT:-0}" -gt 0 ] && log_pass "$field → $COUNT types configurés en DB" || log_fail "$field → AUCUNE configuration en DB"
done

echo ""
echo "--- Immutabilité financial_events ---"
BAD_EVENTS=$(grep -rn "financial_events" /root/vins-conversations/backend/src/ --include="*.js" -i 2>/dev/null | grep -iE "update|delete" | grep -v "test\|spec\|\.test\.\|//" | wc -l)
[ "${BAD_EVENTS:-0}" = "0" ] && log_pass "Aucun UPDATE/DELETE sur financial_events dans le code" || log_fail "$BAD_EVENTS UPDATE/DELETE sur financial_events détectés"

# ════════════════════════════════════════════════════════════════
# PHASE 6 — BASE DE DONNÉES
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 6 — AUDIT BASE DE DONNÉES (CDC §2.3) ═══"

echo ""
echo "--- Tables CDC V4.0 (20 tables) ---"
CDC_TABLES=(users participations invitations organizations campaigns client_types
            products campaign_products stock_movements orders order_items
            financial_events payments delivery_notes returns contacts
            audit_log notifications delivery_routes pricing_conditions)

for table in "${CDC_TABLES[@]}"; do
  COUNT=$(docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
    "SELECT COUNT(*) FROM $table;" 2>/dev/null | tr -d ' ')
  if [ -n "$COUNT" ] && [ "$COUNT" != "" ]; then
    log_pass "$table → $COUNT lignes"
  else
    log_fail "$table → TABLE ABSENTE"
  fi
done

echo ""
echo "--- Tables V4.1 (Avenant) ---"
V41_TABLES=(product_categories shipping_zones shipping_rates campaign_resources app_settings)
for table in "${V41_TABLES[@]}"; do
  COUNT=$(docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
    "SELECT COUNT(*) FROM $table;" 2>/dev/null | tr -d ' ')
  if [ -n "$COUNT" ] && [ "$COUNT" != "" ]; then
    log_pass "$table → $COUNT lignes (V4.1)"
  else
    log_fail "$table → ABSENTE (V4.1)"
  fi
done

echo ""
echo "--- Colonnes V4.1 ---"
check_col() {
  local t=$1 c=$2
  EXISTS=$(docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='$t' AND column_name='$c';" 2>/dev/null | tr -d ' ')
  [ "$EXISTS" = "1" ] && log_pass "$t.$c" || log_fail "$t.$c → COLONNE ABSENTE"
}
check_col products category_id
check_col products is_featured
check_col organizations logo_url
check_col participations referral_code
check_col orders referred_by
check_col orders referral_code_used
check_col campaigns brand_name

echo ""
echo "--- Images produits ---"
WIX_COUNT=$(docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
  "SELECT COUNT(*) FROM products WHERE image_url LIKE '%wixstatic%';" 2>/dev/null | tr -d ' ')
[ "${WIX_COUNT:-0}" = "0" ] && log_pass "Aucune URL Wix en production" || log_fail "$WIX_COUNT URL Wix détectées"

echo "  Produits et images:"
docker exec vc-postgres psql -U postgres -d vins_conversations -t -c \
  "SELECT '  ' || name || ' → ' || COALESCE(image_url, 'NULL') FROM products ORDER BY name;" 2>/dev/null

echo ""
echo "--- Images sur disque ---"
for img in cremant-de-loire apertus carillon coffret-decouverte-3bt jus-de-pomme; do
  FOUND=$(find /root/vins-conversations/backend/uploads/products -name "*${img}*" 2>/dev/null | head -1)
  [ -n "$FOUND" ] && log_pass "$img → $FOUND" || log_fail "$img → MANQUANT sur disque"
done

# ════════════════════════════════════════════════════════════════
# PHASE 7 — SÉCURITÉ RBAC
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 7 — AUDIT SÉCURITÉ & RBAC ═══"

echo ""
echo "--- RBAC: accès interdit selon le rôle ---"
test_ep GET "/admin/orders" "$TOKEN_STUDENT" "" "403 401" "RBAC: étudiant → admin/orders bloqué"
test_ep GET "/admin/users" "$TOKEN_STUDENT" "" "403 401" "RBAC: étudiant → admin/users bloqué"
test_ep GET "/admin/exports/pennylane" "$TOKEN_STUDENT" "" "403 401" "RBAC: étudiant → exports bloqué"
test_ep GET "/admin/financial-events" "$TOKEN_TEACHER" "" "403 401" "RBAC: enseignant → financial-events bloqué"
test_ep GET "/admin/orders" "" "" "401 403" "Sans token → bloqué"
test_ep GET "/dashboard/student" "" "" "401 403" "Sans token → dashboard bloqué"

echo ""
echo "--- RBAC: accès autorisé ---"
test_ep GET "/products" "" "" "200" "Public → catalogue sans auth"
test_ep GET "/dashboard/student" "$TOKEN_STUDENT" "" "200" "Étudiant → son dashboard"
test_ep GET "/dashboard/teacher" "$TOKEN_TEACHER" "" "200" "Enseignant → son dashboard"
test_ep GET "/dashboard/cse" "$TOKEN_CSE" "" "200" "CSE → son dashboard"
test_ep GET "/dashboard/ambassador" "$TOKEN_AMBASSADOR" "" "200" "Ambassadeur → son dashboard"

echo ""
echo "--- JWT: token invalide ---"
FAKE_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGVzIjpbImFkbWluIl19.FAKETOKEN"
test_ep GET "/admin/orders" "$FAKE_TOKEN" "" "401 403" "Token invalide → rejeté"

# ════════════════════════════════════════════════════════════════
# PHASE 8 — BOUTIQUE PUBLIQUE
# ════════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 8 — BOUTIQUE PUBLIQUE & SITE ═══"

SITE="http://localhost:8082"

echo ""
echo "--- Pages du site public ---"
for page in index prestations cse ecoles ambassadeurs coffrets apropos equipe faq avis partenaires boutique contact; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/${page}.html")
  [ "$CODE" = "200" ] && log_pass "${page}.html → 200" || log_fail "${page}.html → $CODE"
done

echo ""
echo "--- Catalogue public API ---"
test_ep GET "/public/catalog" "" "" "200" "Catalogue boutique public"
CATALOG=$(curl -s "$API/public/catalog")
HAS_IMG=$(echo "$CATALOG" | jq '.[0].image_url // .products[0].image_url // empty' 2>/dev/null)
[ -n "$HAS_IMG" ] && [ "$HAS_IMG" != "null" ] && log_pass "Catalogue public → image_url présent" || log_fail "Catalogue public → image_url ABSENT"

echo ""
echo "--- Panier & Checkout ---"
SESSION_ID="audit_test_$(date +%s)"
CART_RESP=$(curl -s -X POST "$API/public/cart" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"product_id\":\"$PRODUCT_ID\",\"qty\":3}")
CART_OK=$(echo "$CART_RESP" | jq '.cart // .items // .id // empty' 2>/dev/null)
[ -n "$CART_OK" ] && [ "$CART_OK" != "null" ] && log_pass "POST /public/cart → panier créé" || log_fail "POST /public/cart → ÉCHEC"

echo ""
echo "--- Featured products ---"
test_ep GET "/public/featured" "" "" "200" "Produits featured (V4.1 §7)"

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════════════════"
echo "       RÉSUMÉ AUDIT — Vins & Conversations V4.2"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  ✅ PASS: $PASS"
echo "  ❌ FAIL: $FAIL"
echo "  ⚠️  WARN: $WARN"
echo "  TOTAL: $((PASS + FAIL + WARN))"
echo ""
SCORE=$(echo "scale=1; $PASS * 100 / ($PASS + $FAIL)" | bc 2>/dev/null || echo "?")
echo "  SCORE: $SCORE%"
echo "══════════════════════════════════════════════════════════"
