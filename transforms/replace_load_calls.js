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
                result.push(decl.declarations[0].id.name);
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


module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    const basePath = findBasePath(file.path);

    // Find all "load" calls and replace with import declarations
    source
        .find(j.ExpressionStatement)
        .filter(isLoadCallExpression)
        .replaceWith(stmt => {
            const node = stmt.value;
            const loadSpecifier = node.expression.arguments[0].value;
            const exported = getExportedIdentifiers(j, basePath, loadSpecifier);
            if (exported.length === 0) {
                return node;
            }

            const imported = findExportsUsedInThisScript(j, file, exported);
            if (imported.length === 0) {
                // We probably need to delete this line, its not importing anything?
                console.error("REMOVED ELEMENT: ", node);
                return null;
            }

            // If we only have one export, then import using a namespace specifier
            // replace with: import * as NAME from '...'; with name of exported
            if (exported.length === 1) {
                const namespaceSpecifier = j.importNamespaceSpecifier(j.identifier(exported[0]));
                return j.importDeclaration([namespaceSpecifier], j.literal(loadSpecifier));
            }

            const specifiers = imported.map(name => j.importSpecifier(j.identifier(name)));
            return j.importDeclaration(specifiers, j.literal(loadSpecifier));
        });

    console.dir(source.toSource());
    return source.toSource();
}
