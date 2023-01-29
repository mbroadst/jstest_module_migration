#!/usr/bin/env bash

# List all files which are not libs (are not loaded by other test files). Excludes overrides.

SEARCH_PATH=${1:-jstests}
TMP_FILE=$(mktemp /tmp/list_tests.XXXXXX)

# find all paths that are used in `load` statements, and save to a file
grep -ho 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH/**/*.js | grep -ve "override" | cut -c 7- | sort | uniq > $TMP_FILE
# find all files with a "js" extension that do not appear in the list of `load`ed files
find $SEARCH_PATH -name "*.js" | grep -vFxf $TMP_FILE

rm $TMP_FILE
