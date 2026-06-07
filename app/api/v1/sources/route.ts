import { NextResponse } from "next/server";
import { SOURCES, getSourceHealth } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET() {
  const sourceEntries = await Promise.all(
    Object.values(SOURCES).map(async (source) => ({
      ...source,
      health: await getSourceHealth(source.name),
    })),
  );

  return NextResponse.json({
    success: true,
    data: sourceEntries,
  });
}
