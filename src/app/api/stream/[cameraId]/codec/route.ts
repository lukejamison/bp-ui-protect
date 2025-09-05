import { NextRequest, NextResponse } from "next/server";
import { ProtectApi } from "unifi-protect";
import { SESSION_COOKIE, getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: { cameraId: string } } | { params: Promise<{ cameraId: string }> }
) {
  const resolved = "then" in ctx.params ? await (ctx.params as Promise<{ cameraId: string }>) : (ctx.params as { cameraId: string });
  const { cameraId } = resolved;
  
  const sessId = req.cookies.get(SESSION_COOKIE)?.value;
  const sess = getSession(sessId);
  if (!sess) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }
  
  const { baseUrl, username, password, allowSelfSigned } = sess;
  if (allowSelfSigned) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  const protect = new ProtectApi();

  try {
    if (username && password) {
      await protect.login(String(baseUrl).replace(/^https?:\/\//, ""), username, password);
    } else {
      throw new Error("Invalid session");
    }

    await protect.getBootstrap();
    const cameras = protect.bootstrap?.cameras ?? [];
    const camera = cameras.find((c: any) => c.id === cameraId || c.mac === cameraId || c.uuid === cameraId);
    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    const livestream = protect.createLivestream();
    const started = await livestream.start(camera.id ?? cameraId, 0, { requestId: `codec-${Date.now()}` });
    if (!started) {
      return NextResponse.json({ error: "Failed to start livestream" }, { status: 500 });
    }

    await livestream.getInitSegment();
    const codec = livestream.codec;
    livestream.stop();
    
    return NextResponse.json({ codec });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Codec error" }, { status: 500 });
  }
}
