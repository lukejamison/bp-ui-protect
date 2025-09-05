import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, deleteSession, getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { baseUrl, accessKey, username, password, allowSelfSigned } = body ?? {};
		if (!baseUrl) return NextResponse.json({ error: "baseUrl required" }, { status: 400 });
		if (!accessKey && !(username && password)) {
			return NextResponse.json({ error: "accessKey or username/password required" }, { status: 400 });
		}
		const id = createSession({ baseUrl, accessKey, username, password, allowSelfSigned: !!allowSelfSigned });
		const res = NextResponse.json({ ok: true });
		res.cookies.set(SESSION_COOKIE, id, {
			httpOnly: true,
			secure: true,
			path: "/",
			sameSite: "lax",
			maxAge: 60 * 60, // 1 hour
		});
		return res;
	} catch (error: any) {
		return NextResponse.json({ error: error?.message ?? "Session error" }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	const id = req.cookies.get(SESSION_COOKIE)?.value;
	deleteSession(id);
	const res = NextResponse.json({ ok: true });
	res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
	return res;
}


