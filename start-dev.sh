#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"
cd "$(dirname "$0")"
exec npm run dev
