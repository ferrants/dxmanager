var email_regex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
function validate_email(email) {
  return email_regex.test(email);
}

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
    console.log("Attempting log in for: " + $scope.login_email);
    if (validate_email($scope.login_email)){
      $scope.errors = [];
      Properties.set('logged_in', true);
      Properties.set('username', $scope.login_email);
      $cookies.username = $scope.login_email;
      $('#login_modal').modal('hide');
    }else{
      $scope.errors = ["Please use Valid Email"]
    }
  };

  $scope.log_out = function(){
    Properties.set('logged_in', false);
    Properties.set('username', "None");
    $cookies.username = "";
  };

  $scope.get_errors = function(){
    return $scope.errors;
  }
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
    return (name in $scope.environment_map && ($scope.environment_map[name].holder == Properties.get('username') || !('holder' in $scope.environment_map[name])));
  };

  $scope.can_deploy = function(name){
    return Properties.get('logged_in') && $scope.is_open(name) && !$scope.is_busy(name);
  };

  $scope.is_busy = function(name){
    return (name in $scope.environment_map && $scope.environment_map[name].busy === true);
  };

  $scope.can_relinquish = function(name){
    return Properties.get('logged_in') && $scope.environment_map[name].holder == Properties.get('username');
  };

  $scope.deploy = function(name, value){
    var error = false;
    if (!name){
      error = "Choose an environment to deploy to";
    }
    if ($scope.can_deploy(name)){
      var body = {
        email: Properties.get('username'),
        name: name
      };

      if ('deploy' in $scope.environment_map[name]){
        if (value){
          body[$scope.environment_map[name].deploy.input.name] = value;
        }
      }

      if (error){
        alert(error);
      }else{
        $http.post('/api/deploy', body).success(function(data) {
          console.log(data);
          setTimeout($scope.refresh, 1000);
        });
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

  $scope.display_values = function(name){
    var env = $scope.environment_map[name];
    var blob = [
      {name: "Host", val: env.host },
      {name: "Holder", val: env.holder || "None"},
      {name: "Msg", val: env.message || "None"}
    ];
    if ('deploy' in env && 'display_values' in env.deploy){
      for (var i in env.deploy.display_values){
        var param_name = env.deploy.display_values[i].display_name;
        var param_val = env[env.deploy.display_values[i].name];
        if (param_val){
          blob.push({name: param_name, val: param_val });
        }
      }
    }
    return blob;
  };

  $scope.val_type = function(val){
    if (val.indexOf('http://') != -1){
      return 'link';
    }
    return 'text';
  };
}
