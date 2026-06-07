import { NextResponse } from "next/server";
import { SOURCES, getSourceHealth } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET() {
  const truyenfullHealth = await getSourceHealth("truyenfull");

  return NextResponse.json({
    success: true,
    data: Object.values(SOURCES).map((source) => ({
      ...source,
      health: source.name === "truyenfull" ? truyenfullHealth : undefined,
    })),
  });
}
