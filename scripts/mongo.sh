mkdir -p var/mongodb
MONGO_PROGRAM="/c/Program Files/MongoDB/Server/8.2/bin/mongod.exe"
cat >var/mongod.cfg <<EOF
storage:
    dbPath: var/mongodb
net:
    bindIp: localhost
    port: 27017
EOF
"$MONGO_PROGRAM" -f var/mongod.cfg