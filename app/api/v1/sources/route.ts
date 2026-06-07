import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: Object.values(SOURCES),
  });
}
