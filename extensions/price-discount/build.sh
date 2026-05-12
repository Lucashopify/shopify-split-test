#!/bin/sh
set -e
mkdir -p dist
/opt/homebrew/Cellar/shopify-cli/3.91.1/libexec/lib/node_modules/@shopify/cli/bin/javy-7.0.1 build \
  -C dynamic \
  -C plugin=/opt/homebrew/Cellar/shopify-cli/3.91.1/libexec/lib/node_modules/@shopify/cli/bin/shopify_functions_javy_v3.wasm \
  -o dist/function.wasm \
  src/index.js
