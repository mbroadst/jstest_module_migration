GeoNearRandomTest = function(name, dbToUse) {
    this.name = name;
    this.db = (dbToUse || db);
    this.t = this.db[name];
    this.reset();
    print("Starting getNear test: " + name);
};

GeoNearRandomTest.prototype.reset = function reset() {
    // Reset state
    this.nPts = 0;
    this.t.drop();
    Random.srand(1234);
};

class TestKlass {}

function TestGlobalFunction() {}

var TestVariableDeclaration = {};
