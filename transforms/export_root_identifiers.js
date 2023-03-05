const {isGlobalNode} = require('./utils');

function replaceWithExported(j, path) {
    let comments;
    if (path.node.comments) {
        comments = path.node.comments;
        delete path.node.comments;
    }

    const exportDeclaration = j.exportNamedDeclaration(path.node);
    if (comments) {
        exportDeclaration.comments = comments;
    }
    return exportDeclaration;
}

function isClassExpression(path) {
    // match: ClassName = function() {}
    const node = path.value;
    return node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' &&
        node.expression.left.type === 'Identifier' && node.expression.right.type === 'FunctionExpression';
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    let foundExports = false;

    // functions
    source
        .find(j.FunctionDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => {
            foundExports = true;
            return replaceWithExported(j, p);
        });

    // variables
    source
        .find(j.VariableDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => {
            foundExports = true;
            return replaceWithExported(j, p);
        });

    // classes
    source
        .find(j.ClassDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => {
            foundExports = true;
            return replaceWithExported(j, p);
        });

    // es5-style class expressions
    source
        .find(j.ExpressionStatement)
        .filter(isGlobalNode)
        .filter(isClassExpression)
        .replaceWith(p => {
            foundExports = true;

            // first convert expression to VariableDeclaration
            const expr = p.value.expression;
            const declarator = j.variableDeclarator(expr.left, expr.right);
            const varDecl = j.variableDeclaration("var", [declarator]);

            // then export the VariableDeclaration
            return j.exportNamedDeclaration(varDecl);
        });

    if (!foundExports) {
        console.log(`MANUAL_CHECK: ${file.path}`);
    }

    return source.toSource();
}
