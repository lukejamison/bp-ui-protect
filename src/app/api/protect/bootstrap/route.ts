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

    const key = `${baseUrl}:${username}`;
    
    // Try cache first
    const cached = protectConnectionManager.getCachedBootstrap(key);
    if (cached) {
      return NextResponse.json(cached);
    }

    // If not cached, get from connection (which will cache it)
    const protect = await protectConnectionManager.getConnection(baseUrl, username, password, allowSelfSigned || false);
    return NextResponse.json(protect.bootstrap);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch Protect bootstrap" },
      { status: 500 }
    );
  }
}


