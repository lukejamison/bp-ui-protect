import crypto from "node:crypto";

export type SessionData = {
	baseUrl: string;
	accessKey?: string;
	username?: string;
	password?: string;
	allowSelfSigned?: boolean;
	createdAt: number;
};

const memoryStore = new Map<string, SessionData>();

export const SESSION_COOKIE = "bp_sess";

export function createSession(data: Omit<SessionData, "createdAt">): string {
	const id = crypto.randomBytes(16).toString("hex");
	memoryStore.set(id, { ...data, createdAt: Date.now() });
	return id;
}

export function getSession(id: string | undefined | null): SessionData | undefined {
	if (!id) return undefined;
	return memoryStore.get(id) as SessionData | undefined;
}

export function deleteSession(id: string | undefined | null): void {
	if (!id) return;
	memoryStore.delete(id);
}


