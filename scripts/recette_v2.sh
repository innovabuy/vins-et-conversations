#!/bin/bash
set -o pipefail

API="http://localhost:3001/api/v1"
FRONT="http://localhost:5173"
SITE="http://localhost:8082"
VPS_IP="76.13.44.13"
PASSWORD='VinsConv2026!'

> /tmp/recette_results.txt

pass() { echo "  ✅ $1" | tee -a /tmp/recette_results.txt; }
fail() { echo "  ❌ $1" | tee -a /tmp/recette_results.txt; }
warn() { echo "  ⚠️ $1" | tee -a /tmp/recette_results.txt; }

echo "================================================================"
echo "RECETTE FONCTIONNELLE V2 — $(date '+%d/%m/%Y %H:%M')"
echo "VPS : $VPS_IP"
echo "================================================================"

login() {
  local email="$1" pass="$2"
  LOGIN_EMAIL="$email" LOGIN_PASS="$pass" LOGIN_API="$API" python3 -c "
import urllib.request, json, os, sys
try:
  data = json.dumps({'email': os.environ['LOGIN_EMAIL'], 'password': os.environ['LOGIN_PASS']}).encode()
  req = urllib.request.Request(os.environ['LOGIN_API'] + '/auth/login', data=data, headers={'Content-Type':'application/json'})
  resp = urllib.request.urlopen(req)
  d = json.loads(resp.read())
  print(d.get('accessToken') or d.get('token') or d.get('access_token') or '')
except:
  print('')
" 2>/dev/null
}

echo ""
echo "--- Connexion comptes ---"
TOKEN_ADMIN=$(login "nicolas@vins-conversations.fr" "$PASSWORD")
TOKEN_STUDENT=$(login "ackavong@eleve.sc.fr" "$PASSWORD")
TOKEN_TEACHER=$(login "enseignant@sacrecoeur.fr" "$PASSWORD")
TOKEN_CSE=$(login "cse@leroymerlin.fr" "$PASSWORD")
TOKEN_AMBASSADOR=$(login "ambassadeur@example.fr" "$PASSWORD")

[ -n "$TOKEN_ADMIN" ]      && pass "Admin connecté"       || fail "ADMIN LOGIN"
[ -n "$TOKEN_STUDENT" ]    && pass "Étudiant connecté"     || fail "ÉTUDIANT LOGIN"
[ -n "$TOKEN_TEACHER" ]    && pass "Enseignant connecté"   || fail "Enseignant LOGIN"
[ -n "$TOKEN_CSE" ]        && pass "CSE connecté"          || warn "CSE LOGIN"
[ -n "$TOKEN_AMBASSADOR" ] && pass "Ambassadeur connecté"  || warn "Ambassadeur LOGIN"

# IDs de référence — endpoint corrigé : GET /products (pas /admin/products)
PRODUCTS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/products" 2>/dev/null)
PRODUCT_ID=$(echo "$PRODUCTS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d.get('data',d if isinstance(d,list) else [])
if a: print(a[0]['id'])
" 2>/dev/null)
PRODUCT_ID2=$(echo "$PRODUCTS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d.get('data',d if isinstance(d,list) else [])
if len(a)>1: print(a[1]['id'])
" 2>/dev/null)

# Campagne Sacré-Cœur
CAMPAIGNS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/campaigns" 2>/dev/null)
CAMPAIGN_ID=$(echo "$CAMPAIGNS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d if isinstance(d,list) else d.get('campaigns',d.get('data',[]))
for c in a:
    if 'Sacr' in c.get('name',''):
        print(c['id']); sys.exit()
if a: print(a[0]['id'])
" 2>/dev/null)

# Campagne CSE
CSE_CAMPAIGN=$(echo "$CAMPAIGNS_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d if isinstance(d,list) else d.get('campaigns',d.get('data',[]))
for c in a:
    if 'cse' in c.get('name','').lower() or 'leroy' in c.get('name','').lower():
        print(c['id']); sys.exit()
" 2>/dev/null)

echo ""
echo "  CAMPAIGN_ID  : ${CAMPAIGN_ID:-NON TROUVÉ}"
echo "  CSE_CAMPAIGN : ${CSE_CAMPAIGN:-NON TROUVÉ}"
echo "  PRODUCT_ID   : ${PRODUCT_ID:-NON TROUVÉ}"
echo "  PRODUCT_ID2  : ${PRODUCT_ID2:-NON TROUVÉ}"

[ -n "$PRODUCT_ID" ] && pass "Produits en base" || fail "Aucun produit en base"
[ -n "$CAMPAIGN_ID" ] && pass "Campagne Sacré-Cœur trouvée" || fail "Aucune campagne trouvée"

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 1 — ÉTUDIANT : DASHBOARD + COMMANDE"
echo "════════════════════════════════════════════"

echo ""
echo "--- 1.1 Dashboard étudiant ---"
STUDENT_DASH=$(curl -s -H "Authorization: Bearer $TOKEN_STUDENT" "$API/dashboard/student" 2>/dev/null)
echo "$STUDENT_DASH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
# Champs corrigés : position (pas rank), freeBottles (pas free_bottles_earned)
checks = {
    'ca': d.get('ca'),
    'position': d.get('position'),
    'freeBottles': d.get('freeBottles'),
    'referral_code': d.get('referral_code'),
    'fund_collective': d.get('fund_collective'),
    'fund_individual': d.get('fund_individual'),
    'streak': d.get('streak'),
    'badges': d.get('badges'),
    'campaign.brand_name': (d.get('campaign') or {}).get('brand_name'),
}
for k,v in checks.items():
    icon = '✅' if v is not None else '❌'
    print(f'  {icon} {k}: {str(v)[:80]}')

# Commandes récentes avec produits
orders = d.get('recent_orders', [])
if orders:
    has_prods = any(o.get('products') for o in orders)
    print(f'  ✅ recent_orders: {len(orders)} commande(s), produits={has_prods}')
else:
    print(f'  ⚠️ recent_orders vide')
" 2>/dev/null
DASH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_STUDENT" "$API/dashboard/student" 2>/dev/null)
[ "$DASH_CODE" = "200" ] && pass "Dashboard étudiant (200)" || fail "Dashboard étudiant ($DASH_CODE)"

echo ""
echo "--- 1.2 Commande étudiant ---"
if [ -n "$PRODUCT_ID" ] && [ -n "$CAMPAIGN_ID" ]; then
  ORDER_BODY=$(CAMP="$CAMPAIGN_ID" PID1="$PRODUCT_ID" PID2="${PRODUCT_ID2:-$PRODUCT_ID}" python3 -c "
import json, os
print(json.dumps({
  'campaign_id': os.environ['CAMP'],
  'items': [
    {'productId': os.environ['PID1'], 'qty': 3},
    {'productId': os.environ['PID2'], 'qty': 2}
  ],
  'customer_name': 'Client Test Recette',
  'payment_method': 'cash',
  'notes': 'Test recette automatique'
}))
")
  ORDER_RESP=$(curl -s -X POST "$API/orders" \
    -H "Authorization: Bearer $TOKEN_STUDENT" \
    -H "Content-Type: application/json" \
    -d "$ORDER_BODY" 2>/dev/null)
  ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('id') or d.get('order',{}).get('id') or d.get('order_id') or '')
" 2>/dev/null)
  if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ] && [ "$ORDER_ID" != "None" ]; then
    pass "Commande créée : $ORDER_ID"
    echo "$ORDER_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
o=d.get('order',d)
t=str(o.get('total_ttc','?'))
print(f'  total_ttc={t} status={o.get(\"status\",\"?\")} items={len(o.get(\"items\",[]))}')
if 'nan' in t.lower() or t in ('0','0.00',''):
    print('  ❌ MONTANT SUSPECT')
" 2>/dev/null
  else
    fail "Commande ÉCHOUÉE"
    echo "  $(echo "$ORDER_RESP" | head -c 500)"
  fi
else
  fail "Pas de PRODUCT_ID/CAMPAIGN_ID"
fi

echo ""
echo "--- 1.3 Historique commandes ---"
HISTORY=$(curl -s -H "Authorization: Bearer $TOKEN_STUDENT" "$API/orders/my" 2>/dev/null)
HIST_COUNT=$(echo "$HISTORY" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  a=d if isinstance(d,list) else d.get('orders',d.get('data',[]))
  print(len(a))
except: print(0)
" 2>/dev/null)
[ "${HIST_COUNT:-0}" -gt 0 ] && pass "Historique : $HIST_COUNT commande(s)" || fail "Historique vide"

echo ""
echo "--- 1.4 Inscription (nécessite code invitation) ---"
# Vérifier qu'un code d'invitation existe
INV_CODE=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/invitations?campaign_id=$CAMPAIGN_ID&used=false" 2>/dev/null \
  | python3 -c "
import json,sys
from datetime import datetime
try:
  d=json.load(sys.stdin)
  a=d if isinstance(d,list) else d.get('invitations',d.get('data',[]))
  now=datetime.utcnow().isoformat()
  for inv in a:
    code = inv.get('code','')
    expires = inv.get('expires_at','')
    if code and (not expires or expires > now):
      print(code); sys.exit()
except: pass
print('')
" 2>/dev/null)
if [ -n "$INV_CODE" ]; then
  REG_BODY=$(INV="$INV_CODE" python3 -c "
import json, time, os
print(json.dumps({
  'code': os.environ['INV'],
  'email': f'test.recette.{int(time.time())}@sacrecoeur.fr',
  'name': 'Test Recette',
  'password': 'TestRecette1234',
  'parental_consent': True
}))
")
  REG_RESP=$(curl -s -X POST "$API/auth/register" \
    -H "Content-Type: application/json" \
    -d "$REG_BODY" 2>/dev/null)
  echo "$REG_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
uid=d.get('id') or (d.get('user') or {}).get('id','') or ''
token=d.get('accessToken','')
if uid or token: print(f'  ✅ Utilisateur créé : {uid}')
else: print(f'  ❌ Inscription: {str(d)[:300]}')
" 2>/dev/null
  REG_OK=$(echo "$REG_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('1' if d.get('accessToken') or d.get('id') or d.get('user') else '0')
" 2>/dev/null)
  [ "$REG_OK" = "1" ] && pass "Inscription via code invitation" || fail "Inscription échouée"
else
  warn "Pas de code invitation trouvé — test inscription skippé"
  # Vérifier si l'endpoint invitations existe
  INV_CODE2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/invitations" 2>/dev/null)
  echo "  Endpoint /admin/invitations : HTTP $INV_CODE2"
fi

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 2 — ADMIN : COMMANDES + BL"
echo "════════════════════════════════════════════"

echo ""
echo "--- 2.1 Admin liste commandes (GET /orders/admin/list) ---"
ORDERS=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/orders/admin/list" 2>/dev/null)
ORDERS_COUNT=$(echo "$ORDERS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d.get('data',d if isinstance(d,list) else d.get('orders',[]))
print(len(a))
" 2>/dev/null)
[ "${ORDERS_COUNT:-0}" -gt 0 ] && pass "Admin : $ORDERS_COUNT commande(s)" || fail "Admin : 0 commandes"

echo ""
echo "--- 2.2 Validation commande ---"
if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ] && [ "$ORDER_ID" != "None" ]; then
  # PUT /orders/admin/:id
  VALIDATE=$(curl -s -X PUT "$API/orders/admin/$ORDER_ID" \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    -H "Content-Type: application/json" \
    -d '{"status":"validated"}' 2>/dev/null)
  VAL_STATUS=$(echo "$VALIDATE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
o=d.get('order',d)
print(o.get('status',''))
" 2>/dev/null)
  if [ "$VAL_STATUS" = "validated" ]; then
    pass "Validation : status=validated"
  else
    fail "Validation échouée"
    echo "  Réponse: $(echo "$VALIDATE" | head -c 300)"
  fi
else
  warn "Pas d'ORDER_ID — validation skippée"
fi

echo ""
echo "--- 2.3 Bon de livraison ---"
if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ] && [ "$ORDER_ID" != "None" ]; then
  BL_BODY=$(OID="$ORDER_ID" python3 -c "import json,os; print(json.dumps({'order_id': os.environ['OID']}))")
  BL_RESP=$(curl -s -X POST "$API/admin/delivery-notes" \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    -H "Content-Type: application/json" \
    -d "$BL_BODY" 2>/dev/null)
  BL_ID=$(echo "$BL_RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d,dict):
    print(d.get('id',''))
elif isinstance(d,list) and d:
    print(d[0].get('id',''))
" 2>/dev/null)
  if [ -n "$BL_ID" ] && [ "$BL_ID" != "" ] && [ "$BL_ID" != "None" ]; then
    pass "BL créé : $BL_ID"
  else
    fail "Création BL échouée"
    echo "  Réponse: $(echo "$BL_RESP" | head -c 400)"
  fi
fi

echo ""
echo "--- 2.4 PDF du BL ---"
if [ -n "$BL_ID" ] && [ "$BL_ID" != "" ] && [ "$BL_ID" != "None" ]; then
  curl -s -o /tmp/test_bl.pdf \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    "$API/admin/delivery-notes/$BL_ID/pdf" 2>/dev/null
  BL_SIZE=$(wc -c < /tmp/test_bl.pdf 2>/dev/null || echo 0)
  if head -c 5 /tmp/test_bl.pdf 2>/dev/null | grep -q "%PDF" && [ "$BL_SIZE" -gt 1000 ]; then
    pass "PDF BL : $BL_SIZE bytes, %PDF valide"
  else
    fail "PDF BL invalide ($BL_SIZE bytes)"
  fi
else
  warn "Pas de BL — PDF skippé"
fi

echo ""
echo "--- 2.5 Cockpit admin ---"
COCKPIT=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/dashboard/admin/cockpit" 2>/dev/null)
COCKPIT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_ADMIN" "$API/dashboard/admin/cockpit" 2>/dev/null)
if [ "$COCKPIT_CODE" = "200" ]; then
  echo "$COCKPIT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
# Chercher dans la structure réelle
kpis = d.get('kpis', {})
if kpis:
    for k,v in list(kpis.items())[:8]:
        vstr = str(v)
        nan = 'nan' in vstr.lower()
        print(f'  {\"❌ NaN\" if nan else \"✅\"} kpis.{k}: {vstr[:60]}')
else:
    print(f'  Clés top: {list(d.keys())[:10]}')
    # Chercher les KPIs dans les sous-objets
    for k in d:
        if isinstance(d[k], (int, float)):
            print(f'  {k}: {d[k]}')
" 2>/dev/null
  pass "Cockpit admin (200)"
else
  fail "Cockpit admin ($COCKPIT_CODE)"
fi

echo ""
echo "--- 2.6 CRUD produit ---"
CAT_ID=$(curl -s -H "Authorization: Bearer $TOKEN_ADMIN" "$API/admin/categories" 2>/dev/null \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d if isinstance(d,list) else d.get('categories',d.get('data',[]))
if a: print(a[0]['id'])
" 2>/dev/null)
PROD_BODY=$(CID="$CAT_ID" python3 -c "
import json, os
print(json.dumps({
  'name': 'Vin Test Recette',
  'price_ttc': 12.50,
  'price_ht': 10.42,
  'purchase_price': 6.00,
  'tva_rate': 20,
  'stock': 100,
  'category_id': os.environ['CID'],
  'description': 'Produit de test'
}))
")
PROD_RESP=$(curl -s -X POST "$API/admin/products" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d "$PROD_BODY" 2>/dev/null)
TEST_PROD_ID=$(echo "$PROD_RESP" | python3 -c "
import json,sys; d=json.load(sys.stdin); print(d.get('product',d).get('id',''))
" 2>/dev/null)
if [ -n "$TEST_PROD_ID" ] && [ "$TEST_PROD_ID" != "" ] && [ "$TEST_PROD_ID" != "None" ]; then
  pass "CRUD produit : créé $TEST_PROD_ID"
  curl -s -X DELETE "$API/admin/products/$TEST_PROD_ID" \
    -H "Authorization: Bearer $TOKEN_ADMIN" > /dev/null 2>&1
else
  fail "CRUD produit échoué"
  echo "  $(echo "$PROD_RESP" | head -c 300)"
fi

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 3 — ENSEIGNANT : ZÉRO MONTANTS"
echo "════════════════════════════════════════════"

if [ -z "$TOKEN_TEACHER" ]; then
  fail "Pas de token enseignant"
else

TEACHER_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_TEACHER" "$API/dashboard/teacher" 2>/dev/null)
echo "$TEACHER_RESP" > /tmp/teacher_check.json

python3 << 'PYEOF'
import json

FORBIDDEN = ['ca','ca_ht','ca_ttc','total_ht','total_ttc','amount','price_ttc','price_ht',
  'commission','montant','revenue','earnings','gain','remise','discount','tarif','margin','marge']
violations = []

def check(obj, path='root'):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in FORBIDDEN and v is not None and v != 0 and v != '' and v != []:
                violations.append(f"{path}.{k} = {repr(v)[:60]}")
            check(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:5]):
            check(v, f"{path}[{i}]")

try:
    with open('/tmp/teacher_check.json') as f:
        data = json.load(f)
    check(data)
    if violations:
        print(f"  ❌ VIOLATIONS ({len(violations)}):")
        for v in violations[:15]:
            print(f"     {v}")
    else:
        print(f"  ✅ ZÉRO champ monétaire exposé")
except Exception as e:
    print(f"  ❌ Erreur: {e}")
PYEOF

TEACHER_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_TEACHER" "$API/dashboard/teacher" 2>/dev/null)
[ "$TEACHER_CODE" = "200" ] && pass "Dashboard enseignant (200)" || fail "Dashboard enseignant ($TEACHER_CODE)"

for endpoint in "/admin/orders" "/orders/admin/list" "/admin/margins" "/admin/payments"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN_TEACHER" "$API$endpoint" 2>/dev/null)
  [ "$CODE" != "200" ] && pass "RBAC enseignant $endpoint ($CODE)" || fail "RBAC LEAK $endpoint (200)"
done

fi

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 4 — EXPORTS"
echo "════════════════════════════════════════════"

export_check() {
  local label="$1" url="$2" ext="$3" min_size="${4:-500}"
  curl -s -o "/tmp/export_check.$ext" \
    -H "Authorization: Bearer $TOKEN_ADMIN" \
    "$API$url" 2>/dev/null
  local size; size=$(wc -c < "/tmp/export_check.$ext" 2>/dev/null || echo 0)
  local code; code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN_ADMIN" "$API$url" 2>/dev/null)
  if [ "$code" = "200" ] && [ "$size" -gt "$min_size" ]; then
    pass "Export $label : ${size}b"
  else
    fail "Export $label : code=$code size=$size"
    echo "  $(head -c 200 "/tmp/export_check.$ext" 2>/dev/null)"
  fi
}

export_check "Rapport activité PDF"   "/admin/exports/activity-report"                         pdf 2000
export_check "Campaign pivot"         "/admin/exports/campaign-pivot?campaign_id=$CAMPAIGN_ID"  xlsx 500
export_check "Pennylane CSV"          "/admin/exports/pennylane"                                csv 100
export_check "Journal ventes CSV"     "/admin/exports/sales-journal"                            csv 100
export_check "Commissions PDF"        "/admin/exports/commissions"                              pdf 1000
export_check "Stocks CSV"             "/admin/exports/stock"                                    csv 100
export_check "BL mois PDF"            "/admin/exports/delivery-notes"                           pdf 1000
export_check "Participant history"    "/admin/exports/participant-history?campaign_id=$CAMPAIGN_ID" xlsx 200
export_check "Seller detail"          "/admin/exports/seller-detail?campaign_id=$CAMPAIGN_ID"   xlsx 200
export_check "Sales by contact"       "/admin/exports/sales-by-contact?campaign_id=$CAMPAIGN_ID" xlsx 200

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 5 — CSE"
echo "════════════════════════════════════════════"

if [ -z "$TOKEN_CSE" ]; then
  warn "Pas de token CSE"
else

CSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_CSE" "$API/dashboard/cse" 2>/dev/null)
CSE_DASH=$(curl -s -H "Authorization: Bearer $TOKEN_CSE" "$API/dashboard/cse" 2>/dev/null)
if [ "$CSE_CODE" = "200" ]; then
  echo "$CSE_DASH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
prods=d.get('products',[])
print(f'  {len(prods)} produits CSE')
print(f'  discount={d.get(\"discountPct\",\"?\")}% minOrder={d.get(\"minOrder\",\"?\")}')
if prods:
    p=prods[0]
    print(f'  Ex: {p.get(\"name\",\"?\")} HT={p.get(\"price_ht\",\"?\")} TTC={p.get(\"price_ttc\",\"?\")}')
" 2>/dev/null
  pass "Dashboard CSE (200)"
else
  fail "Dashboard CSE ($CSE_CODE)"
fi

# Commande CSE
if [ -n "$CSE_CAMPAIGN" ] && [ -n "$PRODUCT_ID" ]; then
  CSE_BODY=$(CAMP="$CSE_CAMPAIGN" PID="$PRODUCT_ID" PID2="${PRODUCT_ID2:-$PRODUCT_ID}" python3 -c "
import json, os
print(json.dumps({
  'campaign_id': os.environ['CAMP'],
  'items': [
    {'productId': os.environ['PID'], 'qty': 18},
    {'productId': os.environ['PID2'], 'qty': 18}
  ],
  'delivery_address': 'Zone industrielle, 49000 Angers',
  'payment_method': 'transfer'
}))
")
  CSE_ORDER=$(curl -s -X POST "$API/orders" \
    -H "Authorization: Bearer $TOKEN_CSE" \
    -H "Content-Type: application/json" \
    -d "$CSE_BODY" 2>/dev/null)
  CSE_OID=$(echo "$CSE_ORDER" | python3 -c "
import json,sys; d=json.load(sys.stdin); print(d.get('id') or d.get('order',{}).get('id') or '')
" 2>/dev/null)
  if [ -n "$CSE_OID" ] && [ "$CSE_OID" != "" ] && [ "$CSE_OID" != "None" ]; then
    pass "Commande CSE : $CSE_OID"
  else
    fail "Commande CSE échouée"
    echo "  $(echo "$CSE_ORDER" | head -c 400)"
  fi
else
  warn "Pas de CSE_CAMPAIGN — commande CSE skippée"
fi

fi

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 6 — AMBASSADEUR"
echo "════════════════════════════════════════════"

if [ -z "$TOKEN_AMBASSADOR" ]; then
  warn "Pas de token ambassadeur"
else

AMB_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN_AMBASSADOR" "$API/dashboard/ambassador" 2>/dev/null)
AMB_DASH=$(curl -s -H "Authorization: Bearer $TOKEN_AMBASSADOR" "$API/dashboard/ambassador" 2>/dev/null)
if [ "$AMB_CODE" = "200" ]; then
  echo "$AMB_DASH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
# Champs réels
checks = {
    'tier.current': (d.get('tier') or {}).get('current'),
    'sales.caTTC': (d.get('sales') or {}).get('caTTC'),
    'sales.caHT': (d.get('sales') or {}).get('caHT'),
    'referralCode': d.get('referralCode'),
    'referralClicks': d.get('referralClicks'),
    'gains': d.get('gains'),
}
for k,v in checks.items():
    icon = '✅' if v is not None else '❌'
    print(f'  {icon} {k}: {str(v)[:80]}')
" 2>/dev/null
  pass "Dashboard ambassadeur (200)"
else
  fail "Dashboard ambassadeur ($AMB_CODE)"
fi

fi

# Page publique — endpoint corrigé : /ambassador/public
PUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/ambassador/public" 2>/dev/null)
PUB_AMB=$(curl -s "$API/ambassador/public" 2>/dev/null)
PUB_COUNT=$(echo "$PUB_AMB" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d.get('ambassadors',d if isinstance(d,list) else [])
print(len(a))
" 2>/dev/null)
[ "${PUB_COUNT:-0}" -gt 0 ] && pass "Ambassadeurs publics : $PUB_COUNT" || {
  if [ "$PUB_CODE" = "200" ]; then
    warn "Ambassadeurs publics : 0 (show_on_public_page=false ?)"
  else
    fail "Ambassadeurs publics ($PUB_CODE)"
  fi
}

######################################################################
echo ""
echo "════════════════════════════════════════════"
echo "FLUX 7 — SITE PUBLIC"
echo "════════════════════════════════════════════"

for page in index prestations cse ecoles ambassadeurs coffrets apropos equipe faq contact; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/${page}.html" 2>/dev/null)
  [ "$CODE" = "200" ] && pass "Site/${page}.html" || fail "Site/${page}.html ($CODE)"
done

# Catalogue public boutique
BOUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/public/catalog" 2>/dev/null)
BOUT=$(curl -s "$API/public/catalog" 2>/dev/null)
BOUT_COUNT=$(echo "$BOUT" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  a=d if isinstance(d,list) else d.get('products',d.get('data',[]))
  print(len(a))
except: print(0)
" 2>/dev/null)
[ "${BOUT_COUNT:-0}" -gt 0 ] && pass "Catalogue public : $BOUT_COUNT produit(s)" || warn "Catalogue public vide ($BOUT_CODE)"

# Featured
FEAT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/public/featured" 2>/dev/null)
FEAT=$(curl -s "$API/public/featured" 2>/dev/null)
FEAT_COUNT=$(echo "$FEAT" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  a=d if isinstance(d,list) else d.get('data',d.get('products',d.get('featured',[])))
  print(len(a))
except: print(0)
" 2>/dev/null)
[ "${FEAT_COUNT:-0}" -gt 0 ] && pass "Produits vedettes : $FEAT_COUNT" || warn "Produits vedettes 0 ($FEAT_CODE)"

######################################################################
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "RAPPORT FINAL"
echo "════════════════════════════════════════════════════════════════"

read PASS_N FAIL_N WARN_N <<< $(python3 -c "
lines = open('/tmp/recette_results.txt').readlines()
p = sum(1 for l in lines if '✅' in l)
f = sum(1 for l in lines if '❌' in l)
w = sum(1 for l in lines if '⚠' in l and '❌' not in l)
print(p, f, w)
")
TOTAL=$((PASS_N + FAIL_N + WARN_N))
PCT=$(python3 -c "print(round($PASS_N/max($TOTAL,1)*100))" 2>/dev/null)

echo ""
echo "  SCORE : $PASS_N ✅ / $FAIL_N ❌ / $WARN_N ⚠️  ($PCT%)"
echo ""
if [ "$FAIL_N" -gt 0 ]; then
  echo "═══ BLOCAGES ❌ ==="
  grep "❌" /tmp/recette_results.txt
fi
echo ""
if [ "$WARN_N" -gt 0 ]; then
  echo "═══ AVERTISSEMENTS ⚠️ ==="
  grep "⚠️" /tmp/recette_results.txt
fi
