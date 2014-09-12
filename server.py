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
    # JENKINS_URL='http://jenkins-staging.devaws.dataxu.net',
    JENKINS_USER='admin_user',
    JENKINS_USER_TOKEN='changeme',
    MONGO_DB_HOST='localhost',
    MONGO_DB_PORT=27017,
    MONGO_DB_NAME='dxmanager-database',
    PORT= 5001,
    DEBUG=True,
    TEST=False
))

client = MongoClient(app.config['MONGO_DB_HOST'], app.config['MONGO_DB_PORT'])
db = client[app.config['MONGO_DB_NAME']]

environments_coll = db.events

users={'mferrante': '5d90548825cc8c607fbc8737fb73802d'}

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
    aws_api_requests = 0
    jenkins_api_requests = 0

    try:
        if not cached_response or request.args.get('update_cache', False):
            print "Updating cached_response"
            ec_conn = boto.ec2.connect_to_region('us-east-1')
            as_conn = boto.ec2.autoscale.connect_to_region('us-east-1')
            groups =  as_conn.get_all_groups()
            aws_api_requests += 1
            for group in groups:
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
            aws_api_requests += 1
            launch_config_map = {config.name: config for config in launch_configs}
            node_type_map = {}

            for environment in environments:
                if environment['launch_config_name'] in launch_config_map:
                    env_config = launch_config_map[environment['launch_config_name']]
                    environment['launch_config_time'] = str(env_config.created_time)
                    environment['ami_id'] = env_config.image_id
                    environment['instance_monitoring'] = env_config.instance_monitoring.enabled
                    environment['security_groups'] = env_config.security_groups
                    ami = ec_conn.get_image(environment['ami_id'])
                    aws_api_requests += 1
                    environment['ami_tags'] = ami.tags
                    environment['ami_name'] = ami.name
                    environment['ami_description'] = ami.description
                    environment['ami_candidates'] = []
                    if ami.tags['node_type'] not in node_type_map:
                        potential_amis = ec_conn.get_all_images(filters={'tag-key': 'node_type', 'tag-value': ami.tags['node_type']})
                        aws_api_requests += 1
                        node_type_map[ami.tags['node_type']] = potential_amis

                    for ami in node_type_map[ami.tags['node_type']]:
                        environment['ami_candidates'].append({
                            'id': ami.id,
                            'tags': ami.tags,
                            'name': ami.name,
                            'description': ami.description
                            })
                else:
                    print "not found?"
                    print environment


            if len(users.keys()) > 0:
                print "Looking up in jenkins as {0}".format(users.keys()[0])
                jenkins_instance = Jenkins(app.config['JENKINS_URL'],
                    users.keys()[0],
                    users[users.keys()[0]])

                for environment in environments:
                    environment['job'] = get_jenkins_job(jenkins_instance, environment['tags']['build_url'])
                    jenkins_api_requests += 1;

                print environments
                print "Done with jenkins"

            cached_response = environments

        print "{0} jenkins api requests made".format(jenkins_api_requests)
        print "{0} aws api requests made".format(aws_api_requests)

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
    return (jsonify(status='done', msg='test success', data=data), 200)


@app.route('/auth', methods = ['POST'])
def auth():
    return_data = {}
    state = 'success'
    msg = "nothing done"
    try:
        if request.method == 'POST':
            json = request.data
            if isinstance(json, basestring):
                json = simplejson.loads(json)

            jenkins_instance = Jenkins(app.config['JENKINS_URL'],
                json['username'],
                json['api_token'])
            jobs = jenkins_instance.get_jobs();
            users[json['username']] = json['api_token'];
        print "Authentication Succeeded"
        return (jsonify(status=state, msg="correct credentials", **return_data), 200)
    except Exception as e:
        print "Authentication Failed"
        print e
        return (jsonify(status='error', error="credentials are wrong for {0}".format(app.config['JENKINS_URL'])), 200)


def get_jenkins_job(jenkins_instance, url):
    job_search = re.search('job/([a-zA-Z\-_]+)/([0-9]+)', url)
    job = False
    if job_search:
        job = {}
        job_name = job_search.group(1)
        build_number = int(job_search.group(2))
        job['name'] = job_name
        job['number'] = build_number

        build_info = jenkins_instance.get_build_info(job_name, build_number)
        parameter_action = False
        parameters = {}
        
        for action in build_info['actions']:
            if 'parameters' in action:
                parameter_action = action
        if parameter_action:
            for param in parameter_action['parameters']:
                parameters[param['name']] = param['value']
        job['parameters'] = parameters

    return job


@app.route('/run_job', methods = ['POST'])
def trigger():
    return_data = {}
    state = 'error'
    msg = "nothing done"
    try:
        if request.method == 'POST':
            json = request.data
            if isinstance(json, basestring):
                json = simplejson.loads(json)
            print json

            jenkins_instance = Jenkins(app.config['JENKINS_URL'],
                json['username'],
                json['api_token'])

            if 'job' in json and 'name' in json['job'] and 'parameters' in json['job']:

                jenkins_instance.build_job(json['job']['name'], parameters=json['job']['parameters'])

                return_data['job_name'] = json['job']['name']
                return_data['job_parameters'] = json['job']['parameters']
                msg = "Triggered {0} on {1} with {2}".format(return_data['job_name'], app.config['JENKINS_URL'], return_data['job_parameters'])
                return_data['feedback'] = [msg]
                state = 'success'
            else:
                print "HERE"
                return_data['error'] = "previous deploy has no job information, unable to use."

        print return_data
        return (jsonify(status=state, msg=msg, **return_data), 200)
    except Exception as e:
        print e
        return (jsonify(status='error', error="{0}".format(e)), 200)

if __name__ == '__main__':
    app.debug = True
    app.run(host='0.0.0.0', port=app.config['PORT'])
