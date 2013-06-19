(function($){
  $(document).ready(function(){

      $('#form_login').submit(function(){
        $('#login_modal').modal('hide');
      });

  });
})(jQuery);


angular.module('dxmanager', ['ngCookies']);
var prop_set = {};
shared_properties = {
  get: function (key) {
    return prop_set[key];
  },
  set: function(key, value) {
    prop_set[key] = value;
  }
};

function AuthCtrl($scope, $cookies){

  $scope.check_auth = function(){
    if ($cookies.username){
      shared_properties.set('logged_in', true);
      shared_properties.set('username', $cookies.username);
    }else{
      shared_properties.set('logged_in', false);
      shared_properties.set('username', "None");
    }
  };
  $scope.check_auth();
  
  $scope.auth = function(){
    if (shared_properties.get('logged_in')){
      return shared_properties.get('username');
    }else{
      return "None";
    }
  };

  $scope.logged_in = function(){
    return shared_properties.get('logged_in');
  };

  $scope.log_in = function(){
    console.log("Logging in: " + $scope.login_email);
    shared_properties.set('logged_in', true);
    shared_properties.set('username', $scope.login_email);
    $cookies.username = $scope.login_email;
  };

  $scope.log_out = function(){
    shared_properties.set('logged_in', false);
    shared_properties.set('username', "None");
    $cookies.username = false;
  };
}

function EnvironmentCtrl($scope, $http){
  var set_env_map = function(){
    $scope.environment_map = {};
    for (var i in $scope.environments){
      $scope.environment_map[$scope.environments[i].name] = $scope.environments[i];
    }
  };

  $scope.refresh = function(){
    $http.get('/api/config').success(function(data) {
      $scope.environments = data.environments;
      set_env_map();
    });
  };
  $scope.refresh();

  $scope.is_open = function(name){
    return (name in $scope.environment_map && !('holder' in $scope.environment_map[name]));
  };

  $scope.can_deploy = function(name){
    return shared_properties.get('logged_in') && $scope.is_open(name);
  };

  $scope.is_busy = function(name){
    return (name in $scope.environment_map && $scope.environment_map[name].busy === true);
  };

  $scope.can_relinquish = function(name){
    return shared_properties.get('logged_in') && $scope.environment_map[name].holder == shared_properties.get('username') && !$scope.is_open(name);
  };

  $scope.deploy = function(name, hash){
    if ($scope.can_deploy(name)){
      if (name && hash){
        var body = {
          email: shared_properties.get('username'),
          hash: hash,
          name: name
        };
        $scope.environment_map[name].busy = true;
        $http.post('/api/deploy', body).success(function(data) {
          console.log(data);
          $scope.refresh();
        });
      }else{
        alert("Enter a hash to deploy");
      }
    }
  };

  $scope.relinquish = function(name){
    if ($scope.can_relinquish(name)){
      var body = {
        email: shared_properties.get('username'),
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