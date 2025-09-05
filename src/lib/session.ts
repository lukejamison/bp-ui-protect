import crypto from "node:crypto";

export type SessionData = {
	baseUrl: string;
	accessKey?: string;
	username?: string;
	password?: string;
	allowSelfSigned?: boolean;
	createdAt: number;
};

// Use global to persist sessions across hot reloads in development
const globalForSession = globalThis as unknown as {
	sessionStore: Map<string, SessionData> | undefined;
};

const memoryStore = 
	globalForSession.sessionStore ?? 
	(globalForSession.sessionStore = new Map<string, SessionData>());

export const SESSION_COOKIE = "bp_sess";

export function createSession(data: Omit<SessionData, "createdAt">): string {
	const id = crypto.randomBytes(16).toString("hex");
	const sessionData = { ...data, createdAt: Date.now() };
	memoryStore.set(id, sessionData);
	console.log(`[SESSION] Created session ${id.slice(0, 8)}...`);
	return id;
}

export function getSession(id: string | undefined | null): SessionData | undefined {
	if (!id) return undefined;
	const session = memoryStore.get(id) as SessionData | undefined;
	return session;
}

export function deleteSession(id: string | undefined | null): void {
	if (!id) return;
	memoryStore.delete(id);
}


