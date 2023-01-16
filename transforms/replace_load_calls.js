const path = require('path');
const { readFileSync } = require('fs');

function isLoadCallExpression(path) {
    const expr = path.value;
    return expr.callee && expr.callee.name && expr.callee.name === 'load';
}

function isExported(path) {
    const node = path.value;
    return node.type === 'ExportNamedDeclaration';
}

function getExportedIdentifiers(j, file, scriptPath) {
    const p = path.parse(file.path);
    const path2 = path.resolve(p.dir, scriptPath);
    const source = readFileSync(path2).toString();

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

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);

    // Find all "load" calls and replace with import declarations
    source
        .find(j.CallExpression)
        .filter(isLoadCallExpression)
        .replaceWith(expr => {
            const scriptPath = expr.value.arguments[0].value;
            const exported = getExportedIdentifiers(j, file, scriptPath);
            if (exported.length === 0) {
                return expr;
            }

            const imported = findExportsUsedInThisScript(j, file, exported);
            if (imported.length === 0) {
                return expr;
            }

            const specifiers = imported.map(name => j.importSpecifier(j.identifier(name)));
            return j.importDeclaration(specifiers, j.literal(scriptPath));
        });

    console.dir(source.toSource());
    return source.toSource();
}
