#!/bin/bash

# Start MongoDB if not already running
MONGO_PROGRAM="/c/Program Files/MongoDB/Server/8.2/bin/mongod.exe"
if pgrep -x mongod >/dev/null 2>&1; then
    echo "✓ MongoDB is already running"
else
    echo "Starting MongoDB..."
    mkdir -p var/mongodb
    cat >var/mongod.cfg <<EOF
storage:
    dbPath: var/mongodb
net:
    bindIp: localhost
    port: 27017
EOF
    "$MONGO_PROGRAM" -f var/mongod.cfg &
    sleep 2
    echo "✓ MongoDB started"
fi

# Activate virtual environment
cd server
source myworld/Scripts/activate

# Start Django server
cd crawlweb
echo "Starting Django development server..."
python manage.py runserver
