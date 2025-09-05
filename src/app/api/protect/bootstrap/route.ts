import { NextRequest, NextResponse } from "next/server";
import { ProtectApi } from "unifi-protect";
import { SESSION_COOKIE, getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const sessId = req.cookies.get(SESSION_COOKIE)?.value;
    const sess = getSession(sessId);
    if (!sess) throw new Error("No session");
    const { baseUrl, username, password, allowSelfSigned } = sess;
    if (!baseUrl) throw new Error("Invalid session: baseUrl");
    if (allowSelfSigned) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    const protect = new ProtectApi();
    if (username && password) {
      await protect.login(String(baseUrl).replace(/^https?:\/\//, ""), username, password);
    } else {
      throw new Error("Invalid session: missing credentials");
    }

    await protect.getBootstrap();
    return NextResponse.json(protect.bootstrap);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch Protect bootstrap" },
      { status: 500 }
    );
  }
}


