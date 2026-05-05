#!/bin/bash
# Styli — verify + publish to GitHub (and Vercel auto-deploys from there)
# Double-click this file in Finder when you're ready to go live.

set -e

cd "$(dirname "$0")"

green=$'\033[1;32m'; red=$'\033[1;31m'; blue=$'\033[1;34m'; yellow=$'\033[1;33m'; dim=$'\033[2m'; reset=$'\033[0m'

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

banner "Styli → publish to GitHub + Vercel"

# ─────────────────────────────────────────────────────────────
# Guardrail 1: must be inside a git repo
# ─────────────────────────────────────────────────────────────
if [ ! -d .git ]; then
  echo "${red}✗ This folder doesn't have a git repo. Did you open the right folder?${reset}"
  pause_then_exit 1
fi

# ─────────────────────────────────────────────────────────────
# Guardrail 2: structural sanity checks on index.html
# ─────────────────────────────────────────────────────────────
banner "Checking index.html for obvious breakage"

if [ ! -f index.html ]; then
  echo "${red}✗ index.html is missing!${reset}"
  pause_then_exit 1
fi

OPEN_DIV=$(grep -oE '<div' index.html | wc -l | tr -d ' ')
CLOSE_DIV=$(grep -oE '</div>' index.html | wc -l | tr -d ' ')
echo "  <div> tags:     $OPEN_DIV open / $CLOSE_DIV close"
if [ "$OPEN_DIV" != "$CLOSE_DIV" ]; then
  echo "${red}✗ Mismatched div tags — your HTML is unbalanced ($OPEN_DIV ≠ $CLOSE_DIV). Fix and re-run.${reset}"
  pause_then_exit 1
fi

OPEN_BRACE=$(tr -cd '{' < index.html | wc -c | tr -d ' ')
CLOSE_BRACE=$(tr -cd '}' < index.html | wc -c | tr -d ' ')
echo "  { } braces:     $OPEN_BRACE open / $CLOSE_BRACE close"
if [ "$OPEN_BRACE" != "$CLOSE_BRACE" ]; then
  echo "${red}✗ Mismatched curly braces ($OPEN_BRACE ≠ $CLOSE_BRACE) — likely a JSX syntax error. Fix and re-run.${reset}"
  pause_then_exit 1
fi

OPEN_PAREN=$(tr -cd '(' < index.html | wc -c | tr -d ' ')
CLOSE_PAREN=$(tr -cd ')' < index.html | wc -c | tr -d ' ')
echo "  ( ) parens:     $OPEN_PAREN open / $CLOSE_PAREN close"
if [ "$OPEN_PAREN" != "$CLOSE_PAREN" ]; then
  echo "${red}✗ Mismatched parentheses ($OPEN_PAREN ≠ $CLOSE_PAREN). Fix and re-run.${reset}"
  pause_then_exit 1
fi

# Catch obvious leftover debug / placeholder markers
if grep -qE 'TODO:|FIXME:|console\.log\(' index.html 2>/dev/null; then
  echo "${yellow}⚠ Warning: found TODO / FIXME / console.log in index.html. (Non-blocking, just a heads-up.)${reset}"
fi

echo "${green}✓ index.html structure looks balanced${reset}"

# ─────────────────────────────────────────────────────────────
# Guardrail 3: show the user what's changed
# ─────────────────────────────────────────────────────────────
banner "What's changed since your last push"

CHANGES=$(git status --short)
if [ -z "$CHANGES" ]; then
  # Maybe already committed but not pushed
  UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNPUSHED" -gt "0" ]; then
    echo "${yellow}No new edits, but you have $UNPUSHED commit(s) not yet on GitHub:${reset}"
    git log origin/main..HEAD --oneline
  else
    echo "${green}✓ Everything is already up to date with GitHub. Nothing to publish.${reset}"
    pause_then_exit 0
  fi
else
  echo "$CHANGES"
fi
echo ""

# ─────────────────────────────────────────────────────────────
# Guardrail 4: make the user confirm they've tested locally
# ─────────────────────────────────────────────────────────────
banner "Have you tested locally?"
echo "Before publishing, please confirm:"
echo "  1. You opened ${green}preview.command${reset} and saw the site at http://localhost:8000"
echo "  2. You clicked through the main flows (sign up, browse, cart, etc.)"
echo "  3. You didn't see any error messages or blank screens"
echo ""
read -r -p "Did you test it locally and everything worked? [y/N] " TESTED
if [[ ! "$TESTED" =~ ^[Yy]$ ]]; then
  echo ""
  echo "${yellow}OK — please preview first (double-click preview.command), test it, then come back.${reset}"
  echo "${dim}Nothing has been published.${reset}"
  pause_then_exit 0
fi

# ─────────────────────────────────────────────────────────────
# Commit (if there are uncommitted changes)
# ─────────────────────────────────────────────────────────────
if [ -n "$CHANGES" ]; then
  banner "Commit your changes"
  echo "Write a short message describing what you changed."
  echo "${dim}Examples: \"fix cart bug\"  \"add new product grid\"  \"update hero copy\"${reset}"
  echo ""
  read -r -p "Commit message: " MSG
  if [ -z "$MSG" ]; then
    echo "${red}✗ Empty commit message. Aborting.${reset}"
    pause_then_exit 1
  fi
  git add -A
  git commit -q -m "$MSG"
  echo "${green}✓ Committed.${reset}"
fi

# ─────────────────────────────────────────────────────────────
# Push
# ─────────────────────────────────────────────────────────────
banner "Pushing to GitHub"
echo "${dim}(First time may pop up a macOS login for GitHub — sign in once, it remembers.)${reset}"
echo ""

if git push; then
  REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//')
  echo ""
  echo "${green}✓ Pushed to GitHub: $REPO_URL${reset}"
  echo ""
  echo "${yellow}Vercel is rebuilding now. In ~60 seconds your live site will update.${reset}"
  echo "${yellow}Visit: https://styli-three.vercel.app${reset}"
  echo ""
  echo "${dim}Tip: hard-refresh with ⌘+Shift+R to skip browser cache.${reset}"
else
  echo ""
  echo "${red}✗ Push failed. See the error above.${reset}"
  echo "${yellow}Common reasons: not signed in to GitHub, or no internet.${reset}"
  pause_then_exit 1
fi

pause_then_exit 0
