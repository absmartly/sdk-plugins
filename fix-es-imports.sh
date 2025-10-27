#!/bin/bash

# Fix all ES module imports to include .js extensions
find es -name "*.js" -type f -exec sed -i '' \
  -e "s|from '\./\([^']*\)';|from './\1.js';|g" \
  -e "s|from \"\./\([^\"]*\)\";|from \"./\1.js\";|g" \
  -e "s|export \* from '\./\([^']*\)';|export * from './\1.js';|g" \
  -e "s|export \* from \"\./\([^\"]*\)\";|export * from \"./\1.js\";|g" \
  -e "s|\.js\.js|.js|g" \
  {} \;

echo "Fixed all ES module imports"
