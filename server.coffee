express = require 'express'
Persistence = require './lib/persistence'
http = require 'http'
urlencode = require 'urlencode'
assert = require 'assert'
require 'js-yaml'

config = false  # static data-model that is loaded
persistence = false # persistence class wrapper for mongo in this case

config_path =  __dirname + '/content/config.yml'
console.log "Reading config from: #{config_path}"
config = require config_path
console.log config

db_connect = (cb=()->) ->
  persistence = new Persistence config.mongo.host, config.mongo.port, config.mongo.db
  persistence.connect () ->
    for env in config.environments
      persistence.load_environment env
    cb()

setup_server = () ->

  app = express()

  app.use express.bodyParser()
  app.use express.methodOverride()
  app.use app.router
  app.use express.static(__dirname + '/public')

  app.get '/api/environments', (req, res) ->
    console.log "-- Environments"
    persistence.get_environments (err, environments) ->
      if err
        res.send {"error": "Error loading environments"}
      else
        res.send {"environments": environments}


  app.post '/api/deploy', (req, res) ->
    console.log "-- Deploy"
    console.log req.body
    environment_name = req.body.name
    user = req.body.email
    persistence.is_available environment_name, user, (open) ->
      if open      
        persistence.lock_environment environment_name, user, (err, data) ->
          if err
            res.send {"error": err}
          else
            res.send {"success": true}
      else
        res.send {"error": "Environment unavailable"}

  app.post '/api/relinquish', (req, res) ->
    console.log "-- Relinquish"
    console.log req.body
    environment_name = req.body.name
    persistence.unlock_environment environment_name, (err, data) ->
      if err
        res.send {'err': err}
      else
        res.send {"success": true}

  app.listen 8080
  console.log "Listening on port 8080"

db_connect setup_server
