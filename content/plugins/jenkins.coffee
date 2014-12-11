http = require 'http'
urlencode = require 'urlencode'

class Jenkins
  constructor: (config, params, persistence) ->
    @host = config.env.JENKINS_URL
    @user = config.env.JENKINS_USER
    @user_token = config.env.JENKINS_USER_TOKEN
    @token = config.env.JENKINS_JOB_TOKEN

    @job_name = params.job_name
    @recheck_seconds = if params.recheck_seconds? then params.recheck_seconds else 30
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
              'name': 'hash',
              'value': params.hash
            },
            {
              'name': 'environment',
              'value': env.host
            },
            {
              'name': 'run_type',
              'value': 'deploy'
              # 'value': 'dry'
            },
            {
              'name': 'branch',
              'value': 'master'
            }
          ]
        }
        jenkins.start_job data_body, (build) ->
          console.log "Started Job #{jenkins.job_name}"

          if build
            console.log "Build:"
            console.log build
            if build.building == false
              env.busy = false
            else
              recheck_interval = false
              recheck_build_status = () ->
                jenkins.get_build build.number, (build) ->
                  if build.building == false
                    clearInterval recheck_interval
                    env.busy = false
                    env.message = "Status: #{build.result}"
                    persistence.save_environment(env)

              recheck_interval = setInterval(recheck_build_status, jenkins.recheck_seconds * 1000)

            env.link = build.url
            env.message = "job started"

            persistence.save_environment(env)

            cb( {"success": "job started", "build": build} )
          else
            env.busy = false
            env.message = "unable to start build"
            persistence.save_environment(env)
            cb( {"error": "unable to start build"} )

    else
      cb {"error": "no git hash provided"}

  start_job: (post_data, cb) ->
      jenkins = @
      console.log "Sending to Jenkins:"
      console.log post_data

      post_body = "json=" + urlencode(JSON.stringify(post_data))

      jenkins_info = {
        method: 'POST',
        host: @host,
        path: "/job/#{jenkins.job_name}/build?token=#{jenkins.token}"
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_body.length,
          'Authorization': 'Basic ' + new Buffer("#{@user}:#{@user_token}").toString('base64')
        }
      }

      last_build = false
      get_started_build = (cb) ->
        jenkins.get_last_build (build) ->
          if build and build.url == last_build.url
            get_started_build cb
          else
            cb(build)

      post_callback = (response) ->
        str = ''
        response.on 'data', (chunk) ->
          str += chunk;
          console.log "From Jenkins: #{chunk}"

        response.on 'end', () ->
          console.log "Response from jenkins post ended:"
          console.log str
          get_started_build cb

      console.log jenkins_info
      console.log post_body

      jenkins.get_last_build (build) ->
        last_build = build
        req = http.request jenkins_info, post_callback
        req.write post_body
        req.end()

    get_last_build: (cb) ->
      @get_builds (builds) ->
        if builds.length > 0
          cb builds[0]
        else
          cb()

    get_builds: (cb) ->
      console.log "Looking up builds for job #{@job_name}"
      path = "/job/#{@job_name}/api/json?tree=builds[number,timestamp,id,result,url,description,fullDisplayName,building]"
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
          console.log s
          response_json = JSON.parse(s)
          # console.log response_json
          cb(response_json.builds)

      req = http.request jenkins_info, get_callback
      req.end()

    get_build: (build_number, cb) ->
      console.log "Looking up build #{build_number} for job #{@job_name}"
      path = "/job/#{@job_name}/#{build_number}/api/json"
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
