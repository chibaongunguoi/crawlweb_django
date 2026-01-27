(
    cd server
    . myworld/Scripts/activate
    pip install -r requirements.txt
)

scripts/mongo.sh &

MONGODB_TOOLS_FOLDER="/c/Program Files/MongoDB/Tools/100/bin"
"$MONGODB_TOOLS_FOLDER/mongorestore.exe" --uri=mongodb://localhost:27017/pbl4_db --db=pbl4_db --drop ./database/seed/pbl4_db