#!/usr/bin/env bash
# =====================================================================
# DEV MENU — ينسخ متغيرات Vercel من الإنتاج لنسخة التجربة (Preview لفرع staging)
# مفاتيح Supabase ما تنسخ: التجربة لها مشروع Supabase خاص (عناوينه العامة مكتوبة تحت).
# يحتاج vercel login بحساب مشروع dev-menu أول.
#   tools/staging-env.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
SCOPE="${VERCEL_SCOPE:-am15}"
STAGING_SUPABASE_URL="https://mftyikgclynjmcufnamw.supabase.co"
STAGING_ANON_KEY="$(grep -o "key: 'eyJ[^']*'" js/api.js | head -1 | cut -d"'" -f2)"

vercel link --yes --project dev-menu --scope "$SCOPE" >/dev/null
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
vercel env pull "$tmp" --environment=production --yes --scope "$SCOPE" >/dev/null

set_var() {   # الاسم والقيمة ← Preview لفرع staging (يستبدل القديم)
  vercel env rm "$1" preview staging --yes --scope "$SCOPE" >/dev/null 2>&1 || true
  printf %s "$2" | vercel env add "$1" preview staging --scope "$SCOPE" >/dev/null
  echo "  ✓ $1"
}

echo "← نسخ متغيرات الإنتاج"
empty=()
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z0-9_]+)=\"?(.*)\"?$ ]] || continue
  name="${BASH_REMATCH[1]}"; val="${line#*=}"; val="${val#\"}"; val="${val%\"}"
  case "$name" in VERCEL*|TURBO*|NX_*|SUPABASE_*) continue ;; esac
  if [ -z "$val" ]; then empty+=("$name"); continue; fi
  set_var "$name" "$val"
done < "$tmp"

echo "← Supabase التجربة"
set_var SUPABASE_URL "$STAGING_SUPABASE_URL"
set_var SUPABASE_ANON_KEY "$STAGING_ANON_KEY"

echo
[ ${#empty[@]} -gt 0 ] && echo "ما قدرنا نقرأ قيمها (محفوظة كسرية في Vercel)، أضفها يدوي: ${empty[*]}"
echo "باقي: SUPABASE_SERVICE_ROLE_KEY حق مشروع التجربة. أضفه بنفسك:"
echo "  vercel env add SUPABASE_SERVICE_ROLE_KEY preview staging --scope $SCOPE"
echo "بعدها: vercel redeploy أو ارفع أي تعديل على staging عشان تنطبق."
