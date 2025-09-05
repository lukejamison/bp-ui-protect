import { NextRequest } from "next/server";
import { spawn } from "child_process";
import Mp4Frag from "mp4frag";
import { ProtectApi } from "unifi-protect";
import { SESSION_COOKIE, getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { cameraId: string } }
) {
  const { cameraId } = params;
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

    // Determine RTSP URL
    const rtspBase = process.env.PROTECT_RTSP_BASE;
    let rtspUrl: string | null = null;
    const rtspEntries = camera?.rtspUris || camera?.channels || [];
    if (Array.isArray(rtspEntries)) {
      const firstRtsp = rtspEntries.find((e: any) => typeof e === "string" && e.startsWith("rtsp"));
      if (firstRtsp) rtspUrl = firstRtsp;
      const firstChannel = rtspEntries.find((ch: any) => typeof ch?.rtspAlias === "string");
      if (!rtspUrl && firstChannel && rtspBase) {
        rtspUrl = `${rtspBase}/${firstChannel.rtspAlias}`;
      }
    }

    if (!rtspUrl) {
      return new Response(JSON.stringify({ error: "No RTSP URL found for camera. Enable RTSP in Protect." }), { status: 400 });
    }

    // Transmux RTSP (H264) to fMP4 for MSE via mp4frag
    const mp4frag = new Mp4Frag();
    const ffmpegArgs = [
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-an",
      "-c:v", "copy",
      "-f", "mp4",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-reset_timestamps", "1",
      "pipe:1",
    ];

    const ff = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
    ff.stdout?.pipe(mp4frag);

    // Consume stderr to avoid buffer backpressure
    ff.stderr?.on("data", () => {});

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        function onInit(data: Buffer) {
          controller.enqueue(new Uint8Array(data));
        }
        function onSegment(data: Buffer) {
          controller.enqueue(new Uint8Array(data));
        }
        mp4frag.on("initialized", onInit);
        mp4frag.on("segment", onSegment);
        ff.on("close", () => controller.close());
        ff.on("error", () => controller.close());
      },
      cancel() {
        ff.kill("SIGINT");
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
    return new Response(JSON.stringify({ error: error?.message ?? "Stream error" }), { status: 500 });
  }
}


