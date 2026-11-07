#!/usr/bin/env bash
# Build the board and publish dist/ to the gh-pages branch (GitHub Pages).
# Usage: ./deploy.sh [--force]    (--force deploys even with uncommitted changes)
set -euo pipefail
cd "$(dirname "$0")"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

die() { echo "✗ $*" >&2; exit 1; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not a git repository. Run: git init && git remote add origin <url>"
git remote get-url origin >/dev/null 2>&1 || die "No 'origin' remote. Add your GitHub repo: git remote add origin <url>"

# 1. Clean working tree (unless --force)
if [[ $FORCE -eq 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
  die "Uncommitted changes. Commit them or run ./deploy.sh --force"
fi

# 2. Supabase env vars present and non-empty
has_var() { grep -hqE "^$1=.+" .env .env.production 2>/dev/null; }
has_var VITE_SUPABASE_URL && has_var VITE_SUPABASE_ANON_KEY \
  || die "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env (or .env.production)"

# 3. Install, validate config, build
npm ci
npm run validate:config || die "Config validation failed — deploy aborted"
npm run build

# 4. GitHub Pages extras
touch dist/.nojekyll
cp dist/index.html dist/404.html

# 5. Publish
rev=$(git rev-parse --short HEAD 2>/dev/null || echo "uncommitted")
npx gh-pages -d dist -t -m "deploy: ${rev}"

# 6. Live URL
origin=$(git remote get-url origin)
repo=$(basename -s .git "$origin")
user=$(sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#' <<<"$origin")
echo "✓ Deployed: https://${user}.github.io/${repo}/"
echo "  (first deploy? GitHub → Settings → Pages → Source: branch gh-pages, folder / (root))"
