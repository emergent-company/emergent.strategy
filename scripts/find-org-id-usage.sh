#!/bin/bash
# Script to find all code that needs updating after schema standardization
# Run from project root: bash scripts/find-org-id-usage.sh

echo "🔍 Searching for org_id usage in codebase..."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 SERVICE FILES (*.service.ts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "org_id" apps/server-nest/src/**/*.service.ts 2>/dev/null | grep -v "organization_id" || echo "✅ No org_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 DTO FILES (*.dto.ts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "org_id" apps/server-nest/src/**/*.dto.ts 2>/dev/null | grep -v "organization_id" || echo "✅ No org_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST FILES (*.spec.ts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "org_id" apps/server-nest/src/**/*.spec.ts apps/server-nest/test/**/*.spec.ts 2>/dev/null | grep -v "organization_id" || echo "✅ No org_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 CONTROLLER FILES (*.controller.ts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "org_id" apps/server-nest/src/**/*.controller.ts 2>/dev/null | grep -v "organization_id" || echo "✅ No org_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗂️  ENTITY/MODEL FILES (*.entity.ts, *.model.ts)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "org_id" apps/server-nest/src/**/*.entity.ts apps/server-nest/src/**/*.model.ts 2>/dev/null | grep -v "organization_id" || echo "✅ No org_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 TENANT_ID USAGE (should be zero)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep -rn "tenant_id" apps/server-nest/src/**/*.ts 2>/dev/null || echo "✅ No tenant_id usage found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔢 Total org_id occurrences:"
grep -r "org_id" apps/server-nest/src/**/*.ts 2>/dev/null | grep -v "organization_id" | wc -l | xargs echo
echo ""
echo "🔢 Total tenant_id occurrences:"
grep -r "tenant_id" apps/server-nest/src/**/*.ts 2>/dev/null | wc -l | xargs echo
echo ""
echo "⚠️  NOTE: Ignore occurrences in:"
echo "   - invites (intentionally uses org_id)"
echo "   - organization_memberships (intentionally uses org_id)"
echo ""
echo "✅ All other occurrences should be changed to organization_id"
