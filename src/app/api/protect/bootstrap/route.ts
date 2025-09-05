import { NextRequest, NextResponse } from "next/server";
import { ProtectApi } from "unifi-protect";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl");
    const accessKey = searchParams.get("accessKey");
    const username = searchParams.get("username");
    const password = searchParams.get("password");
    const allowSelfSigned = searchParams.get("allowSelfSigned") === "true";

    const protect = new ProtectApi({ rejectUnauthorized: !allowSelfSigned });
    if (!baseUrl) throw new Error("Missing baseUrl");
    if (accessKey && accessKey.length > 0) {
      protect.setAccessKey(accessKey);
    } else if (username && password) {
      await protect.login(baseUrl.replace(/^https?:\/\//, ""), username, password);
    } else {
      throw new Error("Provide accessKey or username/password");
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


