#!/bin/bash
# Styli — local preview server
# Double-click this file in Finder to start the dev server.
# Press Ctrl+C (or close the window) to stop.

cd "$(dirname "$0")"

PORT=8000
URL="http://localhost:$PORT/"

green=$'\033[1;32m'; blue=$'\033[1;34m'; yellow=$'\033[1;33m'; reset=$'\033[0m'

echo ""
echo "${blue}────────────────────────────────────────────────────────${reset}"
echo "${blue}  Styli — local preview${reset}"
echo "${blue}────────────────────────────────────────────────────────${reset}"
echo ""
echo "Serving:  ${green}$(pwd)${reset}"
echo "URL:      ${green}$URL${reset}"
echo ""

# Open the URL in the default browser after a short delay
( sleep 1 && open "$URL" ) &

echo "${yellow}When you edit and save files, just refresh the browser (⌘+R) to see changes.${reset}"
echo "${yellow}Press Ctrl+C to stop the server and close this window.${reset}"
echo ""

# Python 3 comes preinstalled on macOS
python3 -m http.server "$PORT"
