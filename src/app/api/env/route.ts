import { NextResponse } from "next/server";

export async function GET() {
	const baseUrl = process.env.NVR_IP;
	const username = process.env.PROTECT_USERNAME;
	const password = process.env.PROTECT_PASSWORD;
	
	console.log("ENV Debug:", { 
		baseUrl, 
		username: username ? "***" : undefined, 
		password: password ? "***" : undefined,
		allowSelfSigned: process.env.PROTECT_ALLOW_SELF_SIGNED 
	});
	
	return NextResponse.json({
		baseUrl: baseUrl || "",
		username: username || "",
		password: password || "",
		allowSelfSigned: true, // Default to true since you mentioned self-signed
	});
}
