#!/bin/bash
# Styli → GitHub + Vercel one-click deploy
# Just double-click this file in Finder. You may have to right-click → Open the first time.

set -e

green=$'\033[1;32m'; red=$'\033[1;31m'; blue=$'\033[1;34m'; yellow=$'\033[1;33m'; reset=$'\033[0m'

banner() {
  echo ""
  echo "${blue}────────────────────────────────────────────────────────${reset}"
  echo "${blue}  $1${reset}"
  echo "${blue}────────────────────────────────────────────────────────${reset}"
}

pause_then_exit() {
  echo ""
  echo "${yellow}(Press any key to close this window.)${reset}"
  read -n 1 -s -r
  exit "${1:-0}"
}

# Run from the folder this script lives in (= the Styli folder)
cd "$(dirname "$0")"

banner "Styli → GitHub + Vercel deploy"
echo "Working folder: $(pwd)"

# ─────────────────────────────────────────────────────────────
# Step 1: Verify GitHub CLI is installed and logged in
# ─────────────────────────────────────────────────────────────
banner "Step 1 of 3 — Checking GitHub CLI"

if ! command -v gh >/dev/null 2>&1; then
  echo "${red}✗ GitHub CLI (gh) is not installed.${reset}"
  echo ""
  echo "Install it with Homebrew by pasting this into Terminal:"
  echo "    brew install gh"
  echo "Or download from: https://cli.github.com"
  echo "Then re-run this script."
  pause_then_exit 1
fi
echo "${green}✓ gh is installed${reset}"

if ! gh auth status >/dev/null 2>&1; then
  echo "${yellow}You're not logged into GitHub yet. Opening login…${reset}"
  gh auth login
fi
echo "${green}✓ gh is logged in as: $(gh api user --jq .login)${reset}"

# ─────────────────────────────────────────────────────────────
# Step 2: Create the GitHub repo and push
# ─────────────────────────────────────────────────────────────
banner "Step 2 of 3 — Creating GitHub repo and pushing code"

# Make sure git is initialized and there's at least one commit
if [ ! -d .git ]; then
  git init -q -b main
fi
if ! git log -1 >/dev/null 2>&1; then
  git add -A
  git -c user.email="aditya.neo2007@gmail.com" -c user.name="Aditya Bhardwaj" \
      commit -q -m "Initial commit: Styli platform prototype"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "${yellow}Remote 'origin' already exists — pushing latest changes…${reset}"
  git push -u origin main
else
  GH_USER=$(gh api user --jq .login)
  REPO_NAME="styli"

  # If the user already has a repo named 'styli', try styli-platform instead
  if gh repo view "$GH_USER/$REPO_NAME" >/dev/null 2>&1; then
    echo "${yellow}You already have a repo called '$REPO_NAME' — using 'styli-platform' instead.${reset}"
    REPO_NAME="styli-platform"
  fi

  echo "Creating public repo: $GH_USER/$REPO_NAME"
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push \
    --description "Styli — AI fashion marketplace prototype"
fi

REPO_URL=$(gh repo view --json url -q .url)
echo "${green}✓ Code is on GitHub: $REPO_URL${reset}"

# ─────────────────────────────────────────────────────────────
# Step 3: Deploy to Vercel
# ─────────────────────────────────────────────────────────────
banner "Step 3 of 3 — Deploying to Vercel"

if ! command -v npx >/dev/null 2>&1; then
  echo "${red}✗ Node.js / npm is not installed (needed to run Vercel).${reset}"
  echo ""
  echo "${yellow}Good news: your code is already safely pushed to GitHub.${reset}"
  echo "To finish the Vercel deploy without Terminal, go to https://vercel.com,"
  echo "sign up with GitHub, click 'Add New → Project', pick '$REPO_URL',"
  echo "and click Deploy. Takes about a minute."
  echo ""
  echo "Or install Node from https://nodejs.org (pick the LTS button),"
  echo "then re-run this script — it will pick up from this step."
  pause_then_exit 1
fi
echo "${green}✓ Node/npm detected${reset}"

echo ""
echo "${yellow}About to run Vercel. What to expect:${reset}"
echo "  • If this is your first time using Vercel, it'll open a browser to log you in."
echo "    Pick 'Continue with GitHub' — same account as above."
echo "  • It'll then ask a few setup questions. Just press ${green}Enter${reset} to accept each default."
echo ""
echo "Press Enter to continue…"
read -r _

# --yes auto-accepts setup prompts after login
npx --yes vercel@latest --prod --yes

banner "All done! 🎉"
echo "${green}GitHub: $REPO_URL${reset}"
echo "${green}Vercel: Your live URL is shown above (ends in .vercel.app)${reset}"
echo ""
echo "From now on, every time you update the code and push to GitHub,"
echo "Vercel will auto-deploy within a minute."
pause_then_exit 0
