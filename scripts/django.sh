#!/bin/bash

cd server
. myworld/Scripts/activate
cd crawlweb
python manage.py runserver
