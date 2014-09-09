var dxmanager = angular.module('dxmanager', []);

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

dxmanager.controller('EnvironmentCtrl', function($scope, $http){
  $scope.app_data = {
    status: 'running'
  };
  $scope.errors = [];
  $scope.active_requests = 0;

  $scope.get_data = function(){
    return $scope.app_data;
  };

  $scope.get_environments = function(){
    environments = [];
    for (env in $scope.app_data.environments){
      if ($scope.app_data.environments[env].tags.managed_by == 'ec2_asg_deployer'){
        environments.push($scope.app_data.environments[env]);
      }
    }
    return environments;
  };

  $scope.refresh = function(){
    $scope.active_requests += 1;
    $http.get('/environments').success(function(data) {
      console.log('here')
      console.log(data)
      if (data.status == 'success'){
        $scope.active_requests -= 1;
        $scope.app_data.environments = data.environments;
      }else{
        $scope.errors = [data.error];
      }
    });
  };

});
