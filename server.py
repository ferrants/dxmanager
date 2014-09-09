import re
import simplejson
import time

from flask import Flask, jsonify
from flask import request
from flask import Response
from flask import render_template

from pymongo import MongoClient
from pymongo import DESCENDING

from httplib2 import Http
from pprint import pprint
from jenkins import Jenkins
from jenkins import JenkinsException

try:
    import boto.ec2.autoscale
    import boto.ec2.image
    from boto.ec2.autoscale import AutoScaleConnection, AutoScalingGroup, Tag
    from boto.ec2.image import Image
    from boto.exception import BotoServerError
except ImportError:
    print "failed=True msg='boto required for this module'"
    sys.exit(1)

app = Flask(__name__, static_url_path='', static_folder='public/')

# Load default config and override config from an environment variable
app.config.update(dict(
    JENKINS_URL='http://jenkins.devaws.dataxu.net',
    JENKINS_USER='admin_user',
    JENKINS_USER_TOKEN='changeme',
    MONGO_DB_HOST='localhost',
    MONGO_DB_PORT=27017,
    MONGO_DB_NAME='dxmanager-database',
    PORT= 5001,
    DEBUG=True,
    TEST=False
))

jenkins_instance = Jenkins(app.config['JENKINS_URL'],
    app.config['JENKINS_USER'],
    app.config['JENKINS_USER_TOKEN'])

client = MongoClient(app.config['MONGO_DB_HOST'], app.config['MONGO_DB_PORT'])
db = client[app.config['MONGO_DB_NAME']]

environments_coll = db.events
error_coll = db.errors

running_status = 'running'

cached_response = False

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/environments')
def data():
    global cached_response

    environments = []
    data = {}
    try:
        if not cached_response:
            ec_conn = boto.ec2.connect_to_region('us-east-1')
            as_conn = boto.ec2.autoscale.connect_to_region('us-east-1')
            groups =  as_conn.get_all_groups()
            for group in groups:
                print vars(group)
                environment = {
                    'name': group.name,
                    'desired_size': group.desired_capacity,
                    'max_size': group.max_size,
                    'min_size': group.min_size,
                    'current_size': len(group.instances),
                    'tags': {tag.key: tag.value for tag in group.tags},
                    'launch_config_name': group.launch_config_name
                }
                if 'managed_by' in environment['tags'] and environment['tags']['managed_by'] == 'ec2_asg_deployer':
                    environments.append(environment)
            launch_config_names = [environment['launch_config_name'] for environment in environments]
            launch_configs = as_conn.get_all_launch_configurations(names=launch_config_names)
            # for config in launch_configs:
            #     print vars(config)
            launch_config_map = {config.name: config for config in launch_configs}
            print launch_config_map
            for environment in environments:
                if environment['launch_config_name'] in launch_config_map:
                    env_config = launch_config_map[environment['launch_config_name']]
                    environment['launch_config_time'] = str(env_config.created_time)
                    environment['ami_id'] = env_config.image_id
                    environment['instance_monitoring'] = env_config.instance_monitoring.enabled
                    environment['security_groups'] = env_config.security_groups
                    ami = ec_conn.get_image(environment['ami_id'])
                    environment['ami_tags'] = ami.tags
                    environment['ami_name'] = ami.name
                    environment['ami_description'] = ami.description
                else:
                    print "not found?"
                    print environment


            cached_response = environments

        return (jsonify(
            status="success",
            environments=cached_response)
        , 200)
    except Exception as e:
        print e
        return (jsonify(status='error', error="{0}".format(e)), 200)

@app.route('/test', methods = ['GET', 'POST'])
def test():
    data = {}
    if request.data:
        data = simplejson.loads(request.data)
    return (jsonify(state='done', msg='test success', data=data), 200)

@app.route('/trigger', methods = ['GET', 'POST'])
def trigger():
    return_data = {}
    state = 'done'
    msg = "nothing done"
    try:
        if request.method == 'POST':
            json = request.data
            if isinstance(json, basestring):
                json = simplejson.loads(json)
            print json

        return (jsonify(state=state, msg=msg, **return_data), 200)
    except Exception as e:
        print e
        error_coll.insert({'time': int(time.time() * 1000), "where": 'catch_all', "msg": "{0}".format(e)})
        return (jsonify(state='error', error="{0}".format(e)), 500)

if __name__ == '__main__':
    app.debug = True
    app.run(host='0.0.0.0', port=app.config['PORT'])