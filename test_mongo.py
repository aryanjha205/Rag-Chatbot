import os
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import certifi
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://ravalmohit390_db_user:MOHIT567@cluster0.ybz53dp.mongodb.net/?appName=Cluster0")

def test_mongo():
    print(f"Testing MongoDB connection...")
    print(f"URI: {MONGO_URI[:30]}...")
    
    try:
        # Using a longer timeout for the test
        client = MongoClient(MONGO_URI, server_api=ServerApi('1'), tlsCAFile=certifi.where(), serverSelectionTimeoutMS=10000)
        
        # Send a ping to confirm a successful connection
        print("Pinging MongoDB...")
        client.admin.command('ping')
        print("Ping successful!")
        
        db = client['rag_database']
        print(f"Accessing database: {db.name}")
        
        # Try to list collections
        colls = db.list_collection_names()
        print(f"Collections found: {colls}")
        
        print("SUCCESS: MongoDB connection is fully functional!")
    except Exception as e:
        print(f"FAILED: {str(e)}")

if __name__ == "__main__":
    test_mongo()
