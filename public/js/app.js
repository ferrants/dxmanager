var dxmanager = angular.module('dxmanager', ['LocalStorageModule']);

dxmanager.filter('fromNow', function() {
  return function(date) {
    return moment(date).fromNow(true);
  }
});

dxmanager.filter('short_hash', function(){
  return function(hash){
    return hash.substring(0, 8);
  }
});

dxmanager.filter('remote2github', function(){
  return function(remote){
    return remote.replace('git@github.com:dataxu/', 'http://github.com/dataxu/').replace(/\.git$/, '')
  }
});
dxmanager.filter('remote2name', function(){
  return function(remote){
    return remote.replace('git@github.com:dataxu/', '').replace(/\.git$/, '')
  }
});

dxmanager.controller('EnvironmentCtrl', function($scope, $http, localStorageService){
  $scope.app_data = {
    status: 'running'
  };
  $scope.environments = [];
  $scope.errors = [];
  $scope.feedback = [];
  $scope.active_requests = 0;
  $scope.filters = {};
  $scope.filter_list = [];
  $scope.enabled_filter_list = [];
  $scope.filter_mode = 'exclusive';
  var filter_keys = ['name', 'environment']

  $scope.auth = false;
  $scope.login_form = {
    username: '',
    api_token: ''
  };

  $scope.load_state = function(){
    if (localStorageService.get('username') && localStorageService.get('api_token')){
      $scope.auth = $scope.login_form = {
        'username': localStorageService.get('username'),
        'api_token': localStorageService.get('api_token')
      };
    }
    $scope.filter_mode = localStorageService.get('filter_mode');
  };

  $scope.log_in = function(){
    $http.post('/auth', $scope.login_form).success(function(data) {
      if (data.status == 'success'){
        $scope.auth = $scope.login_form;
        localStorageService.set('username', $scope.auth.username);
        localStorageService.set('api_token', $scope.auth.api_token);
        $scope.errors = [];
      }else{
        $scope.errors = [data.error];
      }
    });
  };

  $scope.log_out = function(){
    $scope.auth = false;
    localStorageService.clearAll();
  };

  $scope.get_data = function(){
    return $scope.environments;
  };

  $scope.toggle_filter = function(key, value){   
    console.log($scope.filters)
    $scope.filters[key][value].enabled = ! $scope.filters[key][value].enabled ;
    set_filter_list();
    localStorageService.set('filters', $scope.filters)
  };


  $scope.toggle_filter_mode = function(){
    $scope.filter_mode = ($scope.filter_mode == 'exclusive') ? 'inclusive' : 'exclusive';
    localStorageService.set('filter_mode', $scope.filter_mode);

  };

  set_filter_list = function(){
    console.log($scope.filters)
    filters = []
    enabled_filters = []
    for (k in $scope.filters){
      for (v in $scope.filters[k]){
        filter = {
            key: k,
            value: v,
            count: $scope.filters[k][v].count,
            enabled: $scope.filters[k][v].enabled
          };

        filters.push(filter);
        if (filter.enabled){
          enabled_filters.push(filter)
        }
      }
    }
    $scope.filter_list = filters;
    $scope.enabled_filter_list = enabled_filters;
  };

  $scope.filter_environments = function(env, v){
    enabled_filters = $scope.enabled_filter_list;
    console.log(enabled_filters);
    if (enabled_filters.length == 0){
      return true;
    }else{
      if ($scope.filter_mode == 'exclusive'){
        for (i in enabled_filters){
          filter = enabled_filters[i];
          if (env.tags[filter.key] != filter.value){
            return false;
          }
        }
        return true;
      }else{
        for (i in enabled_filters){
          filter = enabled_filters[i];
          if (env.tags[filter.key] == filter.value){
            return true;
          }
        }
        return false;
      }
    }
  };

  parse_filters = function(){
    if (Object.keys($scope.filters).length == 0){
      loaded_filters = localStorageService.get('filters')
      if (!(loaded_filters)){
        loaded_filters = {}
      }
    }

    filters = {}
    for (k in filter_keys){
      filters[filter_keys[k]] = {}
    }
    
    for (i in $scope.environments){
      env = $scope.environments[i];
      console.log(env)
      for (i in filter_keys){
        k = filter_keys[i]
        if (k in env.tags){
          value = env.tags[k]
          if (!(value in filters[k])){
            filters[k][value] = {count: 0, enabled: false};
          }
          filters[k][value].count += 1;
          if (k in loaded_filters && value in loaded_filters[k] && loaded_filters[k][value].enabled){
            filters[k][value].enabled = true;
          }
        }
      }
      

    }

    $scope.filters = filters;
    set_filter_list();
  };

  post_process_environments = function(){
    for (i in $scope.environments){
      env = $scope.environments[i];
      warnings = []
      deploy_job = false;
      if (!('build_url' in env.tags) || env.tags.build_url == 'None Specified'){
        warnings.push("No deploy information for the ASG, this deploy was not done from Jenkins")
      }
      if (!('build_url' in env.ami_tags) || env.ami_tags.build_url == 'None Specified'){
        warnings.push("No creation information for AMI, it was not made in Jenkins")
      }
      if (env.current_size == 0){
        warnings.push("There are no instances")
      }else if ( env.current_size !=  env.desired_size ){
        warnings.push("There are " + env.current_size + " instances when there should be " + env.desired_size)
      }
      
      if (env.job){
        deploy_job = JSON.parse(JSON.stringify(env.job));
        deploy_job.parameters.ami_id = '';
      }

      env.warnings = warnings;
      env.deploy_job = deploy_job;

    }
  };

  $scope.refresh = function(update_cache){
    $scope.active_requests += 1;

    url = '/environments'
    if (update_cache){
      url += "?update_cache=1"
    }
    $http.get(url).success(function(data) {
      if (data.status == 'success'){
        $scope.active_requests -= 1;
        envs = [];
        $scope.environments = data.environments;
        for (env in data.environments){
          if (data.environments[env].tags.managed_by == 'ec2_asg_deployer'){
            data.environments[env].warnings = []
            envs.push(data.environments[env]);
          }
        }
        $scope.environments = envs;
        post_process_environments();
        parse_filters();
      }else{
        $scope.errors = [data.error];
      }
    });
  };

  $scope.deploy = function(env, ami){

    if (!$scope.auth){
      $scope.errors = ["You must log in to deploy"]
    }else if (!(ami)){
      $scope.errors = ["Need to specify an AMI"]
    }else if (env.tags.build_url.indexOf('http://jenkins.devaws') != 0){
      $scope.errors = ["Can't deploy to environment in unknown state, no old deploy job"]
    }else if (ami.indexOf('ami-') != 0){
      $scope.errors = ["AMI looks wrong"]
    }else if (ami == env.ami_id){
      $scope.errors = ["Same AMI, not running deploy"]
    }else{
      $scope.errors = []
      $http.post('/run_job', {
        username: $scope.auth.username,
        api_token: $scope.auth.api_token,
        job: env.deploy_job
      }).success(function(data) {
        if (data.status == 'success'){
          console.log(data);
          if (data.feedback){
            $scope.feedback = data.feedback;
          }
        }else{
          $scope.errors = [data.error];
        }
      });
    }
  };

});
