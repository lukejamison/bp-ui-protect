import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getSession } from "@/lib/session";
import { protectConnectionManager } from "@/lib/protect-connection";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await ctx.params;
  
  const sessId = req.cookies.get(SESSION_COOKIE)?.value;
  const sess = getSession(sessId);
  if (!sess) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }
  
  const { baseUrl, username, password, allowSelfSigned } = sess;
  
  try {
    if (!username || !password) {
      throw new Error("Invalid session - missing credentials");
    }

    // Check cache first - codecs don't change often
    const cachedCodec = protectConnectionManager.getCachedCodec(cameraId);
    if (cachedCodec) {
      return NextResponse.json({ codec: cachedCodec });
    }

    const protect = await protectConnectionManager.getConnection(baseUrl, username, password, allowSelfSigned || false);
    const cameras = protect.bootstrap?.cameras ?? [];
    const camera = cameras.find((c: any) => c.id === cameraId || c.mac === cameraId || c.uuid === cameraId);
    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    console.log(`[CODEC] Fetching codec for camera ${camera.name || cameraId} (not in cache)`);

    const livestream = protect.createLivestream();
    const started = await livestream.start(camera.id ?? cameraId, 0, { requestId: `codec-${Date.now()}` });
    if (!started) {
      return NextResponse.json({ error: "Failed to start livestream" }, { status: 500 });
    }

    await livestream.getInitSegment();
    const codec = livestream.codec;
    livestream.stop();
    
    // Cache the codec for future requests
    protectConnectionManager.cacheCodec(cameraId, codec);
    
    return NextResponse.json({ codec });
  } catch (error: any) {
    console.error(`[CODEC] Error fetching codec for ${cameraId}:`, error?.message);
    return NextResponse.json({ error: error?.message ?? "Codec error" }, { status: 500 });
  }
}
