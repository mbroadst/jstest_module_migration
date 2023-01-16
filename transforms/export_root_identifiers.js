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

// function collectGlobalIdentifiers(j, source) {
//     const result = [];
//     source
//         .find(j.Node)
//         .filter(isGlobalNode)
//         .forEach(p => {
//             const node = p.value;
//             if (node.type === 'ExpressionStatement') {
//                 const expr = node.expression;
//                 if (expr.type === 'AssignmentExpression') {
//                     if (expr.left.type === 'Identifier') {
//                         result.push(expr.left.name);
//                     }
//                 }
//             } else if (node.type === 'ClassDeclaration' || node.type === 'FunctionDeclaration') {
//                 result.push(node.id.name);
//             } else if (node.type === 'VariableDeclaration') {
//                 result.push(node.declarations[0].id.name);
//             }
//         });

//     return result;
// }

function isClassExpression(path) {
    // match: ClassName = function() {}
    const node = path.value;
    return node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' &&
        node.expression.left.type === 'Identifier' && node.expression.right.type === 'FunctionExpression';
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);

    // const globalIdentifiers = collectGlobalIdentifiers(j, source);
    // console.dir({ globalIdentifiers });

    // functions
    source
        .find(j.FunctionDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => replaceWithExported(j, p));

    // variables
    source
        .find(j.VariableDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => replaceWithExported(j, p));

    // classes
    source
        .find(j.ClassDeclaration)
        .filter(isGlobalNode)
        .replaceWith(p => replaceWithExported(j, p));

    // es5-style class expressions
    source
        .find(j.ExpressionStatement)
        .filter(isGlobalNode)
        .filter(isClassExpression)
        .replaceWith(p => {
            // first convert expression to VariableDeclaration
            const expr = p.value.expression;
            const declarator = j.variableDeclarator(expr.left, expr.right);
            const varDecl = j.variableDeclaration("var", [declarator]);

            // then export the VariableDeclaration
            return j.exportNamedDeclaration(varDecl);
        });

    console.dir(source.toSource());
    return source.toSource();
}
