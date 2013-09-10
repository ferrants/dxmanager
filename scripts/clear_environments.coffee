mongodb = require 'mongodb'
assert = require('assert');
require('js-yaml');

config = false
try
  config = require(__dirname + '/../content/config.yml');
  console.log config
catch e
  console.log e

col_environments = false

console.log "Connecting to Mongo on #{config.mongo.host}:#{config.mongo.port} using #{config.mongo.db}"
server = new mongodb.Server config.mongo.host, config.mongo.port, {}
new mongodb.Db(config.mongo.db, server, {}).open (err, client) ->
	assert.equal null, err, "Unable to connect to Mongo"
	console.log "Connected to Mongo"
	col_environments = new mongodb.Collection client, 'environments'
	col_environments.drop()
	console.log "Dropped environments"
