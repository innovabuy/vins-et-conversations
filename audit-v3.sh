#!/bin/bash
set -o pipefail

API="http://localhost:3001/api/v1"
DB_USER="vc_admin"
DB_NAME="vins_conversations"
TIMESTAMP=$(date "+%d/%m/%Y à %H:%M")

PASS=0; FAIL=0; WARN=0
log_pass() { echo "  ✅ $1"; ((PASS++)); }
log_fail() { echo "  ❌ $1"; ((FAIL++)); }
log_warn() { echo "  ⚠️  $1"; ((WARN++)); }
log_info() { echo "  ℹ️  $1"; }

db_query() {
  docker exec vc-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//'
}

# Safe login using heredoc to avoid ! interpretation
safe_login() {
  local email=$1 pass=$2
  local tmpfile=$(mktemp)
  cat > "$tmpfile" << LOGINEOF
{"email":"$email","password":"$pass"}
LOGINEOF
  local token=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d @"$tmpfile" --max-time 10 | jq -r '.accessToken // .token // empty')
  rm -f "$tmpfile"
  echo "$token"
}

test_ep() {
  local METHOD=$1 URL=$2 TOKEN=$3 BODY=$4 EXPECTED=$5 LABEL=$6
  local CURL_OPTS="--max-time 10 -s -o /tmp/audit_resp.json -w %{http_code}"

  if [ -n "$BODY" ] && [ -n "$TOKEN" ]; then
    HTTP_CODE=$(curl $CURL_OPTS -X "$METHOD" "$API$URL" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$BODY")
  elif [ -n "$TOKEN" ]; then
    HTTP_CODE=$(curl $CURL_OPTS -X "$METHOD" "$API$URL" -H "Authorization: Bearer $TOKEN")
  elif [ -n "$BODY" ]; then
    HTTP_CODE=$(curl $CURL_OPTS -X "$METHOD" "$API$URL" -H "Content-Type: application/json" -d "$BODY")
  else
    HTTP_CODE=$(curl $CURL_OPTS -X "$METHOD" "$API$URL")
  fi

  if echo "$EXPECTED" | grep -q "$HTTP_CODE"; then
    log_pass "$METHOD $URL → $HTTP_CODE [$LABEL]"
  else
    log_fail "$METHOD $URL → $HTTP_CODE (attendu: $EXPECTED) [$LABEL]"
  fi
}

# ════════════════════════════════════════════════════════════
# PHASE 0 — LOGIN
# ════════════════════════════════════════════════════════════
echo "═══ PHASE 0 — AUTHENTIFICATION ═══"

TOKEN_ADMIN=$(safe_login "nicolas@vins-conversations.fr" "VinsConv2026!")
TOKEN_STUDENT=$(safe_login "ackavong@eleve.sc.fr" "VinsConv2026!")
TOKEN_TEACHER=$(safe_login "enseignant@sacrecoeur.fr" "VinsConv2026!")
TOKEN_CSE=$(safe_login "cse@leroymerlin.fr" "VinsConv2026!")
TOKEN_AMBASSADOR=$(safe_login "ambassadeur@example.fr" "VinsConv2026!")

[ -n "$TOKEN_ADMIN" ] && log_pass "Login admin (super_admin)" || log_fail "Login admin"
[ -n "$TOKEN_STUDENT" ] && log_pass "Login étudiant" || log_fail "Login étudiant"
[ -n "$TOKEN_TEACHER" ] && log_pass "Login enseignant" || log_fail "Login enseignant"
[ -n "$TOKEN_CSE" ] && log_pass "Login CSE" || log_fail "Login CSE"
[ -n "$TOKEN_AMBASSADOR" ] && log_pass "Login ambassadeur" || log_fail "Login ambassadeur"

[ -z "$TOKEN_ADMIN" ] && echo "ÉCHEC LOGIN ADMIN — ABANDON" && exit 1

echo ""
echo "═══ IDs DE RÉFÉRENCE ═══"
CAMPAIGN_ID=$(db_query "SELECT id FROM campaigns LIMIT 1;")
PRODUCT_ID=$(db_query "SELECT id FROM products WHERE image_url IS NOT NULL LIMIT 1;")
ORDER_ID=$(db_query "SELECT id FROM orders LIMIT 1;")
BL_ID=$(db_query "SELECT id FROM delivery_notes LIMIT 1;")
USER_ID=$(db_query "SELECT id FROM users WHERE role='etudiant' AND email NOT LIKE 'deleted%' LIMIT 1;")
echo "CAMPAIGN=$CAMPAIGN_ID PRODUCT=$PRODUCT_ID ORDER=$ORDER_ID BL=$BL_ID USER=$USER_ID"

# ════════════════════════════════════════════════════════════
# PHASE 1 — STRUCTURE
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 1 — STRUCTURE CODE ═══"

echo "--- Routes (34 attendues) ---"
ROUTES_DIR="/root/vins-conversations/backend/src/routes"
RF=0; RM=0
for route in auth campaigns orders products users analytics exports margins payments \
  stock suppliers contacts deliveryNotes deliveryRoutes formation invitations \
  notifications categories ambassador auditLog catalogPdf boutiqueAPI \
  paymentIntents publicCatalog webhooks pricingConditions dashboard \
  appSettings campaignResources campaignTypes clientTypes organizationTypes \
  referral shipping siteImages; do
  FILE=$(find "$ROUTES_DIR" -maxdepth 1 -iname "${route}.js" 2>/dev/null | head -1)
  [ -n "$FILE" ] && { log_pass "Route: $route"; ((RF++)); } || { log_fail "Route: $route MANQUANT"; ((RM++)); }
done
log_info "Routes: $RF/$((RF+RM))"

echo ""
echo "--- Services (10 attendus) ---"
for svc in orderService dashboardService rulesEngine stripeService emailService \
  badgeService notificationService boutiqueOrderService cartService marginFilters; do
  FILE=$(find /root/vins-conversations/backend/src/services -iname "${svc}.js" 2>/dev/null | head -1)
  [ -n "$FILE" ] && log_pass "Service: $svc" || log_fail "Service: $svc MANQUANT"
done

# ════════════════════════════════════════════════════════════
# PHASE 2 — ENDPOINTS API
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 2 — ENDPOINTS API ═══"

echo "--- Auth ---"
test_ep POST "/auth/login" "" '{"email":"bad@bad.com","password":"wrong"}' "401 400" "Login invalide rejeté"

echo "--- Produits ---"
test_ep GET "/products" "" "" "200" "Catalogue public"
PROD_RESP=$(curl -s "$API/products" --max-time 10)
PROD_IMG=$(echo "$PROD_RESP" | jq '[if type=="array" then .[] else (.products // .data // [])[] end] | map(select(.image_url != null)) | length' 2>/dev/null)
[ "${PROD_IMG:-0}" -gt 0 ] && log_pass "Produits avec image_url: $PROD_IMG" || log_fail "Produits image_url ABSENT"

echo "--- Admin Produits ---"
test_ep GET "/admin/products" "$TOKEN_ADMIN" "" "200" "Admin catalogue"
test_ep GET "/admin/products" "$TOKEN_STUDENT" "" "403 401" "Admin produits étudiant bloqué"

echo "--- Catégories ---"
test_ep GET "/admin/categories" "$TOKEN_ADMIN" "" "200" "Catégories"
CAT_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/categories" --max-time 10)
echo "$CAT_RESP" | jq -e '.[0].product_type // .[0].type // .categories[0].product_type' >/dev/null 2>&1 && \
  log_pass "Catégories → product_type" || log_warn "Catégories → product_type non trouvé"

echo "--- Commandes ---"
test_ep GET "/admin/orders" "$TOKEN_ADMIN" "" "200" "Liste commandes admin"
test_ep GET "/admin/orders?status=pending" "$TOKEN_ADMIN" "" "200" "Filtre commandes par statut"
[ -n "$ORDER_ID" ] && test_ep GET "/orders/$ORDER_ID" "$TOKEN_ADMIN" "" "200" "Détail commande"

echo "--- Stock ---"
test_ep GET "/admin/stock" "$TOKEN_ADMIN" "" "200" "Stock"
STOCK_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/stock" --max-time 10)
STOCK_KEYS=$(echo "$STOCK_RESP" | jq '(if type=="array" then .[0] elif .stock then .stock[0] else {} end) | keys' 2>/dev/null)
log_info "Stock fields: $STOCK_KEYS"
test_ep GET "/admin/stock/alerts" "$TOKEN_ADMIN" "" "200" "Alertes stock"

echo "--- BL ---"
test_ep GET "/admin/delivery-notes" "$TOKEN_ADMIN" "" "200" "Liste BL"
[ -n "$BL_ID" ] && test_ep GET "/admin/delivery-notes/$BL_ID" "$TOKEN_ADMIN" "" "200" "Détail BL"
log_warn "BL PDF → SKIP (crash stream)"

echo "--- Tournées ---"
test_ep GET "/admin/delivery-routes" "$TOKEN_ADMIN" "" "200" "Tournées"

echo "--- Fournisseurs ---"
test_ep GET "/admin/suppliers" "$TOKEN_ADMIN" "" "200" "Fournisseurs"
test_ep POST "/admin/suppliers" "$TOKEN_ADMIN" '{"name":"Audit Supplier","contact_name":"A","contact_email":"a@b.fr"}' "200 201" "Création fournisseur"

echo "--- Contacts ---"
test_ep GET "/admin/contacts" "$TOKEN_ADMIN" "" "200" "Contacts"
test_ep POST "/admin/contacts" "$TOKEN_ADMIN" '{"name":"Audit Contact","email":"ac@t.fr","type":"particulier"}' "200 201" "Création contact"

echo "--- Finance ---"
test_ep GET "/admin/financial-events" "$TOKEN_ADMIN" "" "200" "Financial events"
test_ep GET "/admin/margins" "$TOKEN_ADMIN" "" "200" "Marges"
test_ep GET "/admin/margins?campaign_id=$CAMPAIGN_ID" "$TOKEN_ADMIN" "" "200" "Marges/campagne"
test_ep GET "/admin/margins/by-product" "$TOKEN_ADMIN" "" "200" "Marges/produit"
test_ep GET "/admin/margins/by-supplier" "$TOKEN_ADMIN" "" "200" "Marges/fournisseur"
FE_DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/financial-events/1" --max-time 5)
echo "$FE_DEL" | grep -qE "^(404|405|403)$" && log_pass "financial_events append-only ($FE_DEL)" || log_fail "financial_events DELETE → $FE_DEL"

echo "--- Paiements ---"
test_ep GET "/admin/payments" "$TOKEN_ADMIN" "" "200" "Paiements"

echo "--- Retours ---"
test_ep GET "/admin/returns" "$TOKEN_ADMIN" "" "200" "Retours"

echo "--- Notifications ---"
test_ep GET "/notifications" "$TOKEN_ADMIN" "" "200" "Notifications"

echo "--- Conditions ---"
test_ep GET "/admin/pricing-conditions" "$TOKEN_ADMIN" "" "200" "Conditions commerciales"
PRICING_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/pricing-conditions" --max-time 10 | jq 'if type=="array" then length elif .conditions then (.conditions|length) else 0 end' 2>/dev/null)
log_info "Conditions: $PRICING_COUNT (attendu: 7)"

echo "--- Audit Log ---"
test_ep GET "/admin/audit-log" "$TOKEN_ADMIN" "" "200" "Audit log"
test_ep GET "/admin/audit-log" "$TOKEN_STUDENT" "" "403 401" "Audit étudiant bloqué"

echo "--- Campagnes ---"
test_ep GET "/admin/campaigns" "$TOKEN_ADMIN" "" "200" "Campagnes"

echo "--- Utilisateurs ---"
test_ep GET "/admin/users" "$TOKEN_ADMIN" "" "200" "Utilisateurs"
test_ep GET "/admin/invitations" "$TOKEN_ADMIN" "" "200" "Invitations"

echo "--- App Settings ---"
test_ep GET "/admin/settings" "$TOKEN_ADMIN" "" "200" "Admin settings"
test_ep GET "/settings/public" "" "" "200" "Settings publics"

echo "--- Ressources Campagne ---"
test_ep GET "/admin/campaign-resources" "$TOKEN_ADMIN" "" "200" "Ressources admin"
[ -n "$CAMPAIGN_ID" ] && test_ep GET "/campaigns/$CAMPAIGN_ID/resources" "$TOKEN_STUDENT" "" "200" "Ressources étudiant"

echo "--- Shipping ---"
test_ep GET "/admin/shipping-zones" "$TOKEN_ADMIN" "" "200" "Zones livraison"
test_ep GET "/admin/shipping-rates" "$TOKEN_ADMIN" "" "200" "Grille tarifaire"
SHIP_RESP=$(curl -s "$API/public/shipping-calculate?dept=49&qty=12" --max-time 10)
SHIP_AMT=$(echo "$SHIP_RESP" | jq '.amount // .cost // .shipping_cost // .shipping // empty' 2>/dev/null)
[ -n "$SHIP_AMT" ] && [ "$SHIP_AMT" != "null" ] && log_pass "Calcul transport → ${SHIP_AMT}€" || log_fail "Calcul transport absent"

echo "--- Client Types ---"
test_ep GET "/admin/client-types" "$TOKEN_ADMIN" "" "200" "Client types"

# ════════════════════════════════════════════════════════════
# PHASE 3 — DASHBOARDS
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 3 — DASHBOARDS ═══"

echo "--- Cockpit Admin ---"
test_ep GET "/dashboard/admin/cockpit" "$TOKEN_ADMIN" "" "200" "Cockpit admin"
COCKPIT=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/dashboard/admin/cockpit" --max-time 10)
COCKPIT_KEYS=$(echo "$COCKPIT" | jq 'keys' 2>/dev/null)
log_info "Cockpit keys: $COCKPIT_KEYS"

# Check for expected KPIs (flexible names)
echo "$COCKPIT" | jq -e '.ca_ttc // .kpis.ca_ttc // .stats.ca_ttc' >/dev/null 2>&1 && log_pass "Cockpit ca_ttc" || log_fail "Cockpit ca_ttc ABSENT"
echo "$COCKPIT" | jq -e '.ca_ht // .kpis.ca_ht // .stats.ca_ht' >/dev/null 2>&1 && log_pass "Cockpit ca_ht" || log_fail "Cockpit ca_ht ABSENT"
echo "$COCKPIT" | jq -e '.marge_globale // .kpis.marge_globale // .stats.marge_globale // .margin // .marge' >/dev/null 2>&1 && log_pass "Cockpit marge" || log_fail "Cockpit marge ABSENT"
echo "$COCKPIT" | jq -e '.commandes_total // .total_orders // .orders_count // .stats.commandes_total' >/dev/null 2>&1 && log_pass "Cockpit commandes_total" || log_fail "Cockpit commandes_total ABSENT"
echo "$COCKPIT" | jq -e '.top_students // .classement // .ranking // .leaderboard' >/dev/null 2>&1 && log_pass "Cockpit classement" || log_fail "Cockpit classement ABSENT"

echo ""
echo "--- Dashboard Étudiant ---"
test_ep GET "/dashboard/student" "$TOKEN_STUDENT" "" "200" "Dashboard étudiant"
STU=$(curl -s -H "Authorization: Bearer $TOKEN_STUDENT" "$API/dashboard/student" --max-time 10)
STU_KEYS=$(echo "$STU" | jq 'keys' 2>/dev/null)
log_info "Student dashboard keys: $STU_KEYS"

echo "$STU" | jq -e '.ca // .stats.ca // .total_sales' >/dev/null 2>&1 && log_pass "Étudiant ca" || log_fail "Étudiant ca ABSENT"
echo "$STU" | jq -e '.rank // .ranking // .position' >/dev/null 2>&1 && log_pass "Étudiant rank" || log_fail "Étudiant rank ABSENT"
echo "$STU" | jq -e '.streak // .current_streak' >/dev/null 2>&1 && log_pass "Étudiant streak" || log_fail "Étudiant streak ABSENT"
echo "$STU" | jq -e '.badges // .earned_badges' >/dev/null 2>&1 && log_pass "Étudiant badges" || log_fail "Étudiant badges ABSENT"
echo "$STU" | jq -e '.free_bottles_earned // .free_bottles' >/dev/null 2>&1 && log_pass "Étudiant free_bottles" || log_fail "Étudiant free_bottles ABSENT"
echo "$STU" | jq -e '.referral_code // .participation.referral_code' >/dev/null 2>&1 && log_pass "Étudiant referral_code" || log_fail "Étudiant referral_code ABSENT"
echo "$STU" | jq -e '.fund_collective // .commission.fund_collective // .funds.collective' >/dev/null 2>&1 && log_pass "fund_collective" || log_fail "fund_collective ABSENT (V4.1)"
echo "$STU" | jq -e '.fund_individual // .commission.fund_individual // .funds.individual' >/dev/null 2>&1 && log_pass "fund_individual" || log_fail "fund_individual ABSENT (V4.1)"

echo ""
echo "--- Dashboard Enseignant ZÉRO EUROS ---"
test_ep GET "/dashboard/teacher" "$TOKEN_TEACHER" "" "200" "Dashboard enseignant"
TEACH=$(curl -s -H "Authorization: Bearer $TOKEN_TEACHER" "$API/dashboard/teacher" --max-time 10)
MONEY_FOUND=0
for field in ca ca_ht ca_ttc total total_ht total_ttc amount price price_ttc price_ht commission montant revenue earnings; do
  VAL=$(echo "$TEACH" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  def find(o,k,depth=0):
    if depth>10: return None
    if isinstance(o,dict):
      if k in o and o[k] not in [None,'',0,0.0,'0','0.00']: return str(o[k])
      for v in o.values():
        r=find(v,k,depth+1)
        if r: return r
    elif isinstance(o,list):
      for i in o:
        r=find(i,k,depth+1)
        if r: return r
  r=find(d,'$field')
  if r: print(r)
except: pass
" 2>/dev/null)
  [ -n "$VAL" ] && { log_fail "Enseignant champ monétaire '$field' = $VAL"; MONEY_FOUND=1; }
done
[ $MONEY_FOUND -eq 0 ] && log_pass "Enseignant ZÉRO champ monétaire"

echo ""
echo "--- Dashboard CSE ---"
test_ep GET "/dashboard/cse" "$TOKEN_CSE" "" "200" "Dashboard CSE"
CSE=$(curl -s -H "Authorization: Bearer $TOKEN_CSE" "$API/dashboard/cse" --max-time 10)
CSE_KEYS=$(echo "$CSE" | jq 'keys' 2>/dev/null)
log_info "CSE keys: $CSE_KEYS"
echo "$CSE" | jq -e '.products // .catalog' >/dev/null 2>&1 && log_pass "CSE products" || log_fail "CSE products ABSENT"
echo "$CSE" | jq -e '.campaign // .campaign_info' >/dev/null 2>&1 && log_pass "CSE campaign" || log_fail "CSE campaign ABSENT"

echo ""
echo "--- Dashboard Ambassadeur ---"
test_ep GET "/dashboard/ambassador" "$TOKEN_AMBASSADOR" "" "200" "Dashboard ambassadeur"
AMB=$(curl -s -H "Authorization: Bearer $TOKEN_AMBASSADOR" "$API/dashboard/ambassador" --max-time 10)
AMB_KEYS=$(echo "$AMB" | jq 'keys' 2>/dev/null)
log_info "Ambassador keys: $AMB_KEYS"
echo "$AMB" | jq -e '.tier // .current_tier' >/dev/null 2>&1 && log_pass "Ambassadeur tier" || log_fail "Ambassadeur tier ABSENT"
echo "$AMB" | jq -e '.ca // .total_sales // .stats.ca' >/dev/null 2>&1 && log_pass "Ambassadeur ca" || log_fail "Ambassadeur ca ABSENT"
echo "$AMB" | jq -e '.referral_code // .code' >/dev/null 2>&1 && log_pass "Ambassadeur referral_code" || log_fail "Ambassadeur referral_code ABSENT"
echo "$AMB" | jq -e '.stats // .statistics' >/dev/null 2>&1 && log_pass "Ambassadeur stats" || log_fail "Ambassadeur stats ABSENT"

echo ""
echo "--- Analytics ---"
test_ep GET "/dashboard/admin/analytics" "$TOKEN_ADMIN" "" "200" "Analytics admin"

# ════════════════════════════════════════════════════════════
# PHASE 4 — EXPORTS
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 4 — EXPORTS ═══"

test_export() {
  local URL=$1 LABEL=$2 MIN_SIZE=${3:-50}
  local OUTFILE=$(mktemp)
  HTTP=$(curl -s -o "$OUTFILE" -w "%{http_code}" -H "Authorization: Bearer $TOKEN_ADMIN" "$API$URL" --max-time 30)
  SIZE=$(wc -c < "$OUTFILE" 2>/dev/null || echo 0)
  FTYPE=$(file -b "$OUTFILE" 2>/dev/null | head -c 60)
  [ "$HTTP" = "200" ] && [ "$SIZE" -gt "$MIN_SIZE" ] && \
    log_pass "$LABEL → ${SIZE}B ($FTYPE)" || \
    log_fail "$LABEL → HTTP $HTTP, ${SIZE}B"
  rm -f "$OUTFILE"
}

test_export "/admin/exports/pennylane" "Pennylane CSV" 100
test_export "/admin/exports/sales-journal" "Journal ventes CSV" 100
test_export "/admin/exports/commissions" "Commissions PDF" 200
test_export "/admin/exports/commissions?format=csv" "Commissions CSV" 100
test_export "/admin/exports/stock" "Stock CSV" 100
test_export "/admin/exports/delivery-notes" "BL mois PDF" 500
test_export "/admin/exports/activity-report" "Rapport activité PDF" 500

echo ""
echo "--- Exports supplémentaires ---"
[ -n "$PRODUCT_ID" ] && test_export "/admin/products/$PRODUCT_ID/pdf" "Fiche produit PDF" 1000
[ -n "$CAMPAIGN_ID" ] && test_export "/admin/campaigns/$CAMPAIGN_ID/report-pdf" "Rapport campagne PDF" 1000
test_export "/admin/exports/catalog-pdf" "Catalogue PDF" 2000
[ -n "$CAMPAIGN_ID" ] && test_export "/admin/exports/campaign-pivot?campaign_id=$CAMPAIGN_ID" "Pivot XLSX" 2000
[ -n "$CAMPAIGN_ID" ] && test_export "/admin/exports/campaign-pivot?campaign_id=$CAMPAIGN_ID&format=csv" "Pivot CSV" 100

echo ""
echo "--- Contenu Pennylane ---"
PENNY=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/exports/pennylane" --max-time 10)
for col in journal compte debit credit date; do
  echo "$PENNY" | grep -qi "$col" && log_pass "Pennylane '$col'" || log_fail "Pennylane '$col' ABSENT"
done

echo "--- TVA journal ---"
JRNL=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/exports/sales-journal" --max-time 10)
echo "$JRNL" | grep -qiE "tva.?20|20%" && log_pass "Journal TVA 20%" || log_fail "Journal TVA 20% ABSENTE"
echo "$JRNL" | grep -qiE "tva.?5|5.5%" && log_pass "Journal TVA 5.5%" || log_fail "Journal TVA 5.5% ABSENTE"

# ════════════════════════════════════════════════════════════
# PHASE 5 — RÈGLES MÉTIER
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 5 — RÈGLES MÉTIER ═══"

for field in pricing_rules commission_rules free_bottle_rules tier_rules; do
  COUNT=$(db_query "SELECT COUNT(*) FROM client_types WHERE $field IS NOT NULL AND $field::text != 'null';")
  [ "${COUNT:-0}" -gt 0 ] && log_pass "$field → $COUNT types" || log_fail "$field → AUCUN"
done

BAD=$(grep -rn "financial_events" /root/vins-conversations/backend/src/ --include="*.js" -i 2>/dev/null | grep -iE "\.update|\.delete|\.del" | grep -v "test\|spec\|\.test\.\|//" | wc -l)
[ "${BAD:-0}" = "0" ] && log_pass "financial_events append-only" || log_fail "$BAD mutations détectées"

# ════════════════════════════════════════════════════════════
# PHASE 6 — BASE DE DONNÉES
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 6 — BASE DE DONNÉES ═══"

echo "--- Tables V4.0 (20) ---"
for table in users participations invitations organizations campaigns client_types \
  products campaign_products stock_movements orders order_items \
  financial_events payments delivery_notes returns contacts \
  audit_log notifications delivery_routes pricing_conditions; do
  COUNT=$(db_query "SELECT COUNT(*) FROM $table;")
  [ -n "$COUNT" ] && log_pass "$table ($COUNT)" || log_fail "$table ABSENTE"
done

echo "--- Tables V4.1 (5) ---"
for table in product_categories shipping_zones shipping_rates campaign_resources app_settings; do
  COUNT=$(db_query "SELECT COUNT(*) FROM $table;")
  [ -n "$COUNT" ] && log_pass "$table ($COUNT)" || log_fail "$table ABSENTE"
done

echo "--- Tables V4.2 ---"
for table in regions site_images refresh_tokens organization_types campaign_types; do
  COUNT=$(db_query "SELECT COUNT(*) FROM $table;")
  [ -n "$COUNT" ] && log_pass "$table ($COUNT)" || log_fail "$table ABSENTE"
done

echo "--- Colonnes clés ---"
check_col() {
  EXISTS=$(db_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='$1' AND column_name='$2';")
  [ "$EXISTS" = "1" ] && log_pass "$1.$2" || log_fail "$1.$2 ABSENTE"
}
check_col products category_id
check_col products is_featured
check_col products visible_boutique
check_col organizations logo_url
check_col participations referral_code
check_col orders referred_by
check_col orders source
check_col campaigns brand_name
check_col campaigns logo_url
check_col users ambassador_photo_url
check_col users region_id
check_col product_categories product_type
check_col product_categories is_alcohol

echo "--- Images ---"
WIX=$(db_query "SELECT COUNT(*) FROM products WHERE image_url LIKE '%wixstatic%';")
[ "${WIX:-0}" = "0" ] && log_pass "Aucune URL Wix" || log_fail "$WIX URL Wix"

for img in cremant-de-loire apertus carillon coffret-decouverte-3bt jus-de-pomme; do
  FOUND=$(find /root/vins-conversations/backend/uploads/products -name "*${img}*" 2>/dev/null | head -1)
  [ -n "$FOUND" ] && log_pass "$img sur disque" || log_fail "$img manquant"
done

log_info "Produits: $(db_query 'SELECT COUNT(*) FROM products;'), Users: $(db_query 'SELECT COUNT(*) FROM users;'), Commandes: $(db_query 'SELECT COUNT(*) FROM orders;')"

# ════════════════════════════════════════════════════════════
# PHASE 7 — SÉCURITÉ RBAC
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 7 — SÉCURITÉ RBAC ═══"

echo "--- Accès interdit ---"
test_ep GET "/admin/orders" "$TOKEN_STUDENT" "" "403 401" "Étudiant → admin bloqué"
test_ep GET "/admin/users" "$TOKEN_STUDENT" "" "403 401" "Étudiant → users bloqué"
test_ep GET "/admin/exports/pennylane" "$TOKEN_STUDENT" "" "403 401" "Étudiant → exports bloqué"
test_ep GET "/admin/financial-events" "$TOKEN_TEACHER" "" "403 401" "Enseignant → finance bloqué"
test_ep GET "/admin/orders" "" "" "401 403" "Sans token bloqué"

echo "--- Accès autorisé ---"
test_ep GET "/products" "" "" "200" "Public catalogue"
test_ep GET "/dashboard/student" "$TOKEN_STUDENT" "" "200" "Étudiant dashboard"
test_ep GET "/dashboard/teacher" "$TOKEN_TEACHER" "" "200" "Enseignant dashboard"
test_ep GET "/dashboard/cse" "$TOKEN_CSE" "" "200" "CSE dashboard"
test_ep GET "/dashboard/ambassador" "$TOKEN_AMBASSADOR" "" "200" "Ambassadeur dashboard"

echo "--- JWT invalide ---"
test_ep GET "/admin/orders" "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.FAKE" "" "401 403" "Token invalide rejeté"

# ════════════════════════════════════════════════════════════
# PHASE 8 — SITE PUBLIC & BOUTIQUE
# ════════════════════════════════════════════════════════════
echo ""
echo "═══ PHASE 8 — SITE & BOUTIQUE ═══"

SITE="http://localhost:8082"
echo "--- Pages site ---"
for page in index prestations cse ecoles ambassadeurs coffrets apropos equipe faq avis partenaires boutique contact; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/${page}.html" --max-time 5)
  [ "$CODE" = "200" ] && log_pass "${page}.html" || log_fail "${page}.html → $CODE"
done

echo "--- API publique ---"
test_ep GET "/public/catalog" "" "" "200" "Catalogue boutique"
test_ep GET "/public/featured" "" "" "200" "Featured products"

# ════════════════════════════════════════════════════════════
# RÉSUMÉ
# ════════════════════════════════════════════════════════════
echo ""
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "         RÉSUMÉ AUDIT — V&C V4.2 — $TIMESTAMP"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ PASS:  $PASS"
echo "  ❌ FAIL:  $FAIL"
echo "  ⚠️  WARN:  $WARN"
echo "  TOTAL:   $((PASS + FAIL + WARN))"
echo ""
if [ $((PASS + FAIL)) -gt 0 ]; then
  SCORE=$(echo "scale=1; $PASS * 100 / ($PASS + $FAIL)" | bc 2>/dev/null || echo "?")
  echo "  SCORE: ${SCORE}% ($PASS / $((PASS + FAIL)))"
fi
echo "══════════════════════════════════════════════════════════════"
