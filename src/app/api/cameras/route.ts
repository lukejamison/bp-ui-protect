import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSession } from "@/lib/session";
import { protectConnectionManager } from "@/lib/protect-connection";

export async function GET(req: NextRequest) {
  try {
    const sessId = req.cookies.get(SESSION_COOKIE)?.value;
    const sess = getSession(sessId);
    if (!sess) throw new Error("No session");
    const { baseUrl, username, password, allowSelfSigned } = sess;
    if (!baseUrl) throw new Error("Invalid session: baseUrl");
    if (!username || !password) throw new Error("Invalid session: missing credentials");

    const protect = await protectConnectionManager.getConnection(baseUrl, username, password, allowSelfSigned || false);
    const cameras = protect.bootstrap?.cameras ?? [];
    const simplified = cameras.map((c: unknown) => {
      const camera = c as Record<string, unknown>;
      return {
        id: (camera.id || camera.mac || camera.uuid) as string,
        name: (camera.name || camera.displayName || camera.type || "Camera") as string,
        isOnline: (camera.isConnected ?? camera.state === "CONNECTED") as boolean,
      };
    });
    return NextResponse.json(simplified);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to fetch cameras" },
      { status: 500 }
    );
  }
}


