#!/bin/sh -ex

bower install
rm -rf public/lib/
mkdir public/lib/
ln -s ../../bower_components/angular/ public/lib/angular
ln -s ../../bower_components/angular-local-storage/ public/lib/angular-local-storage
ln -s ../../bower_components/bootstrap/ public/lib/bootstrap
ln -s ../../bower_components/jquery/ public/lib/jquery
ln -s ../../bower_components/momentjs/ public/lib/momentjs
