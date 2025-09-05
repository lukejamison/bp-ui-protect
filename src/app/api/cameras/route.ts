import { NextResponse } from "next/server";
import { getProtectClient } from "@/lib/protect";

export async function GET() {
  try {
    const client = getProtectClient();
    const cameras = await client.getCameras();
    const simplified = cameras.map((c: any) => ({
      id: c.id || c.mac || c.uuid,
      name: c.name || c.displayName || c.type || "Camera",
      isOnline: c.isConnected ?? c.state === "CONNECTED",
    }));
    return NextResponse.json(simplified);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch cameras" },
      { status: 500 }
    );
  }
}


