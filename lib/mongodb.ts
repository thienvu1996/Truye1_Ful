import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

function getMongoClientPromise() {
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  globalForMongo.mongoClientPromise =
    globalForMongo.mongoClientPromise ??
    new MongoClient(uri, {
      maxPoolSize: 10,
    }).connect();

  return globalForMongo.mongoClientPromise;
}

export async function getAppDb() {
  const client = await getMongoClientPromise();
  return client.db();
}
