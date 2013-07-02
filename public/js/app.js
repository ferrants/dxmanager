(function($){
  $(document).ready(function(){

      $('#form_login').submit(function(){
        $('#login_modal').modal('hide');
      });

  });
})(jQuery);


var dxmanager = angular.module('dxmanager', ['ngCookies']);
dxmanager.factory('Properties', function(){
  var prop_set = {};
  return {
    get: function (key) {
      return prop_set[key];
    },
    set: function(key, value) {
      prop_set[key] = value;
    }
  };
});

function AuthCtrl($scope, $cookies, Properties){

  $scope.check_auth = function(){
    if ($cookies.username){
      Properties.set('logged_in', true);
      Properties.set('username', $cookies.username);
    }else{
      Properties.set('logged_in', false);
      Properties.set('username', "None");
    }
  };
  $scope.check_auth();
  
  $scope.auth = function(){
    if (Properties.get('logged_in')){
      return Properties.get('username');
    }else{
      return "None";
    }
  };

  $scope.logged_in = function(){
    return Properties.get('logged_in');
  };

  $scope.log_in = function(){
    console.log("Logging in: " + $scope.login_email);
    Properties.set('logged_in', true);
    Properties.set('username', $scope.login_email);
    $cookies.username = $scope.login_email;
  };

  $scope.log_out = function(){
    Properties.set('logged_in', false);
    Properties.set('username', "None");
    $cookies.username = false;
  };
}

function EnvironmentCtrl($scope, $http, Properties){
  var set_env_map = function(){
    $scope.environment_map = {};
    for (var i in $scope.environments){
      $scope.environment_map[$scope.environments[i].name] = $scope.environments[i];
    }
    console.log($scope.environment_map);
  };

  $scope.refresh = function(){
    $http.get('/api/config').success(function(data) {
      if ('plugins' in data){
        for (var plugin in data['plugins']){
          if ('matcher' in data['plugins'][plugin].deploy){
            matcher = new RegExp(data['plugins'][plugin].deploy['matcher']);
            console.log(matcher);
            for (var environment in data.environments){
              if (data.environments[environment].name.search(matcher) !== -1){
                data.environments[environment].deploy = data['plugins'][plugin].deploy;
              }
            }
          }
        }
      }
      $scope.environments = data.environments;
      set_env_map();
    });
  };
  $scope.refresh();

  $scope.is_open = function(name){
    return (name in $scope.environment_map && !('holder' in $scope.environment_map[name]));
  };

  $scope.can_deploy = function(name){
    return Properties.get('logged_in') && $scope.is_open(name);
  };

  $scope.is_busy = function(name){
    return (name in $scope.environment_map && $scope.environment_map[name].busy === true);
  };

  $scope.can_relinquish = function(name){
    return Properties.get('logged_in') && $scope.environment_map[name].holder == Properties.get('username') && !$scope.is_open(name);
  };

  $scope.deploy = function(name, value){
    if ($scope.can_deploy(name)){
      if (name){
        var body = {
          email: Properties.get('username'),
          name: name
        };

        if ('deploy' in $scope.environment_map[name]){
          body[$scope.environment_map[name].deploy.input.name] = value;
        }

        $http.post('/api/deploy', body).success(function(data) {
          console.log(data);
          $scope.refresh();
        });
      }else{
        alert("Choose an environment to deploy to");
      }
    }
  };

  $scope.deploy_type = function(name){
    if ('deploy' in $scope.environment_map[name]){
      return "text";
    }else{
      return "";
    }
  };

  $scope.relinquish = function(name){
    if ($scope.can_relinquish(name)){
      var body = {
        email: Properties.get('username'),
        name: name
      };
      $scope.environment_map[name].busy = true;
      $http.post('/api/relinquish', body).success(function(data) {
        console.log(data);
        $scope.refresh();
      });
    }
  };

}