#!/bin/sh
# Run like:
# ./bin/setup_virtualenv.sh my_env
# . ./my_env/bin/activate
#
virtualenv ${1}
. ./${1}/bin/activate

pip install simplejson
pip install python-jenkins==0.2.1 --upgrade
pip install pymongo
pip install flask
pip install httplib2
pip install boto --upgrade
