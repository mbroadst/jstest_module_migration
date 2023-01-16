function isIIFEExpression(node) {
	return node.expression && node.expression.type === 'CallExpression' &&
		node.expression.callee.type === 'FunctionExpression';
}

function isUseStrictExpression(node) {
	return (
		node.type === 'ExpressionStatement' && node.expression &&
		node.expression.value === 'use strict');
}

module.exports = function transformer(file, { jscodeshift: j } /*, options */) {
	const source = j(file.source);

	// If there are multiple top-level IIFEs in this file, skip it
	const topLevelIIFECount =
		source.find(j.ExpressionStatement, isIIFEExpression)
			.filter(expr => expr.scope.isGlobal)
			.length;

	if (topLevelIIFECount > 1) {
		return source.toSource();
	}

	let rootIIFEUnwrapped = false;
	let leadingComments;

	// Unwrap the root IIFE if it exists
	source.find(j.ExpressionStatement, isIIFEExpression).forEach(expr => {
		if (rootIIFEUnwrapped) {
			return;
		}

		if (expr.scope.isGlobal) {
			// Preserve leading comments when removing top-level IIFE
			if (expr.value.leadingComments) {
				leadingComments = expr.value.leadingComments;
			}

			j(expr).replaceWith(
				expr.node.expression.callee.body.body);
			rootIIFEUnwrapped = true;
		}
	});

	// Remove "use strict"
	source.find(j.ExpressionStatement, isUseStrictExpression)
		.forEach(stmt => j(stmt).remove());

	// Any code that once "return"ed from the IIFE now needs to "quit()"
	source.find(j.ReturnStatement).forEach(path => {
		if (path.scope.isGlobal) {
			return j(path).replaceWith(
				() => j.expressionStatement(
					j.callExpression(j.identifier('quit'), [])));
		}
	});

	if (leadingComments) {
		const comments = source.get().node.comments;
		if (comments && Array.isArray(comments)) {
			comments.push(...leadingComments);
		} else {
			source.get().node.comments = leadingComments;
		}
	}

	return source.toSource();
}
