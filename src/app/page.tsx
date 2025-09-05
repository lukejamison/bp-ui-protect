"use client";

import { useEffect, useRef, useState } from "react";

type Camera = {
	id: string;
	name: string;
	isOnline?: boolean;
};

type Conn = {
	baseUrl: string;
	accessKey?: string;
	username?: string;
	password?: string;
	allowSelfSigned?: boolean;
};

export default function Home() {
	const [conn, setConn] = useState<Conn>({ baseUrl: "" });
	const [connected, setConnected] = useState(false);
	const [cameras, setCameras] = useState<Camera[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	// Load env defaults and auto-connect
	useEffect(() => {
		fetch("/api/env")
			.then((r) => r.json())
			.then((env) => {
				console.log("Loaded env:", env);
				if (env.baseUrl || env.username) {
					setConn(env);
					// Auto-connect if we have base URL and credentials
					if (env.baseUrl && env.username && env.password) {
						console.log("Auto-connecting with env credentials...");
						connectWithCredentials(env);
					}
				}
			})
			.catch((e) => console.error("Failed to load env:", e));
	}, []);

	const connectWithCredentials = async (credentials: Conn) => {
		setError(null);
		console.log("Connecting with credentials:", { ...credentials, password: "***" });
		try {
			const res = await fetch("/api/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			});
			console.log("Session response:", res.status, res.ok);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				console.error("Session error:", body);
				throw new Error(body?.error || `Failed to create session (${res.status})`);
			}
			const r = await fetch(`/api/cameras`, { cache: "no-store" });
			console.log("Cameras response:", r.status, r.ok);
			if (!r.ok) {
				const errorBody = await r.json().catch(() => ({}));
				console.error("Cameras error:", errorBody);
				throw new Error(`Failed to fetch cameras (${r.status})`);
			}
			const data = await r.json();
			console.log("Cameras data:", data);
			setCameras(Array.isArray(data) ? data : []);
			setConnected(true);
		} catch (e: any) {
			console.error("Connection failed:", e);
			setConnected(false);
			setError(String(e?.message || e));
		}
	};

	const connect = () => connectWithCredentials(conn);

	useEffect(() => {
		if (!selectedId || !videoRef.current || !connected) return;
		const src = `/api/stream/${selectedId}`;
		const video = videoRef.current;
		video.src = src;
		video.play().catch(() => {});
	}, [selectedId, connected]);

	return (
		<main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<div className="mx-auto max-w-7xl p-6">
				<header className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold tracking-tight">UniFi Protect Live</h1>
					<div className="text-sm opacity-70">Business camera viewer</div>
				</header>

				<div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-6">
						<input
							className="md:col-span-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
							placeholder="https://unifi-os.local or 10.1.1.x"
							value={conn.baseUrl}
							onChange={(e) => setConn((c) => ({ ...c, baseUrl: e.target.value }))}
						/>
						<input
							className="md:col-span-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
							placeholder="Access Key (optional)"
							value={conn.accessKey || ""}
							onChange={(e) => setConn((c) => ({ ...c, accessKey: e.target.value }))}
						/>
						<input
							className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
							placeholder="Username"
							value={conn.username || ""}
							onChange={(e) => setConn((c) => ({ ...c, username: e.target.value }))}
						/>
						<input
							type="password"
							className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
							placeholder="Password"
							value={conn.password || ""}
							onChange={(e) => setConn((c) => ({ ...c, password: e.target.value }))}
						/>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={!!conn.allowSelfSigned}
								onChange={(e) => setConn((c) => ({ ...c, allowSelfSigned: e.target.checked }))}
							/>
							Allow self-signed TLS
						</label>
						<button
							onClick={connect}
							className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
						>
							{connected ? "Reconnect" : "Connect"}
						</button>
					</div>
					{error && <div className="mt-2 text-sm text-red-600">{error}</div>}
				</div>

				<section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
					<aside className="lg:col-span-3">
						<div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
							<div className="mb-3 text-sm font-medium">Cameras</div>
							<div className="space-y-1">
								{cameras.map((cam) => (
									<button
										key={cam.id}
										onClick={() => setSelectedId(cam.id)}
										className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
											selectedId === cam.id
												? "bg-blue-600 text-white"
												: "hover:bg-neutral-100 dark:hover:bg-neutral-800"
										}`}
									>
										<div className="flex items-center justify-between">
											<span className="truncate">{cam.name}</span>
											{cam.isOnline !== undefined && (
												<span
													className={`ml-2 inline-block h-2 w-2 rounded-full ${
														cam.isOnline ? "bg-green-500" : "bg-red-500"
													}`}
												/>
											)}
										</div>
									</button>
								))}
								{cameras.length === 0 && (
									<div className="text-sm opacity-70">No cameras yet. Connect above.</div>
								)}
							</div>
						</div>
					</aside>

					<section className="lg:col-span-9">
						<div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-200 bg-black shadow-sm dark:border-neutral-800">
							<video ref={videoRef} controls autoPlay playsInline className="size-full" />
						</div>
						{!selectedId && (
							<div className="mt-3 text-sm opacity-70">Select a camera to start streaming.</div>
						)}
					</section>
				</section>
			</div>
		</main>
	);
}
