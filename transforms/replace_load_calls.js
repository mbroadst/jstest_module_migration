const path = require('path');
const recast = require('recast');
const { readFileSync } = require('fs');

// These are "libs" which actually extend behavior, and thus should probably be marked "override"
const ETC_OVERRIDES = new Set([
    'jstests/multiVersion/libs/multi_rs.js',
    'jstests/multiVersion/libs/multi_cluster.js',
    'jstests/multiVersion/libs/verify_versions.js',

    // enterprise stuff
    'src/mongo/db/modules/enterprise/jstests/hot_backups/backup_restore_backup_cursor.js'
]);

function isLoadForOverride(importSpecifier) {
    if (importSpecifier.indexOf('override') !== -1) {
        return true;
    }

    for (let override of ETC_OVERRIDES) {
        if (importSpecifier.indexOf(override) !== -1) {
            return true;
        }
    }

    return false;
}

function isLoadCallExpression(path) {
    const expr = path.value.expression;
    const isLoadExpr = expr.callee && expr.callee.name && expr.callee.name === 'load';

    if (isLoadExpr) {
        const args = expr.arguments;
        // Only convert load calls which have a single literal string input
        if (!args || args.length < 1 || args[0].type !== 'Literal') {
            return false;
        }

        // target specific load calls
        // if (!args[0].value.match(/two_phase_drops/)) {
        //     return false;
        // }

        return true;
    }

    return false;
}

function isExported(path) {
    const node = path.value;
    return node.type === 'ExportNamedDeclaration';
}

function getExportedIdentifiers(j, basePath, loadPath) {
    if (basePath.endsWith('src/mongo/db/modules/enterprise')) {
        basePath = basePath.replace('src/mongo/db/modules/enterprise', '');
    }

    const source = readFileSync(path.resolve(basePath, loadPath)).toString();

    const result = [];
    j(source)
        .find(j.Node)
        .filter(isExported)
        .forEach(p => {
            const decl = p.value.declaration;
            if (decl.type === 'VariableDeclaration') {
                decl.declarations.forEach(varDecl => {
                    if (varDecl.id.type === 'ObjectPattern') {
                        const objectPattern = varDecl.id;
                        objectPattern.properties.forEach(prop => {
                            result.push(prop.key.name);
                        });
                    } else {
                        result.push(varDecl.id.name);
                    }
                });
            } else {
                result.push(decl.id.name);
            }
        });

    return result;
}

function findExportsUsedInThisScript(j, file, exported) {
    const excludeIdentifiers = new Set();
    const localIdentifiers = new Set();

    const source = j(file.source);
    recast.visit(source, {
        visitIdentifier: function (path) {
            const parentType = path.parentPath.value.type;
            if (parentType === 'FunctionDeclaration' || (parentType === 'VariableDeclarator' && path.name === 'id')) {
                // One of:
                //   - function possibleImport() {}
                //   - var possibleImport = ...
                excludeIdentifiers.add(path.value.name);
            } else if (parentType === 'Property' ||
                (parentType === 'MemberExpression' && path.name === 'property')) {
                // Don't do anything here, this isn't a hint for what we should do with the import.
            } else {
                localIdentifiers.add(path.value.name);
            }

            return true;
        }
    });

    return exported.filter(identifier =>
        !excludeIdentifiers.has(identifier) && localIdentifiers.has(identifier));
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

function isChildOfRootExport(j, stmt) {
    // If we are in a block statement:
    if (stmt.parentPath && Array.isArray(stmt.parentPath.value) &&
        stmt.parentPath.parentPath && stmt.parentPath.parentPath.value.type === 'BlockStatement') {
        const blockStmt = stmt.parentPath.parentPath;

        if (
            blockStmt.parentPath && (
                blockStmt.parentPath.value.type === 'FunctionExpression' ||
                blockStmt.parentPath.value.type === 'ArrowFunctionExpression'
            )) {
            const fnExpr = blockStmt.parentPath;

            // (function() {
            //     load("jstests/replsets/rslib.js");
            // })();
            if (fnExpr.parentPath && fnExpr.parentPath.value.type === 'CallExpression' &&
                isInGlobalScope(fnExpr.parentPath)) {
                return true;
            }

            // export var test = function() {
            //    load("jstests/libs/killed_session_util.js");
            // }
            if (fnExpr.parentPath && fnExpr.parentPath.value.type === 'VariableDeclarator' &&
                fnExpr.parentPath.parentPath && fnExpr.parentPath.parentPath.name === 'declarations' &&
                fnExpr.parentPath.parentPath.parentPath && fnExpr.parentPath.parentPath.parentPath.value.type === 'VariableDeclaration'
            ) {
                return isInGlobalScope(fnExpr.parentPath.parentPath.parentPath.parentPath);
            }

            // TODO(mbroadst)
            // export var test = (() => {
            //   load("jstests/libs/fail_point_util.js");
            // })();
        }

        // export function killSession(db, collName) {
        //     load("jstests/libs/killed_session_util.js");
        // }
        if (blockStmt.parentPath && blockStmt.parentPath.value.type === 'FunctionDeclaration') {
            return isInGlobalScope(blockStmt.parentPath.parentPath);
        }
    }

    return false;
}

function convertToDynamicImport(j, stmt, imported) {
    const node = stmt.value;

    // maybe we should delete, or maybe its being used for side-effects
    if (imported < 1) {
        console.log(`HAND_CONVERT: ${file.path}`);
        return node;
    }

    if (imported.size === 1) {
    } else {
    // return j.variableDeclaration("const", [
    //     j.variableDeclarator(
    //         j.identifier(importSpecifier),
    //         j.awaitExpression(
    //             j.callExpression(b.identifier("import"), [j.literal(loadSpecifier)])
    //         )
    //     )
    // ]);
    }

    return node;
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    const basePath = findBasePath(file.path);
    // console.dir({filePath: file.path, basePath});

    const newTopLevelImports = [];

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
            if (isLoadForOverride(loadSpecifier)) {
                // Assume by default we want to import for side-effects
                return j.importDeclaration([], j.literal(loadSpecifier));
            }

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
                // We've detected an import which isn't used, remove it. But first, re-add any
                // leading comments before removing the node
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

            const specifiers =
                imported.map(name => j.importSpecifier(j.identifier(name)));
            const decl = j.importDeclaration(specifiers, j.literal(loadSpecifier));
            if (leadingComments) {
                decl.comments = leadingComments;
            }

            if (isChildOfRootExport(j, stmt)) {
                newTopLevelImports.push(decl);
                return null;
            } else {
                if (!isInGlobalScope(stmt)) {
                    // These are probably dynamic imports for parallel shell funcs
                    return convertToDynamicImport(j, stmt, imported);
                }
            }

            return decl;
        });

    if (newTopLevelImports.length > 0) {
        const body = source.get().node.program.body;
        // TODO(mbroadst): consider finding "use strict" and adding after that

        for (let tli of newTopLevelImports) {
            body.unshift(tli);
        }
    }

    // console.dir(source.toSource());
    return source.toSource();
}

/*
JUNKYARD
function makeImportAllAsSpecifier(j, stmt, importSpecifier, loadSpecifier) {
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
*/
