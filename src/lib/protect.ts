import axios, { AxiosInstance } from "axios";

type ProtectAuth =
  | { type: "accessKey"; accessKey: string }
  | { type: "credentials"; username: string; password: string };

export class ProtectClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private allowSelfSigned: boolean;
  private auth: ProtectAuth | null;

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
    this.auth = null;

    if (accessKey) {
      this.auth = { type: "accessKey", accessKey };
    } else if (username && password) {
      this.auth = { type: "credentials", username, password };
    }

    this.http = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      // @ts-expect-error Node https agent options
      httpsAgent: this.allowSelfSigned
        ? new (require("https").Agent)({ rejectUnauthorized: false })
        : undefined,
      validateStatus: (s) => s >= 200 && s < 300,
    });
  }

  async ensureAuth(): Promise<void> {
    if (!this.auth) return; // unauthenticated endpoints might still work

    if (this.auth.type === "accessKey") {
      this.http.defaults.headers.common["Authorization"] = `Bearer ${this.auth.accessKey}`;
      return;
    }

    // Credentials: create a session
    await this.http.post("/api/auth/login", {
      username: this.auth.username,
      password: this.auth.password,
      rememberMe: true,
    });
  }

  async getBootstrap() {
    await this.ensureAuth();
    const { data } = await this.http.get("/api/bootstrap");
    return data;
  }

  async getCameras() {
    const bootstrap = await this.getBootstrap();
    // Newer bootstrap: bootstrap.cameras; legacy: bootstrap.nvr.cameras
    const cameras = bootstrap?.cameras ?? bootstrap?.nvr?.cameras ?? [];
    return cameras;
  }
}

export function getProtectClient(): ProtectClient {
  return new ProtectClient();
}


