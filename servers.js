_parsePath = function() {
    var dbpath = "";
    for (var i = 0; i < arguments.length; ++i)
    if (arguments[i] == "--dbpath")
    dbpath = arguments[i + 1];

    if (dbpath == "")
    throw "No dbpath specified";

    return dbpath;
}

_parsePort = function() {
    var port = "";
    for (var i = 0; i < arguments.length; ++i)
    if (arguments[i] == "--port")
    port = arguments[i + 1];

    if (port == "")
    throw "No port specified";
    return port;
}

createMongoArgs = function(binaryName, args) {
    var fullArgs = [binaryName];

    if (args.length == 1 && isObject(args[0])) {
        var o = args[0];
        for (var k in o) {
            if (k == "v" && isNumber(o[k])) {
                var n = o[k];
                if (n > 0) {
                    var temp = "-";
                    while (n-->0) temp += "v";
                    fullArgs.push(temp);
                }
            }
            else {
                fullArgs.push("--" + k);
                fullArgs.push("" + o[k]);
            }
        }
    }
    else {
        for (var i = 0; i < args.length; i++)
        fullArgs.push(args[i])
    }

    return fullArgs;
}

// Start a mongod instance and return a 'Mongo' object connected to it.
// This function's arguments are passed as command line arguments to mongod.
// The specified 'dbpath' is cleared if it exists, created if not.
startMongod = function() {

    var args = createMongoArgs("mongod", arguments);

    var dbpath = _parsePath.apply(null, args);
    resetDbpath(dbpath);

    return startMongoProgram.apply(null, args);
}

startMongos = function() {
    return startMongoProgram.apply(null, createMongoArgs("mongos", arguments));
}

// Start a mongo program instance (generally mongod or mongos) and return a
// 'Mongo' object connected to it. This function's first argument is the
// program name, and subsequent arguments to this function are passed as
// command line arguments to the program.
startMongoProgram = function() {
    var port = _parsePort.apply(null, arguments);

    _startMongoProgram.apply(null, arguments);

    var m;
    assert.soon
    (function() {
        try {
            m = new Mongo("127.0.0.1:" + port);
            return true;
        } catch(e) {
            }
        return false;
    });

    return m;
}

ShardingTest = function(testName, numServers, verboseLevel) {
    this._connections = [];
    this._serverNames = [];

    for (var i = 0; i < numServers; i++) {
        var conn = startMongod({
            port: 30000 + i,
            dbpath: "/data/db/" + testName + i
        });
        conn.name = "localhost:" + (30000 + i);

        this._connections.push(conn);
        this._serverNames.push(conn.name);
    }

    this._configDB = "localhost:30000";
    this.s = startMongos({
        port: 39999,
        v: verboseLevel || 0,
        configdb: this._configDB
    });

    var admin = this.admin = this.s.getDB("admin");
    this.config = this.s.getDB("config");

    this._serverNames.forEach(
    function(z) {
        admin.runCommand({
            addserver: z
        });
    }
    );
}

ShardingTest.prototype.getDB = function(name) {
    return this.s.getDB(name);
}

ShardingTest.prototype.getServerName = function(dbname) {
    return this.config.databases.findOne({
        name: dbname
    }).primary;
}

ShardingTest.prototype.getServer = function(dbname) {
    var name = this.getServerName(dbname);
    for (var i = 0; i < this._serverNames.length; i++) {
        if (name == this._serverNames[i])
        return this._connections[i];
    }
    throw "can't find server for: " + dbname + " name:" + name;

}

ShardingTest.prototype.getOther = function(one) {
    if (this._connections.length != 2)
    throw "getOther only works with 2 servers";

    if (this._connections[0] == one)
    return this._connections[1];
    return this._connections[0];
}

ShardingTest.prototype.stop = function() {
    stopMongoProgram(39999);
    for (var i = 0; i < this._connections.length; i++) {
        stopMongod(30000 + i);
    }
}

ShardingTest.prototype.adminCommand = function(cmd) {
    var res = this.admin.runCommand(cmd);
    if (res && res.ok == 1)
    return true;

    throw "command " + tojson(cmd) + " failed: " + tojson(res);
}
