import { NextRequest } from "next/server";
import { ProtectApi } from "unifi-protect";
import { SESSION_COOKIE, getSession } from "@/lib/session";
import { Readable } from "stream";

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
    return new Response(JSON.stringify({ error: "No session" }), { status: 401 });
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
      return new Response(JSON.stringify({ error: "Camera not found" }), { status: 404 });
    }

    // Use official Protect livestream helper (fMP4) per docs.
    const livestream = protect.createLivestream();
    const started = await livestream.start(camera.id ?? cameraId, 0, { useStream: true, requestId: `ui-${Date.now()}` });
    if (!started) {
      return new Response(JSON.stringify({ error: "Failed to start livestream" }), { status: 500 });
    }

    const init = await livestream.getInitSegment();
    const nodeStream = livestream.stream as Readable | null;
    if (!nodeStream) {
      return new Response(JSON.stringify({ error: "No livestream stream available" }), { status: 500 });
    }

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(init));
        const onData = (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk));
        const onEnd = () => controller.close();
        const onError = () => controller.close();
        nodeStream.on("data", onData);
        nodeStream.on("end", onEnd);
        nodeStream.on("error", onError);
      },
      cancel() {
        try { livestream.stop(); } catch {}
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
    console.error(error);
    return new Response(JSON.stringify({ error: error?.message ?? "Stream error" }), { status: 500 });
  }
}


