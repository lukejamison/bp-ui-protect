import { ProtectApi } from "unifi-protect";

export class ProtectClient {
	private protect: ProtectApi;
	private baseUrl: string;
	private allowSelfSigned: boolean;

	constructor() {
		const baseUrl = process.env.PROTECT_BASE_URL;
		const accessKey = process.env.PROTECT_ACCESS_KEY;
		const username = process.env.PROTECT_USERNAME;
		const password = process.env.PROTECT_PASSWORD;
		const allowSelfSigned = String(process.env.PROTECT_ALLOW_SELF_SIGNED) === "true";

		if (!baseUrl) {
			throw new Error("Missing PROTECT_BASE_URL in environment");
		}

		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.allowSelfSigned = allowSelfSigned;
		this.protect = new ProtectApi({
			// disable TLS verify if requested
			rejectUnauthorized: !this.allowSelfSigned,
		});

		// Configure auth
		if (accessKey) {
			this.protect.setAccessKey(accessKey);
		} else if (username && password) {
			// no-op here; will login() with credentials on demand
		}
	}

	private async ensureAuth(): Promise<void> {
		// If access key present, nothing more needed
		if (this.protect.accessKey) return;

		const username = process.env.PROTECT_USERNAME;
		const password = process.env.PROTECT_PASSWORD;
		if (!username || !password) return;

		await this.protect.login(this.baseUrl.replace(/^https?:\/\//, ""), username, password);
	}

	async getBootstrap() {
		await this.ensureAuth();
		await this.protect.getBootstrap();
		return this.protect.bootstrap;
	}

	async getCameras() {
		const bootstrap = await this.getBootstrap();
		const cameras = bootstrap?.cameras ?? [];
		return cameras;
	}
}

export function getProtectClient(): ProtectClient {
	return new ProtectClient();
}


