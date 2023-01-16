#!/usr/bin/env bash

# List all files which are not libs (are not loaded by other test files)

SEARCH_PATH=${1:-jstests}
TMP_FILE=$(mktemp /tmp/abc-script.XXXXXX)

grep -ho 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH/**/*.js | cut -c 7- | sort | uniq > $TMP_FILE
find $SEARCH_PATH -name "*.js" | grep -vFxf $TMP_FILE
rm $TMP_FILE
