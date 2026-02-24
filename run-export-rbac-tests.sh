#!/bin/bash
# Comprehensive CSV/Export and RBAC Test Script
# Tests all export endpoints and RBAC restrictions

BASE_URL="http://localhost:3001/api/v1"

# Get tokens
echo "=== OBTAINING TOKENS ==="

ADMIN_TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login -H "Content-Type: application/json" -d @/root/vins-conversations/test-payload-admin.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Admin token: ${ADMIN_TOKEN:0:20}..."

STUDENT_TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login -H "Content-Type: application/json" -d @/root/vins-conversations/test-payload-student.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Student token: ${STUDENT_TOKEN:0:20}..."

TEACHER_TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login -H "Content-Type: application/json" -d @/root/vins-conversations/test-payload-teacher.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Teacher token: ${TEACHER_TOKEN:0:20}..."

CSE_TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login -H "Content-Type: application/json" -d @/root/vins-conversations/test-payload-cse.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "CSE token: ${CSE_TOKEN:0:20}..."

COMMERCIAL_TOKEN=$(curl -s -X POST ${BASE_URL}/auth/login -H "Content-Type: application/json" -d @/root/vins-conversations/test-payload-commercial.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "Commercial token: ${COMMERCIAL_TOKEN:0:20}..."

PASS=0
FAIL=0
TOTAL=0

check_test() {
  local test_name="$1"
  local condition="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$condition" = "true" ]; then
    echo "  [PASS] $test_name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $test_name"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "========================================"
echo "PART 1: CSV/EXPORT ENDPOINTS (Admin)"
echo "========================================"

# --- 1. Pennylane CSV ---
echo ""
echo "--- 1. Pennylane CSV Export ---"
RESPONSE=$(curl -s -w "\n%{http_code}\n%{content_type}" -o /tmp/pennylane.csv -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${ADMIN_TOKEN}")
HTTP_CODE=$(curl -s -o /tmp/pennylane.csv -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/pennylane.csv)
FIRST_LINE=$(head -1 /tmp/pennylane.csv | tr -d '\xef\xbb\xbf')

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains text/csv" "$(echo "$CONTENT_TYPE" | grep -q 'text/csv' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 10 ] && echo true || echo false)"
check_test "Has expected headers (journal,date,piece,compte,libelle,debit,credit)" "$(echo "$FIRST_LINE" | grep -q 'journal' && echo "$FIRST_LINE" | grep -q 'compte' && echo "$FIRST_LINE" | grep -q 'debit' && echo true || echo false)"
echo "  First line: $FIRST_LINE"
echo "  Body size: ${BODY_SIZE} bytes"

# --- 2. Sales Journal CSV ---
echo ""
echo "--- 2. Sales Journal CSV Export ---"
HTTP_CODE=$(curl -s -o /tmp/sales-journal.csv -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/sales-journal" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/sales-journal" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/sales-journal.csv)
FIRST_LINE=$(head -1 /tmp/sales-journal.csv | tr -d '\xef\xbb\xbf')

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains text/csv" "$(echo "$CONTENT_TYPE" | grep -q 'text/csv' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 10 ] && echo true || echo false)"
check_test "Has expected headers (date,ref,client,total_ht,tva_20,tva_55,total_ttc)" "$(echo "$FIRST_LINE" | grep -q 'date' && echo "$FIRST_LINE" | grep -q 'total_ht' && echo "$FIRST_LINE" | grep -q 'tva_20' && echo true || echo false)"
echo "  First line: $FIRST_LINE"
echo "  Body size: ${BODY_SIZE} bytes"

# --- 3. Commissions CSV ---
echo ""
echo "--- 3. Commissions CSV Export ---"
HTTP_CODE=$(curl -s -o /tmp/commissions.csv -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/commissions" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/commissions" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/commissions.csv)
FIRST_LINE=$(head -1 /tmp/commissions.csv | tr -d '\xef\xbb\xbf')

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains text/csv" "$(echo "$CONTENT_TYPE" | grep -q 'text/csv' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 10 ] && echo true || echo false)"
check_test "Has expected headers (campaign,ca_ht,taux,commission)" "$(echo "$FIRST_LINE" | grep -q 'campaign' && echo "$FIRST_LINE" | grep -q 'commission' && echo true || echo false)"
echo "  First line: $FIRST_LINE"
echo "  Body size: ${BODY_SIZE} bytes"

# --- 4. Stock CSV ---
echo ""
echo "--- 4. Stock CSV Export ---"
HTTP_CODE=$(curl -s -o /tmp/stock.csv -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/stock" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/stock" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/stock.csv)
FIRST_LINE=$(head -1 /tmp/stock.csv | tr -d '\xef\xbb\xbf')

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains text/csv" "$(echo "$CONTENT_TYPE" | grep -q 'text/csv' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 10 ] && echo true || echo false)"
check_test "Has expected headers (product,qty,purchase_price,valorization)" "$(echo "$FIRST_LINE" | grep -q 'product' && echo "$FIRST_LINE" | grep -q 'valorization' && echo true || echo false)"
echo "  First line: $FIRST_LINE"
echo "  Body size: ${BODY_SIZE} bytes"

# --- 5. Delivery Notes PDF ---
echo ""
echo "--- 5. Delivery Notes PDF Export ---"
HTTP_CODE=$(curl -s -o /tmp/delivery-notes.pdf -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/delivery-notes" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/delivery-notes" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/delivery-notes.pdf)

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains application/pdf" "$(echo "$CONTENT_TYPE" | grep -q 'application/pdf' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 100 ] && echo true || echo false)"
echo "  Body size: ${BODY_SIZE} bytes"

# --- 6. Activity Report PDF ---
echo ""
echo "--- 6. Activity Report PDF Export ---"
HTTP_CODE=$(curl -s -o /tmp/activity-report.pdf -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/activity-report" -H "Authorization: Bearer ${ADMIN_TOKEN}")
CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -X GET "${BASE_URL}/admin/exports/activity-report" -H "Authorization: Bearer ${ADMIN_TOKEN}")
BODY_SIZE=$(wc -c < /tmp/activity-report.pdf)

check_test "HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
check_test "Content-Type contains application/pdf" "$(echo "$CONTENT_TYPE" | grep -q 'application/pdf' && echo true || echo false)"
check_test "Body is non-empty (size: ${BODY_SIZE})" "$([ "$BODY_SIZE" -gt 100 ] && echo true || echo false)"
echo "  Body size: ${BODY_SIZE} bytes"

echo ""
echo "========================================"
echo "PART 2: RBAC VERIFICATION"
echo "========================================"

# --- 2.1 Student cannot access admin routes ---
echo ""
echo "--- 2.1 Student CANNOT access admin routes ---"
HTTP_CODE=$(curl -s -o /tmp/rbac-student-admin.json -w "%{http_code}" -X GET "${BASE_URL}/orders/admin/list" -H "Authorization: Bearer ${STUDENT_TOKEN}")
check_test "GET /orders/admin/list returns 403 for student" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"
echo "  Body: $(cat /tmp/rbac-student-admin.json)"

# Student cannot access exports
HTTP_CODE=$(curl -s -o /tmp/rbac-student-export.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${STUDENT_TOKEN}")
check_test "GET /admin/exports/pennylane returns 403 for student" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Student cannot access admin cockpit
HTTP_CODE=$(curl -s -o /tmp/rbac-student-cockpit.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/admin/cockpit" -H "Authorization: Bearer ${STUDENT_TOKEN}")
check_test "GET /dashboard/admin/cockpit returns 403 for student" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# --- 2.2 Teacher cannot access admin routes ---
echo ""
echo "--- 2.2 Teacher CANNOT access admin routes ---"
HTTP_CODE=$(curl -s -o /tmp/rbac-teacher-admin.json -w "%{http_code}" -X GET "${BASE_URL}/orders/admin/list" -H "Authorization: Bearer ${TEACHER_TOKEN}")
check_test "GET /orders/admin/list returns 403 for teacher" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"
echo "  Body: $(cat /tmp/rbac-teacher-admin.json)"

# Teacher cannot access exports
HTTP_CODE=$(curl -s -o /tmp/rbac-teacher-export.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${TEACHER_TOKEN}")
check_test "GET /admin/exports/pennylane returns 403 for teacher" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Teacher cannot access admin cockpit
HTTP_CODE=$(curl -s -o /tmp/rbac-teacher-cockpit.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/admin/cockpit" -H "Authorization: Bearer ${TEACHER_TOKEN}")
check_test "GET /dashboard/admin/cockpit returns 403 for teacher" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# --- 2.3 Teacher dashboard contains NO monetary amounts ---
echo ""
echo "--- 2.3 Teacher dashboard must NOT contain monetary amounts ---"
CAMPAIGN_ID="7a7a8a6e-1a88-4530-bdf7-2807bbe607d6"
HTTP_CODE=$(curl -s -o /tmp/teacher-dashboard.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/teacher?campaign_id=${CAMPAIGN_ID}" -H "Authorization: Bearer ${TEACHER_TOKEN}")
TEACHER_BODY=$(cat /tmp/teacher-dashboard.json)

check_test "Teacher dashboard returns HTTP 200" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Check for monetary fields
HAS_EURO=$(echo "$TEACHER_BODY" | grep -c '€' || true)
HAS_TOTAL_TTC=$(echo "$TEACHER_BODY" | grep -c '"total_ttc"' || true)
HAS_TOTAL_HT=$(echo "$TEACHER_BODY" | grep -c '"total_ht"' || true)
HAS_REVENUE=$(echo "$TEACHER_BODY" | grep -c '"revenue"' || true)
HAS_CA=$(echo "$TEACHER_BODY" | grep -ci '"ca"' || true)
HAS_CA_TTC=$(echo "$TEACHER_BODY" | grep -c '"ca_ttc"' || true)
HAS_CA_HT=$(echo "$TEACHER_BODY" | grep -c '"ca_ht"' || true)
HAS_MARGE=$(echo "$TEACHER_BODY" | grep -c '"marge"' || true)
HAS_COMMISSION=$(echo "$TEACHER_BODY" | grep -c '"commission"' || true)

check_test "No euro symbol in teacher dashboard" "$([ "$HAS_EURO" = "0" ] && echo true || echo false)"
check_test "No total_ttc in teacher dashboard" "$([ "$HAS_TOTAL_TTC" = "0" ] && echo true || echo false)"
check_test "No total_ht in teacher dashboard" "$([ "$HAS_TOTAL_HT" = "0" ] && echo true || echo false)"
check_test "No revenue in teacher dashboard" "$([ "$HAS_REVENUE" = "0" ] && echo true || echo false)"
check_test "No ca_ttc in teacher dashboard" "$([ "$HAS_CA_TTC" = "0" ] && echo true || echo false)"
check_test "No ca_ht in teacher dashboard" "$([ "$HAS_CA_HT" = "0" ] && echo true || echo false)"
check_test "No marge in teacher dashboard" "$([ "$HAS_MARGE" = "0" ] && echo true || echo false)"
check_test "No commission in teacher dashboard" "$([ "$HAS_COMMISSION" = "0" ] && echo true || echo false)"

echo "  Teacher dashboard keys: $(echo "$TEACHER_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null || echo 'parse error')"

# --- 2.4 Student can access their own dashboard ---
echo ""
echo "--- 2.4 Student CAN access their own dashboard ---"
HTTP_CODE=$(curl -s -o /tmp/student-dashboard.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/student?campaign_id=${CAMPAIGN_ID}" -H "Authorization: Bearer ${STUDENT_TOKEN}")
check_test "GET /dashboard/student returns 200 for student" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"
STUDENT_KEYS=$(cat /tmp/student-dashboard.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null || echo 'parse error')
echo "  Student dashboard keys: $STUDENT_KEYS"

# --- 2.5 CSE can access their own dashboard ---
echo ""
echo "--- 2.5 CSE CAN access their own dashboard ---"
CSE_CAMPAIGN_ID="a4f066ed-0292-4653-8d57-2a15c791a333"
HTTP_CODE=$(curl -s -o /tmp/cse-dashboard.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/cse?campaign_id=${CSE_CAMPAIGN_ID}" -H "Authorization: Bearer ${CSE_TOKEN}")
check_test "GET /dashboard/cse returns 200 for CSE" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"
CSE_KEYS=$(cat /tmp/cse-dashboard.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))" 2>/dev/null || echo 'parse error')
echo "  CSE dashboard keys: $CSE_KEYS"

# --- 2.6 Commercial CAN access admin routes ---
echo ""
echo "--- 2.6 Commercial CAN access admin routes ---"
HTTP_CODE=$(curl -s -o /tmp/commercial-admin.json -w "%{http_code}" -X GET "${BASE_URL}/orders/admin/list" -H "Authorization: Bearer ${COMMERCIAL_TOKEN}")
check_test "GET /orders/admin/list returns 200 for commercial" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Commercial can access admin cockpit
HTTP_CODE=$(curl -s -o /tmp/commercial-cockpit.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/admin/cockpit" -H "Authorization: Bearer ${COMMERCIAL_TOKEN}")
check_test "GET /dashboard/admin/cockpit returns 200 for commercial" "$([ "$HTTP_CODE" = "200" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Commercial CANNOT access super_admin-only export routes
HTTP_CODE=$(curl -s -o /tmp/commercial-export.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${COMMERCIAL_TOKEN}")
check_test "GET /admin/exports/pennylane returns 403 for commercial (super_admin/comptable only)" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"
echo "  Body: $(cat /tmp/commercial-export.json)"

HTTP_CODE=$(curl -s -o /tmp/commercial-stock-export.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/stock" -H "Authorization: Bearer ${COMMERCIAL_TOKEN}")
check_test "GET /admin/exports/stock returns 403 for commercial" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# --- Additional RBAC tests ---
echo ""
echo "--- Additional RBAC Checks ---"

# CSE cannot access admin routes
HTTP_CODE=$(curl -s -o /tmp/rbac-cse-admin.json -w "%{http_code}" -X GET "${BASE_URL}/orders/admin/list" -H "Authorization: Bearer ${CSE_TOKEN}")
check_test "GET /orders/admin/list returns 403 for CSE" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# CSE cannot access exports
HTTP_CODE=$(curl -s -o /tmp/rbac-cse-export.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane" -H "Authorization: Bearer ${CSE_TOKEN}")
check_test "GET /admin/exports/pennylane returns 403 for CSE" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# No token at all -> 401
HTTP_CODE=$(curl -s -o /tmp/rbac-notoken.json -w "%{http_code}" -X GET "${BASE_URL}/admin/exports/pennylane")
check_test "GET /admin/exports/pennylane returns 401 with no token" "$([ "$HTTP_CODE" = "401" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Student cannot access teacher dashboard
HTTP_CODE=$(curl -s -o /tmp/rbac-student-teacher.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/teacher?campaign_id=${CAMPAIGN_ID}" -H "Authorization: Bearer ${STUDENT_TOKEN}")
check_test "GET /dashboard/teacher returns 403 for student" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

# Teacher cannot access student dashboard
HTTP_CODE=$(curl -s -o /tmp/rbac-teacher-student.json -w "%{http_code}" -X GET "${BASE_URL}/dashboard/student?campaign_id=${CAMPAIGN_ID}" -H "Authorization: Bearer ${TEACHER_TOKEN}")
check_test "GET /dashboard/student returns 403 for teacher" "$([ "$HTTP_CODE" = "403" ] && echo true || echo false)"
echo "  HTTP code: $HTTP_CODE"

echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"
echo "Total: $TOTAL  |  Passed: $PASS  |  Failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "SOME TESTS FAILED"
fi
echo "========================================"
