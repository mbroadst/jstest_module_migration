function isGlobalNode(path) {
    if (path.source && path.source.isGlobal) {
        return true;
    }

    if (path.parent && path.parent.value.type === 'Program') {
        return true;
    }

    return false;
}

module.exports = { isGlobalNode };
