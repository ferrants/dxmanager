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
  $scope.active_requests = 0;
  $scope.filters = [];
  $scope.enabled_filters = [];
  $scope.filter_exclusively = true;

  $scope.auth = false;
  $scope.login_form = {
    username: '',
    api_token: ''
  };

  $scope.load_auth = function(){
    if (localStorageService.get('username') && localStorageService.get('api_token')){
      $scope.auth = $scope.login_form = {
        'username': localStorageService.get('username'),
        'api_token': localStorageService.get('api_token')
      };
    }
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

  $scope.enable_filter = function(filter){
    filter.enabled = !filter.enabled;
    enabled_filters = [];
    for (f in $scope.filters){
      if ($scope.filters[f].enabled){
        enabled_filters.push($scope.filters[f]);
      }
    }
    $scope.enabled_filters = enabled_filters;
  };

  $scope.filter_environments = function(env, v){
    if ($scope.enabled_filters.length == 0){
      return true;
    }else{
      if ($scope.filter_exclusively){
        for (f in $scope.enabled_filters){
          filter = $scope.enabled_filters[f];
          if (env.tags[filter.key] != filter.value){
            return false;
          }
        }
        return true;
      }else{
        for (f in $scope.enabled_filters){
          filter = $scope.enabled_filters[f];
          if (env.tags[filter.key] == filter.value){
            return true;
          }
        }
        return false;
      }
    }
  };

  parse_filters = function(){
    var filters = {
      name: {},
      environment: {}
    };
    for (i in $scope.environments){
      env = $scope.environments[i];
      for (k in filters){
        if (k in env.tags){
          if (!(env.tags[k] in filters[k])){
            filters[k][env.tags[k]] = 0;
          }
          filters[k][env.tags[k]] += 1;
        }
      }
    }
    filter_list = []
    for (k in filters){
      for (v in filters[k]){
        filter_list.push({
          'key': k,
          'value': v,
          'count': filters[k][v]
        });
      }
    }
    $scope.filters = filter_list;

  };

  $scope.refresh = function(){
    $scope.active_requests += 1;
    $http.get('/environments').success(function(data) {
      if (data.status == 'success'){
        $scope.active_requests -= 1;
        envs = [];
        $scope.environments = data.environments;
        for (env in data.environments){
          if (data.environments[env].tags.managed_by == 'ec2_asg_deployer'){
            envs.push(data.environments[env]);
          }
        }
        $scope.environments = envs;
        parse_filters();
      }else{
        $scope.errors = [data.error];
      }
    });
  };

  $scope.deploy = function(env, ami){
    console.log(env);
    console.log(ami);
    if (!(ami)){
      $scope.errors = ["Need to specify an AMI"]
    }else if (env.tags.build_url.indexOf('http://jenkins.devaws') != 0){
      $scope.errors = ["Can't deploy to environment in unknown state, no old deploy job"]
    }else if (ami.indexOf('ami-') != 0){
      $scope.errors = ["AMI looks wrong"]
    }else if (ami == env.ami_id){
      $scope.errors = ["Same AMI, not running deploy"]
    }else{
      $scope.errors = []
      $http.post('/deploy', {
        username: $scope.auth.username,
        api_token: $scope.auth.api_token,
        build_url: env.tags.build_url,
        ami_id: ami
      }).success(function(data) {
        if (data.status == 'success'){
          console.log(data);
        }else{
          $scope.errors = [data.error];
        }
      });
    }
  };

});
