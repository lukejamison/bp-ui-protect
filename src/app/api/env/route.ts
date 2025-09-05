import { NextResponse } from "next/server";

export async function GET() {
	const baseUrl = process.env.NVR_IP;
	const username = process.env.PROTECT_USERNAME;
	const password = process.env.PROTECT_PASSWORD;
	
	return NextResponse.json({
		baseUrl: baseUrl || "",
		username: username || "",
		password: password || "",
		allowSelfSigned: true,
	});
}
