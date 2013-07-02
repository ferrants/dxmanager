mongodb = require 'mongodb'
assert = require 'assert'

class Persistence
  constructor: (@host, @port, @db_name) ->

  connect: (cb=()->) ->
    persistence = @
    console.log "Connecting to Mongo on #{@host}:#{@port} using #{@db_name}"
    server = new mongodb.Server @host, @port, {}
    new mongodb.Db(@db_name, server, {}).open (err, client) ->

      assert.equal null, err, "Unable to connect to Mongo"
      console.log "Connected to Mongo"
      persistence.client = client
      persistence.col_environments = new mongodb.Collection client, 'environments'
      cb()

  load_environment: (env) ->
    col_environments = @col_environments
    col_environments.find({name: env.name}).toArray (err, docs) ->
      assert.equal null, err, "Unable to find environments"

      if docs.length == 0
        col_environments.insert env, (err, result) ->
          assert.equal null, err, "Unable to insert environment"
          console.log "inserted env #{env.name}"
          console.log result
      else
        for doc in docs
          changed = false
          for param of env
            if doc[param] != env[param]
              changed = true
              console.log "Environment Changed! (#{doc.name}) [#{param}] #{doc[param]} -> #{env[param]}"
              doc[param] = env[param]
            if changed
              col_environments.save doc, (err, data) ->
                if err
                  console.log "Error saving updated environment"
                  console.log err
              

  get_environments: (cb=()->) ->
    return_fields = {'_id': 0}
    @col_environments.find({}, {sort: {'label': 1}, fields: return_fields}).toArray (err, docs) ->
      cb err, docs

  is_available: (name, user=false, cb) ->
    @col_environments.findOne {name: name}, (err, item) ->
      console.log item
      if err
        cb(false)
      else if 'holder' not of item or user != false and item.holder == user
        cb(true)
      else
        cb(false)

  lock_environment: (name, user, cb) ->
    persistence = @
    persistence.col_environments.findOne {name: name}, (err, item) ->
      if err
        cb {'err': err}
      else
        item.holder = user
        persistence.col_environments.save item, (err, data) ->
            cb err, data

  unlock_environment: (name, cb) ->
    persistence = @
    persistence.col_environments.findOne {name: name}, (err, item) ->
      if err
        cb {'err': err}
      else
        delete item.holder
        persistence.col_environments.save item, (err, data) ->
            cb err, data

module.exports = Persistence
