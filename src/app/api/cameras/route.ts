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


