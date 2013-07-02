http = require 'http'
urlencode = require 'urlencode'

class Jenkins
  constructor: (params, persistence) ->
    @host = params.host
    @persistence = persistence

  deploy_ui: (environment_name, params, cb=()->) ->
    jenkins = @

    console.log "--- Jenkins"
    console.log "Environment: #{environment_name}"
    console.log params

    if params.hash

      persistence = @persistence
      persistence.lookup_environment environment_name, (env) ->
        console.log env
        env.busy = true
        env.hash = params.hash
        persistence.save_environment(env)

        data_body = {
          'parameter': [
            {
              'name': 'GIT_HASH',
              'value': params.hash
            },
            {
              'name': 'STAGING_ENVIRONMENT',
              'value': env.host
            }
          ]
        }
        job_name = 'staging-deploy_user-interface_hash'
        jenkins.start_job job_name, data_body, (build) ->
          console.log "Started Job #{job_name}"

          # jenkins.get_build job_name, build.number, (build) ->

          console.log build
          if build.building == false
            env.busy = false
          env.link = build.url
          persistence.save_environment(env)

          cb( {"success": "job started", "build": build} )
    else
      cb {"error": "no git hash provided"}

  start_job: (job_name, post_data, cb) ->
      jenkins = @
      console.log "Sending to Jenkins:"
      console.log post_data

      post_body = "json=" + urlencode(JSON.stringify(post_data))

      jenkins_info = {
        method: 'POST',
        host: @host,
        path: "/job/#{job_name}/build?token=triggermetimbers"
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_body.length
        }
      }

      post_callback = (response) ->
        str = ''
        response.on 'data', (chunk) ->
          str += chunk;
          console.log "From Jenkins: #{chunk}"

        response.on 'end', () ->
          console.log "Response from jenkins post ended:"
          console.log str
          jenkins.get_last_build job_name, (build) ->
            cb(build)

      console.log jenkins_info
      console.log post_body
      req = http.request jenkins_info, post_callback
      req.write post_body
      req.end()

    get_last_build: (job_name, cb) ->
      @get_builds job_name, (builds) ->
        if builds.length > 0
          cb builds[0]
        else
          cb()

    get_builds: (job_name, cb) ->
      console.log "Looking up builds for job #{job_name}"
      path = "/job/#{job_name}/api/json?tree=builds[number,timestamp,id,result,url,description,fullDisplayName,building]"
      console.log "#{@host}#{path}"
      jenkins_info = {
        method: 'GET',
        host: @host,
        path: path
      }

      get_callback = (response) ->
        s = ''
        response.on 'data', (chunk) ->
          s = s + chunk;

        response.on 'end', () ->
          console.log "Response from jenkins query ended:"
          response_json = JSON.parse(s)
          # console.log response_json
          cb(response_json.builds)

      req = http.request jenkins_info, get_callback
      req.end()

    get_build: (job_name, build_number, cb) ->
      console.log "Looking up build #{build_number} for job #{job_name}"
      path = "/job/#{job_name}/builds/#{build_number}/api/json"
      console.log "#{@host}#{path}"
      jenkins_info = {
        method: 'GET',
        host: @host,
        path: path
      }

      get_callback = (response) ->
        s = ''
        response.on 'data', (chunk) ->
          s = s + chunk;

        response.on 'end', () ->
          console.log "Response from jenkins build query ended:"
          response_json = JSON.parse(s)
          # console.log response_json
          cb(response_json)

      req = http.request jenkins_info, get_callback
      req.end()

module.exports = Jenkins
