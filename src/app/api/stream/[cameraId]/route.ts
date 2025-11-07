import { NextRequest } from "next/server";
import { SESSION_COOKIE, getSession } from "@/lib/session";
import { protectConnectionManager } from "@/lib/protect-connection";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await ctx.params;
  
  console.log(`[STREAM] Starting stream for camera ${cameraId}`);
  
  const sessId = req.cookies.get(SESSION_COOKIE)?.value;
  const sess = getSession(sessId);
  
  if (!sess) {
    console.error(`[STREAM] No session found`);
    return new Response(JSON.stringify({ error: "No session" }), { status: 401 });
  }
  const { baseUrl, username, password, allowSelfSigned } = sess;
  
  try {
    if (!username || !password) {
      throw new Error("Invalid session - missing credentials");
    }

    const protect = await protectConnectionManager.getConnection(baseUrl, username, password, allowSelfSigned || false);
    const cameras = protect.bootstrap?.cameras ?? [];
    
    const camera = cameras.find((c: any) => c.id === cameraId || c.mac === cameraId || c.uuid === cameraId);
    if (!camera) {
      return new Response(JSON.stringify({ error: "Camera not found" }), { status: 404 });
    }
    console.log(`[STREAM] Starting stream for camera: ${camera.name || camera.id}`);

    // Use connection manager's stream deduplication
    const livestream = protectConnectionManager.getOrCreateStream(cameraId, protect);
    const started = await livestream.start(camera.id ?? cameraId, 0, { requestId: `ui-${Date.now()}` });
    if (!started) {
      return new Response(JSON.stringify({ error: "Failed to start livestream" }), { status: 500 });
    }

    const init = await livestream.getInitSegment();
    const codec = livestream.codec;
    console.log(`[STREAM] Ready - Codec: ${codec}`);

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        let isClosed = false;
        
        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch (e) {
              // Controller already closed
            }
          }
        };
        
        controller.enqueue(new Uint8Array(init));
        
        let segmentCount = 0;
        const onSegment = (data: Buffer) => {
          if (isClosed) return;
          
          segmentCount++;
          if (segmentCount % 30 === 1) { // Log every 30 segments (~1 second)
            console.log(`[STREAM] Streaming... (${segmentCount} segments sent)`);
          }
          
          try {
            controller.enqueue(new Uint8Array(data));
          } catch (e) {
            console.log(`[STREAM] Stream ended for camera ${cameraId}`);
            safeClose();
          }
        };
        
        const onClose = () => {
          console.log(`[STREAM] Livestream closed for camera ${cameraId}`);
          safeClose();
        };
        
        const onError = (error: any) => {
          console.error(`[STREAM] Livestream error for camera ${cameraId}:`, error?.message);
          safeClose();
        };
        
        livestream.on("segment", onSegment);
        livestream.on("close", onClose);
        livestream.on("error", onError);
      },
      cancel() {
        console.log(`[STREAM] Stream cancelled for camera ${cameraId}`);
        try { 
          livestream.stop(); 
          // Remove from active streams
          protectConnectionManager.removeStream(cameraId);
        } catch (e) {
          console.log(`[STREAM] Error stopping livestream:`, e);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error(`[STREAM] Error:`, error?.message);
    return new Response(JSON.stringify({ error: error?.message ?? "Stream error" }), { status: 500 });
  }
}


