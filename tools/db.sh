#!/usr/bin/env bash
# =====================================================================
# DEV MENU — قاعدة بيانات التجربة (staging) والحقيقية
#
#   tools/db.sh setup-staging        ينسخ هيكل الجداول (بدون بيانات العملاء) من الحقيقية للتجربة
#   tools/db.sh staging <file.sql>   يشغّل ملف تعديل على التجربة
#   tools/db.sh prod <file.sql>      يشغّل نفس الملف على الحقيقية (بعد ما تتأكد منه في التجربة)
#
# روابط الاتصال تنقرأ من .env.db (ما ينرفع لـ GitHub)، أو يسألك عنها:
#   PROD_DB_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
#   STAGING_DB_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
# تلقاها في Supabase ← Connect ← Session pooler.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.db ] && set -a && . ./.env.db && set +a
# أدوات PostgreSQL 17 (قاعدة Supabase نسختها 15 وفوق، والأقدم ما تقدر تنسخها): brew install postgresql@17
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

ask() { local v="$1"; if [ -z "${!v:-}" ]; then read -r -s -p "$2: " "$v"; echo; export "$v"; fi; }

case "${1:-}" in
  setup-staging)
    ask PROD_DB_URL "رابط قاعدة الحقيقية (PROD_DB_URL)"
    ask STAGING_DB_URL "رابط قاعدة التجربة (STAGING_DB_URL)"
    out="$(mktemp -d)/schema.sql"
    echo "← نسخ هيكل public من الحقيقية (بدون بيانات)"
    pg_dump "$PROD_DB_URL" --schema-only --schema=public --no-owner --no-comments -f "$out"
    # الهيكل ينشأ من جديد في التجربة (schema public موجود أصلاً)
    sed -i '' -e '/^CREATE SCHEMA public;/d' -e '/^ALTER SCHEMA public OWNER/d' "$out"
    echo "← تطبيقه على التجربة"
    psql "$STAGING_DB_URL" -v ON_ERROR_STOP=0 -q -f "$out" 2>&1 | grep -v "already exists" || true
    echo "← مخزن الصور وإعدادات الخادم"
    psql "$STAGING_DB_URL" -q <<'SQL'
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true) on conflict (id) do nothing;
notify pgrst, 'reload schema';
SQL
    echo "تم. الجداول في التجربة:"
    psql "$STAGING_DB_URL" -At -c "select count(*) from information_schema.tables where table_schema='public'"
    ;;
  staging|prod)
    [ -f "${2:-}" ] || { echo "اكتب مسار ملف SQL"; exit 1; }
    if [ "$1" = prod ]; then
      ask PROD_DB_URL "رابط قاعدة الحقيقية (PROD_DB_URL)"; url="$PROD_DB_URL"
      read -r -p "تشغيل $2 على القاعدة الحقيقية؟ اكتب yes: " ok; [ "$ok" = yes ] || exit 1
    else
      ask STAGING_DB_URL "رابط قاعدة التجربة (STAGING_DB_URL)"; url="$STAGING_DB_URL"
    fi
    psql "$url" -v ON_ERROR_STOP=1 -f "$2"
    ;;
  *) sed -n '3,14p' "$0" ;;
esac
