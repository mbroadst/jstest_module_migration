#!/usr/bin/env bash

# List all files which are loaded from other jstest files (we call them "libs"). Excludes overrides.

SEARCH_PATH=${1:-jstests}
TMP_FILE=$(mktemp /tmp/list_libs.XXXXXX)

# find all paths that show up in `load` calls
grep -ho 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH/**/*.js | grep -ve "override" | cut -c 7- | sort | uniq > $TMP_FILE
# append the search path prefix
sed -i -e "s|^|$(dirname $SEARCH_PATH)/|" $TMP_FILE
sed -i -e "s|(.*)|$(realpath \1)|" $TMP_FILE

cat $TMP_FILE
rm $TMP_FILE
