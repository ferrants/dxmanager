http = require 'http'
urlencode = require 'urlencode'

class Jenkins
  constructor: (params, persistence) ->
    @host = params.host
    @persistence = persistence

  deploy_ui: (environment_name, params, cb=()->) ->
    console.log "--- Jenkins"

    persistence = @persistence
    persistence.lookup_environment environment_name, (env) ->
      console.log env
      env.busy = true
      persistence.save_environment(env)

      end_busy = () ->
        env.busy = false
        persistence.save_environment(env)

      setTimeout end_busy, 5000


    console.log "Environment: #{environment_name}"
    console.log params
    console.log "--- End Jenkins"
    cb()
    # data_body = {
    #   'parameter': [
    #     {
    #       'name': 'GIT_HASH',
    #       'value': req.body.hash
    #     },
    #     {
    #       'name': 'STAGING_ENVIRONMENT',
    #       'value': item.host
    #     }
    #   ]
    # }

    # console.log "Sending to Jenkins:"
    # console.log data_body

    # post_body = JSON.stringify(data_body)
    # post_body = "json=" + urlencode(post_body)

    # jenkins_info = {
    #   method: 'POST',
    #   host: @host,
    #   path: '/job/staging-deploy_user-interface_hash/build?token=triggermetimbers'
    #   headers: {
    #     'Content-Type': 'application/x-www-form-urlencoded',
    #     'Content-Length': post_body.length
    #   }
    # }

    # post_callback = (response) ->
    #   str = ''
    #   response.on 'data', (chunk) ->
    #     str += chunk;

    #   response.on 'end', () ->
    #     console.log "Response from jenkins ended:"
    #     console.log str

    # console.log "Update saved, requesting to jenkins"
    # console.log jenkins_info
    # console.log post_body
    # req = http.request jenkins_info, post_callback
    # req.write post_body
    # req.end()

module.exports = Jenkins
