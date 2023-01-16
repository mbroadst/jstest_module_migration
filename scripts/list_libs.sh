#!/usr/bin/env bash

# List all files which are loaded from other jstest files (we call them "libs")

SEARCH_PATH=${1:-jstests}
grep -ho 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH/**/*.js | cut -c 7- | sort | uniq
