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

email_regex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
validate_email = (email) ->
  email_regex.test(email)

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

  app.get '/api/config', (req, res) ->
    console.log "-- Environments"
    persistence.get_environments (err, environments) ->
      if err
        res.send {"error": "Error loading environments"}
      else
        plugins = {}
        for plugin_name, plugin of config.plugins
          for hook_type in ['deploy', 'display_values']
            if hook_type of plugin
              if plugin_name not of plugins
                plugins[plugin_name] = {}
              plugins[plugin_name][hook_type] = plugin[hook_type]
        res.send {"environments": environments, 'plugins': plugins}


  app.post '/api/deploy', (req, res) ->
    console.log "-- Deploy"
    console.log req.body
    environment_name = req.body.name
    user = req.body.email
    if not validate_email user
      res.send {"error": "use email address to authenticate"}
    else
      persistence.is_available environment_name, user, (open) ->
        if open
          persistence.lock_environment environment_name, user, (err, data) ->
            if err
              if 'err' of err
                res.send {'error': err.err}
              else
                console.log err
                res.send {'error': "An unexpected error occurred"}
            else
              for plugin_name, plugin of config.plugins
                if 'deploy' of plugin and 'hook' of plugin.deploy
                  matcher = matcher = new RegExp(plugin.deploy.matcher)
                  if environment_name.search(matcher) != -1
                    console.log "Deploy to #{environment_name} being picked up by #{plugin_name}"
                    console.log plugin
                    Plugin = require "./content/plugins/#{plugin.deploy.hook.file}"
                    p = new Plugin plugin.params, persistence
                    p[plugin.deploy.hook.method] environment_name, req.body, (response) ->
                      console.log "Deploy to #{environment_name} call back from #{plugin_name}"
                      console.log response

              res.send {"success": true}
        else
          res.send {"error": "Environment unavailable"}

  app.post '/api/relinquish', (req, res) ->
    console.log "-- Relinquish"
    console.log req.body
    environment_name = req.body.name
    user = req.body.email
    if not validate_email user
      res.send {"error": "use email address to authenticate"}
    else
      persistence.unlock_environment environment_name, user, (err, data) ->
        if err
          if 'err' of err
            res.send {'error': err.err}
          else
            console.log err
            res.send {'error': "An unexpected error occurred"}
        else
          res.send {"success": true}

  port = process.env.DXMANAGER_PORT || 8080
  app.listen port
  console.log "Listening on port #{port}"

db_connect setup_server
