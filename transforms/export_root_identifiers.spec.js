'use strict';
const { expect } = require('chai');
const jscodeshift = require('jscodeshift');
const exportRootIdentifiers = require('./export_root_identifiers.js');

describe('Export Root Identifiers', function () {
    [
        { before: 'class TestClass {}', after: 'export class TestClass {}' },
        {
            before: 'function TestGlobalFunction() {}',
            after: 'export function TestGlobalFunction() {}'
        },
        {
            before: 'function* findMatchingLogLines(logLines, fields, ignoreFields) {}',
            after: 'export function* findMatchingLogLines(logLines, fields, ignoreFields) {}'
        },
        {
            before: 'var TestVariableDeclaration = {};',
            after: 'export var TestVariableDeclaration = {};'
        },
        {
            before: 'GeoNearRandomTest = function(name, dbToUse) {};',
            after: 'export var GeoNearRandomTest = function(name, dbToUse) {};'
        }
    ].forEach(example => {
        const maybeItOnly = example.only ? it.only : it;
        maybeItOnly(example.before, () => {
            const file = { path: 'test', source: example.before };
            const processed = exportRootIdentifiers(file, { jscodeshift });
            expect(processed).to.equal(example.after);
        });
    });
});
