"use client";

import { useEffect, useRef, useState } from "react";

// Reusable video player component for MSE streaming
function VideoPlayer({ cameraId, className = "", delay = 0 }: { cameraId: string; className?: string; delay?: number }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		if (!cameraId || !videoRef.current) return;
		
		// Reset states
		setIsLoading(true);
		setHasError(false);
		
		// Add delay for staggered loading
		const startStream = async () => {
			if (delay > 0) {
				await new Promise(resolve => setTimeout(resolve, delay));
			}
			
			const video = videoRef.current;
			if (!video) return;

			// Clean up previous stream immediately
			if (cleanupRef.current) {
				cleanupRef.current();
				cleanupRef.current = null;
			}

			if (!window.MediaSource) {
				console.error('[VIDEO] MediaSource not supported');
				setHasError(true);
				setIsLoading(false);
				return;
			}

			const mediaSource = new MediaSource();
			let sourceBuffer: SourceBuffer | null = null;
			let initReceived = false;
			let isCancelled = false;

			const cleanup = () => {
				isCancelled = true;
				try {
					if (sourceBuffer && !sourceBuffer.updating) {
						mediaSource.removeSourceBuffer(sourceBuffer);
					}
					if (mediaSource.readyState === 'open') {
						mediaSource.endOfStream();
					}
					video.src = '';
				} catch (e) {
					// Normal cleanup errors
				}
			};

			cleanupRef.current = cleanup;

		mediaSource.addEventListener('sourceopen', async () => {
			try {
				// Get codec info first
				const codecResponse = await fetch(`/api/stream/${cameraId}/codec`);
				if (!codecResponse.ok) throw new Error(`Codec fetch failed: ${codecResponse.status}`);
				const { codec } = await codecResponse.json();
				const mimeType = `video/mp4; codecs="${codec}"`;

				// Create SourceBuffer with correct codec
				sourceBuffer = mediaSource.addSourceBuffer(mimeType);
				sourceBuffer.addEventListener('error', (e) => console.error('[VIDEO] SourceBuffer error:', e));

				// Now start the stream
				const response = await fetch(`/api/stream/${cameraId}`);
				if (!response.ok) throw new Error(`Stream failed: ${response.status}`);
				if (!response.body) throw new Error('No response body');

				const reader = response.body.getReader();

				const processChunks = async () => {
					try {
						while (!isCancelled) {
							const { done, value } = await reader.read();
							if (done || isCancelled) break;

							if (sourceBuffer && !sourceBuffer.updating && !isCancelled) {
								sourceBuffer.appendBuffer(value);
								if (!initReceived) {
									initReceived = true;
									setIsLoading(false); // Hide loading spinner on first chunk
								}
							}

							// Wait for buffer to finish updating
							if (sourceBuffer && !isCancelled) {
								await new Promise(resolve => {
									if (!sourceBuffer!.updating) {
										resolve(void 0);
									} else {
										sourceBuffer!.addEventListener('updateend', resolve, { once: true });
									}
								});
							}
						}
									} catch (e) {
					if (!isCancelled) {
						console.error('[VIDEO] Stream processing error:', e);
						setHasError(true);
						setIsLoading(false);
					}
				}
				};

				processChunks();

			} catch (e) {
				console.error('[VIDEO] Stream setup error:', e);
				setHasError(true);
				setIsLoading(false);
			}
		});

		video.src = URL.createObjectURL(mediaSource);
		video.play().catch(e => console.error('[VIDEO] Play failed:', e));

		return cleanup;
		};
		
		startStream();
	}, [cameraId, delay]);

	return (
		<div className={`relative ${className}`}>
			<video 
				ref={videoRef} 
				controls 
				autoPlay 
				playsInline 
				muted 
				className="w-full h-full"
				style={{ display: isLoading || hasError ? 'none' : 'block' }}
			/>
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
					<div className="flex flex-col items-center space-y-2">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
						<div className="text-white text-sm">Loading stream...</div>
					</div>
				</div>
			)}
			{hasError && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
					<div className="text-red-400 text-sm">Failed to load stream</div>
				</div>
			)}
		</div>
	);
}

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
	const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());
	const [viewMode, setViewMode] = useState<"single" | "grid">("grid");
	const [error, setError] = useState<string | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	// Load env defaults and auto-connect
	useEffect(() => {
		fetch("/api/env")
			.then((r) => r.json())
			.then((env) => {
				if (env.baseUrl || env.username) {
					setConn(env);
					// Auto-connect if we have base URL and credentials
					if (env.baseUrl && env.username && env.password) {
						connectWithCredentials(env);
					}
				}
			})
			.catch(() => {}); // ignore errors
	}, []);

	const connectWithCredentials = async (credentials: Conn) => {
		setError(null);
		try {
			const res = await fetch("/api/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error || `Failed to create session (${res.status})`);
			}
			const r = await fetch(`/api/cameras`, { cache: "no-store" });
			if (!r.ok) {
				throw new Error(`Failed to fetch cameras (${r.status})`);
			}
			const data = await r.json();
			const cameraList = Array.isArray(data) ? data : [];
			setCameras(cameraList);
			
			// Auto-select first 3 cameras for grid view
			if (cameraList.length > 0) {
				const firstThree = new Set(cameraList.slice(0, 3).map(c => c.id));
				setSelectedCameras(firstThree);
			}
			
			setConnected(true);
		} catch (e: any) {
			setConnected(false);
			setError(String(e?.message || e));
		}
	};

	const connect = () => connectWithCredentials(conn);

	const toggleCameraSelection = (cameraId: string) => {
		setSelectedCameras(prev => {
			const newSet = new Set(prev);
			if (newSet.has(cameraId)) {
				newSet.delete(cameraId);
			} else if (newSet.size < 4) {
				newSet.add(cameraId);
			}
			return newSet;
		});
	};

	const clearCameraSelection = () => {
		setSelectedCameras(new Set());
	};


  return (
		<main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<div className="mx-auto max-w-7xl p-6">
				<header className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold tracking-tight">UniFi Protect Live</h1>
					<div className="flex items-center gap-4">
						<div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800">
							<button
								onClick={() => setViewMode("single")}
								className={`px-3 py-1 text-sm rounded-l-lg transition-colors ${
									viewMode === "single"
										? "bg-blue-600 text-white"
										: "hover:bg-neutral-100 dark:hover:bg-neutral-800"
								}`}
							>
								Single
							</button>
							<button
								onClick={() => setViewMode("grid")}
								className={`px-3 py-1 text-sm rounded-r-lg transition-colors ${
									viewMode === "grid"
										? "bg-blue-600 text-white"
										: "hover:bg-neutral-100 dark:hover:bg-neutral-800"
								}`}
							>
								Grid (4)
							</button>
						</div>
						<div className="text-sm opacity-70">Business camera viewer</div>
					</div>
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
							<div className="mb-3 flex items-center justify-between">
								<div className="text-sm font-medium">Cameras</div>
								{viewMode === "grid" && selectedCameras.size > 0 && (
									<button
										onClick={clearCameraSelection}
										className="text-xs text-blue-600 hover:text-blue-700"
									>
										Clear ({selectedCameras.size})
									</button>
								)}
							</div>
							<div className="space-y-1">
								{cameras.map((cam) => (
									<div
										key={cam.id}
										className={`w-full rounded-md px-3 py-2 transition-colors cursor-pointer ${
											viewMode === "single"
												? selectedId === cam.id
													? "bg-blue-600 text-white"
													: "hover:bg-neutral-100 dark:hover:bg-neutral-800"
												: selectedCameras.has(cam.id)
												? "bg-blue-100 dark:bg-blue-900"
												: "hover:bg-neutral-100 dark:hover:bg-neutral-800"
										}`}
										onClick={() => viewMode === "single" ? setSelectedId(cam.id) : toggleCameraSelection(cam.id)}
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												{viewMode === "grid" && (
													<input
														type="checkbox"
														checked={selectedCameras.has(cam.id)}
														onChange={() => toggleCameraSelection(cam.id)}
														disabled={!selectedCameras.has(cam.id) && selectedCameras.size >= 4}
														className="rounded border-neutral-300"
													/>
												)}
												<span className="truncate text-sm">{cam.name}</span>
											</div>
											{cam.isOnline !== undefined && (
												<span
													className={`ml-2 inline-block h-2 w-2 rounded-full ${
														cam.isOnline ? "bg-green-500" : "bg-red-500"
													}`}
												/>
											)}
										</div>
									</div>
								))}
								{cameras.length === 0 && (
									<div className="text-sm opacity-70">No cameras yet. Connect above.</div>
								)}
								{error && <div className="text-sm text-red-600">{error}</div>}
								{viewMode === "grid" && (
									<div className="mt-3 text-xs opacity-70">
										Select up to 4 cameras for grid view
									</div>
								)}
							</div>
						</div>
					</aside>

					<section className="lg:col-span-9">
						{viewMode === "single" ? (
							<>
								<div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-200 bg-black shadow-sm dark:border-neutral-800">
									{selectedId && connected ? (
										<VideoPlayer cameraId={selectedId} className="size-full" />
									) : (
										<div className="flex size-full items-center justify-center text-neutral-500">
											{!connected ? "Connect to view cameras" : "Select a camera to start streaming"}
										</div>
									)}
								</div>
							</>
						) : (
							<div className="grid grid-cols-2 gap-4">
								{Array.from(selectedCameras).slice(0, 4).map((cameraId, index) => {
									const camera = cameras.find(c => c.id === cameraId);
									// Stagger delays: 0ms, 1000ms, 2000ms, 3000ms
									const delay = index * 1000;
									return (
										<div key={cameraId} className="aspect-video overflow-hidden rounded-lg border border-neutral-200 bg-black shadow-sm dark:border-neutral-800">
											<div className="relative size-full">
												{connected ? (
													<VideoPlayer cameraId={cameraId} className="size-full" delay={delay} />
												) : (
													<div className="flex size-full items-center justify-center text-neutral-500">
														Connect to view
													</div>
												)}
												<div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
													{camera?.name || cameraId}
												</div>
											</div>
										</div>
									);
								})}
								{selectedCameras.size === 0 && (
									<div className="col-span-2 flex aspect-video items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
										Select cameras to view in grid mode
									</div>
								)}
							</div>
						)}
					</section>
				</section>
			</div>
		</main>
  );
}
