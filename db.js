const { MongoClient } = require("mongodb");

const uri = "YOUR_CONNECTION_STRING_HERE";

const client = new MongoClient(uri);

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Connection failed:", err);
  }
}

connectDB();