express = require 'express'
mongodb = require 'mongodb'
http = require 'http'
urlencode = require 'urlencode'
assert = require('assert');
require('js-yaml');

config = false
try
  config = require(__dirname + '/content/config.yml');
  console.log config
catch e
  console.log e

col_environments = false

mongo_connect = (cb) ->
  console.log "Connecting to Mongo on #{config.mongo.host}:#{config.mongo.port} using #{config.mongo.db}"
  server = new mongodb.Server config.mongo.host, config.mongo.port, {}
  new mongodb.Db(config.mongo.db, server, {}).open (err, client) ->
    assert.equal null, err, "Unable to connect to Mongo"
    console.log "Connected to Mongo"
    col_environments = new mongodb.Collection client, 'environments'
    # col_environments.drop()
    # col_environments.find().toArray (err, docs) ->
    #   console.log "--- docs"
    #   console.log docs

    # Load Environments

    load_env = (env) ->
      # console.log "--- Env"
      # console.log env.name
      col_environments.find({name: env.name}).toArray (err, docs) ->
        assert.equal null, err, "Unable to find environments"
        # console.log env.name
        # console.log docs.length
        if docs.length == 0
          col_environments.insert env, (err, result) ->
            assert.equal null, err, "Unable to insert environment"
            console.log "inserted env #{env.name}"
            console.log result
    for env in config.environments
      load_env env

    cb()


setup_server = () ->

  app = express()

  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use app.router
  app.use express.static(__dirname + '/public')

  app.get '/api', (req, res) ->
    res.send {'hello': 'you found me'}

  app.get '/api/config', (req, res) ->
    if col_environments
      return_fields = {'_id': 0}
      col_environments.find({}, {sort: {'label': 1}, fields: return_fields}).toArray (err, docs) ->
        res.send {"environments": docs}

    else
      res.send {"error": "Error loading config file"}

  app.post '/api/deploy', (req, res) ->
    console.log "-- Deploy"
    console.log req.body
    if req.body.name and req.body.email and req.body.hash
      # console.log "querying"
      col_environments.findOne {name: req.body.name}, (err, item) ->
        # console.log "mongo respond"
        if err
          res.send {"error": "Unable to query for environment"}
        else
          # console.log item
          item.holder = req.body.email
          item.version = req.body.hash

          data_body = {
            'parameter': [
              {
                'name': 'GIT_HASH',
                'value': req.body.hash
              },
              {
                'name': 'STAGING_ENVIRONMENT',
                'value': item.host
              }
            ]
          }
          console.log "Sending to Jenkins:"
          console.log data_body

          jenkins_info = {
            method: 'POST',
            host: 'jenkins.bos.dataxu.net',
            path: '/job/staging-deploy_user-interface_hash/build?token=triggermetimbers'
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': post_body.length
            }
          }

          post_callback = (response) ->
            str = ''
            response.on 'data', (chunk) ->
              str += chunk;

            response.on 'end', () ->
              console.log "Response from jenkins ended:"
              console.log str
              col_environments.save item, () ->
                res.send {"success": true}

          console.log "Update saved, requesting to jenkins"
          console.log jenkins_info
          console.log post_body
          req = http.request jenkins_info, post_callback
          req.write post_body
          req.end()

    else
      console.log "dang"

  app.post '/api/relinquish', (req, res) ->
    console.log "-- Relinquish"
    console.log req.body
    if req.body.name and req.body.email
      # console.log "querying"
      col_environments.findOne {name: req.body.name}, (err, item) ->
        # console.log "mongo respond"
        if err
          res.send {"error": "Unable to query for environment"}
        else
          # console.log item
          delete item.holder
          delete item.version
          col_environments.save item, () ->
            res.send {"success": true}
    else
      console.log "dang"

  app.listen 8080
  console.log "Listening on port 8080"

mongo_connect setup_server