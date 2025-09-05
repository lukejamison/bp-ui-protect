import { NextResponse } from "next/server";
import { getProtectClient } from "@/lib/protect";

export async function GET() {
  try {
    const client = getProtectClient();
    const bootstrap = await client.getBootstrap();
    return NextResponse.json(bootstrap);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch Protect bootstrap" },
      { status: 500 }
    );
  }
}


