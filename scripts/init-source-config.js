const { MongoClient } = require("mongodb");
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

const envPath = join(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI");
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db();
  const collection = db.collection("source_configs");

  await collection.createIndex({ name: 1 }, { unique: true });
  await collection.updateOne(
    { name: "truyenfull" },
    {
      $set: {
        domains: ["https://truyenfull.vision", "https://truyenfull.vn", "https://truyenfull.com"],
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  const doc = await collection.findOne({ name: "truyenfull" });
  console.log(
    JSON.stringify(
      {
        database: db.databaseName,
        collection: collection.collectionName,
        source: doc?.name,
        activeDomain: doc?.activeDomain,
        domains: doc?.domains,
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
