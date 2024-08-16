const recast = require('recast');

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    const body = source.get().node.program.body;

    let hasReplSetTest = false;
    let hasShardingTest = false;
    let hasThread = false;
    let lastImportDeclaration = null;
    let firstCommentBlock = null;
    let firstCommentLines = [];
    let importedFiles = new Set();

    recast.visit(source, {
        visitNewExpression: function (expr) {
            const typeName = expr.value.callee.name;
            if (typeName === 'ReplSetTest') {
                hasReplSetTest = true;
            } else if (typeName === 'ShardingTest') {
                hasShardingTest = true;
            } else if (typeName === 'Thread') {
                hasThread = true;
            }

            this.traverse(expr);
        },
        visitImportDeclaration: function (decl) {
            lastImportDeclaration = decl;
            importedFiles.add(decl.value.source.value);
            this.traverse(decl);
        },
        visitComment: function (comment) {
            this.traverse(comment);
        },
        visitCommentLine: function (line) {
            if (line.value.start === 0) {
                firstCommentLines.push(line);
            } else if (
                firstCommentLines.length > 0 &&
                line.value.start === firstCommentLines[firstCommentLines.length - 1].value.end + 1) {
                firstCommentLines.push(line);
            }
            this.traverse(line);
        },
        visitCommentBlock: function (block) {
            if (block.value.start === 0) {
                firstCommentBlock = block;
            }
            this.traverse(block);
        }
    });

    let newImports = [];
    if (hasShardingTest) {
        newImports.push(j.importDeclaration(
            [j.importSpecifier(j.identifier("ShardingTest"))],
            j.literal("src/mongo/shell/shardingtest.js")));
    }
    if (hasReplSetTest) {
        newImports.push(j.importDeclaration(
            [j.importSpecifier(j.identifier("ReplSetTest"))],
            j.literal("src/mongo/shell/replsettest.js")));
    }
    if (hasThread) {
        newImports.push(j.importDeclaration(
            [j.importSpecifier(j.identifier("Thread"))],
            j.literal("jstests/libs/parallelTester.js")));
    }

    if (newImports.length === 0) {
        // Skip it!
        return false;
    }

    newImports = newImports.filter(i => !importedFiles.has(i.source.value));

    if (lastImportDeclaration) {
        for (let newImport of newImports) {
            lastImportDeclaration.insertAfter(newImport);
        }
    } else {
        if (firstCommentBlock) {
            const firstNewImport = newImports.shift();
            firstNewImport.comments = [firstCommentBlock.value];
            for (let newImport of newImports) {
                body.unshift(newImport);
            }
            body.unshift(firstNewImport);

            // remove the original comment
            j(firstCommentBlock).remove();
        } else if (firstCommentLines.length > 0) {
            const firstNewImport = newImports.shift();
            firstNewImport.comments = firstCommentLines.map(line => line.value);
            for (let newImport of newImports) {
                body.unshift(newImport);
            }
            body.unshift(firstNewImport);

            // remove the original comments
            for (let line of firstCommentLines) {
                j(line).remove();
            }
        } else {
            for (let newImport of newImports) {
                body.unshift(newImport);
            }
        }
    }

    // console.dir(source.toSource());
    return source.toSource();
}
