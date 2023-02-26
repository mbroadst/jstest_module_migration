const path = require('path');
const { readFileSync } = require('fs');

function isLoadCallExpression(path) {
    const expr = path.value.expression;
    return expr.callee && expr.callee.name && expr.callee.name === 'load';
}

function isExported(path) {
    const node = path.value;
    return node.type === 'ExportNamedDeclaration';
}

function getExportedIdentifiers(j, basePath, loadPath) {
    const source = readFileSync(path.resolve(basePath, loadPath)).toString();

    const result = [];
    j(source)
        .find(j.Node)
        .filter(isExported)
        .forEach(p => {
            const decl = p.value.declaration;
            if (decl.type === 'VariableDeclaration') {
                const varDecl = decl.declarations[0];
                if (varDecl.id.type === 'ObjectPattern') {
                    const objectPattern = varDecl.id;
                    objectPattern.properties.forEach(prop => {
                        result.push(prop.key.name);
                    });
                } else {
                    result.push(varDecl.id.name);
                }
            } else {
                result.push(decl.id.name);
            }
        });

    return result;
}

function findExportsUsedInThisScript(j, file, exported) {
    const source = file.source;
    return exported.filter(identifier => {
        return source.indexOf(identifier) !== -1;
    })
}

function findBasePath(loadPath) {
    if (path.basename(loadPath) === 'jstests') {
        return path.resolve(path.dirname(loadPath));
    }

    return findBasePath(path.dirname(loadPath));
}

function isInGlobalScope(node) {
    return node.scope.isGlobal;
}

function makeImportAllAsSpecifier(j, stmt, importSpecifier, loadSpecifier) {
    if (!isInGlobalScope(stmt)) {
        return stmt;
    }

    // import * as NAME from '...';
    return j.importDeclaration([
        j.importNamespaceSpecifier(j.identifier(importSpecifier))
    ], j.literal(loadSpecifier));

    // const NAME = await import(...);
    // return j.variableDeclaration("const", [
    //     j.variableDeclarator(
    //         j.identifier(importSpecifier),
    //         j.awaitExpression(
    //             j.callExpression(b.identifier("import"), [j.literal(loadSpecifier)])
    //         )
    //     )
    // ]);
}

function makeImportSome(j, stmt, importedSpecifiers, loadSpecifier) {
    if (!isInGlobalScope(stmt)) {
        return stmt;
    }

    const specifiers = importedSpecifiers.map(name => j.importSpecifier(j.identifier(name)));
    return j.importDeclaration(specifiers, j.literal(loadSpecifier));

    // const {some...} = await import(...);
    // const objectPattern = j.objectPattern(
    //     importedSpecifiers.map(specifier => {
    //         const property = j.property("init", j.identifier(specifier), j.identifier(specifier));
    //         property.shorthand = true;
    //         return property;
    //     })
    // );

    // return j.variableDeclaration("const", [
    //     j.variableDeclarator(
    //         objectPattern,
    //         j.awaitExpression(
    //             j.callExpression(j.identifier("import"), [j.literal(loadSpecifier)])
    //         )
    //     )
    // ]);
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    const basePath = findBasePath(file.path);

    // Find all "load" calls and replace with import declarations
    source
        .find(j.ExpressionStatement)
        .filter(isLoadCallExpression)
        .replaceWith(stmt => {
            const node = stmt.value;
            const loadSpecifierArg = node.expression.arguments[0];
            if (loadSpecifierArg.type !== 'Literal') {
                return node;
            }

            const loadSpecifier = loadSpecifierArg.value;
            const exported = getExportedIdentifiers(j, basePath, loadSpecifier);
            if (exported.length === 0) {
                return node;
            }

            // Preserve leading comments when replacing nodes
            let leadingComments;
            if (node.leadingComments) {
                const lastComment =
                    node.leadingComments[node.leadingComments.length - 1];
                if (lastComment.leading) {
                    leadingComments = node.leadingComments;
                }
            }

            const imported = findExportsUsedInThisScript(j, file, exported);
            if (imported.length === 0) {
                // We've detected an import which isn't used, remove it.

                // Re-add any leading comments before removing the node
                if (leadingComments) {
                    const comments = source.get().node.comments;
                    if (comments && Array.isArray(comments)) {
                        comments.push(...leadingComments);
                    } else {
                        source.get().node.comments = leadingComments;
                    }
                }

                return null;
            }

            // If we only have one export, then import using a namespace specifier
            // replace with: import * as NAME from '...'; with name of exported
            const decl = (exported.length === 1) ?
                makeImportAllAsSpecifier(j, stmt, exported[0], loadSpecifier) :
                makeImportSome(j, stmt, imported, loadSpecifier);

            if (leadingComments) {
                decl.comments = leadingComments;
            }

            return decl;
        });

    // console.dir(source.toSource());
    return source.toSource();
}
