#!/usr/bin/env bash
# List all files which are loaded from other jstest files (we call them "libs"). Excludes overrides.

SEARCH_PATH=${1:-jstests}
TMP_FILE=$(mktemp /tmp/list_libs.XXXXXX)

# find all paths that show up in `load` calls
grep -hro 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH | grep -vE "override|third_party" | cut -c 7- | sort | uniq | sed -e "s|^./||" > $TMP_FILE
# append the search path prefix
sed -i -e "s|^|$(dirname $SEARCH_PATH)/|" $TMP_FILE
sed -i -e "s|(.*)|$(realpath \1)|" $TMP_FILE

cat $TMP_FILE
rm $TMP_FILE
