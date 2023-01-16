const path = require('path');
const { readFileSync } = require('fs');

function isIIFEExpression(node) {
    return node.expression &&
        node.expression.type === "CallExpression" &&
        node.expression.callee.type === "FunctionExpression";
}

function isUseStrictExpression(node) {
    return (
        node.type === "ExpressionStatement" && node.expression && node.expression.value === "use strict"
    );
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
    const source = j(file.source);
    console.log("STARTING");

    // Save the comments attached to the first node, if they exist
    const getFirstNode = () => source.find(j.Program).get('body', 0).node;
    const firstNode = getFirstNode();
    const { comments } = firstNode;

    // Unwrap the root IIFE if it exists
    source
        .find(j.ExpressionStatement, isIIFEExpression)
        .forEach(expr => {
            if (expr.scope.isGlobal) {
                j(expr).replaceWith(expr.node.expression.callee.body.body);
            }
        });

    // Remove "use strict"
    source
        .find(j.ExpressionStatement, isUseStrictExpression)
        .forEach(stmt => j(stmt).remove());

    // Any code that once "return"ed from the IIFE now needs to "quit()"
    source
        .find(j.ReturnStatement)
        .forEach(path => {
            if (path.scope.isGlobal) {
                return j(path).replaceWith(path =>
                    j.expressionStatement(j.callExpression(j.identifier("quit"), []))
                );
            }
        });

    // If the first node has been modified or deleted, reattach the comments
    const firstNodeAfterRewrite = getFirstNode();
    if (firstNodeAfterRewrite !== firstNode) {
        firstNodeAfterRewrite.comments = comments;
    }

    console.log('SOURCE:');
    console.dir(source.toSource());
    return source.toSource();
}
