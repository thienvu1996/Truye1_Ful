import type { Collection } from "mongodb";
import { getAppDb } from "@/lib/mongodb";
import type { SupportedSource } from "@/lib/sources";

export type SourceConfigDocument = {
  name: SupportedSource;
  activeDomain?: string;
  lastCheckedAt?: string;
  redirectedFrom?: string;
  domains: string[];
  updatedAt: Date;
  createdAt: Date;
};

let indexesReady = false;

async function getCollection(): Promise<Collection<SourceConfigDocument>> {
  const db = await getAppDb();
  const collection = db.collection<SourceConfigDocument>("source_configs");

  if (!indexesReady) {
    await collection.createIndex({ name: 1 }, { unique: true });
    indexesReady = true;
  }

  return collection;
}

export async function getSourceConfig(name: SupportedSource) {
  const collection = await getCollection();
  return collection.findOne({ name });
}

export async function saveSourceConfig(
  name: SupportedSource,
  config: Pick<SourceConfigDocument, "domains"> &
    Partial<Pick<SourceConfigDocument, "activeDomain" | "lastCheckedAt" | "redirectedFrom">>,
) {
  const collection = await getCollection();
  const now = new Date();

  await collection.updateOne(
    { name },
    {
      $set: {
        ...config,
        updatedAt: now,
      },
      $setOnInsert: {
        name,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return collection.findOne({ name });
}
