#!/usr/bin/env bash
# List all files which are not libs (are not loaded by other test files). Excludes overrides.

# set -x

SEARCH_PATH=${1:-jstests}
TMP_FILE=$(mktemp /tmp/list_tests.XXXXXX)

# find all paths that are used in `load` statements, and save to a file
grep -hro 'load('"'"'[^'"'"']*\|load("[^"]*' $SEARCH_PATH | cut -c 7- | sort | uniq | sed -e "s|^./||" > $TMP_FILE

# add well-known libs paths
find $SEARCH_PATH -type d -name "*libs*" | sed -e "s|^$SEARCH_PATH|jstests|" >> $TMP_FILE
cat <<EOT >> $TMP_FILE
fsm
jstests/third_party
EOT

# find all files with a "js" extension that do not appear in the list of `load`ed files
find $SEARCH_PATH -type f -name "*.js" $(printf "! -path *%s* " $(cat $TMP_FILE))

rm $TMP_FILE
