"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Helper function to detect iOS
function isIOS() {
	return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Helper function to detect Safari
function isSafari() {
	return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// Reusable video player component for MSE streaming
function VideoPlayer({ cameraId, className = "", delay = 0 }: { cameraId: string; className?: string; delay?: number }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [useDirectStream, setUseDirectStream] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const maxRetries = 3;

	useEffect(() => {
		if (!cameraId || !videoRef.current) return;
		
		// Reset states
		setIsLoading(true);
		setHasError(false);
		setErrorMessage("");
		
		// Check if we should use direct stream for iOS/Safari
		const shouldUseDirectStream = isIOS() || (isSafari() && !window.MediaSource);
		setUseDirectStream(shouldUseDirectStream);
		
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

			// Use direct stream for iOS or if MSE is not supported
			if (shouldUseDirectStream || !window.MediaSource) {
				console.log('[VIDEO] Using direct stream approach for mobile/Safari');
				return startDirectStream(video);
			}

			const mediaSource = new MediaSource();
			let sourceBuffer: SourceBuffer | null = null;
			let initReceived = false;
			let isCancelled = false;

					const cleanup = () => {
			isCancelled = true;
			try {
				// Wait a bit for any pending operations to finish
				setTimeout(() => {
					try {
						if (sourceBuffer && !sourceBuffer.updating && mediaSource.readyState === 'open') {
							mediaSource.removeSourceBuffer(sourceBuffer);
						}
						if (mediaSource.readyState === 'open') {
							mediaSource.endOfStream();
						}
						// Only clear video source if it's safe to do so
						if (video && video.readyState !== HTMLMediaElement.HAVE_NOTHING) {
							video.pause();
							video.removeAttribute('src');
							video.load();
						}
					} catch (e) {
						// Normal cleanup errors during rapid switching
					}
				}, 100);
			} catch (e) {
				// Immediate cleanup errors
			}
		};

			cleanupRef.current = cleanup;

		mediaSource.addEventListener('sourceopen', async () => {
			try {
				// Get codec info first with timeout
				const codecController = new AbortController();
				const codecTimeout = setTimeout(() => codecController.abort(), 20000); // 20 second timeout
				
				const codecResponse = await fetch(`/api/stream/${cameraId}/codec`, {
					signal: codecController.signal
				});
				clearTimeout(codecTimeout);
				
				if (!codecResponse.ok) {
					const errorText = await codecResponse.text().catch(() => 'Unknown error');
					throw new Error(`Codec fetch failed (${codecResponse.status}): ${errorText}`);
				}
				const { codec } = await codecResponse.json();
				const mimeType = `video/mp4; codecs="${codec}"`;

				if (isCancelled) return;

				// Create SourceBuffer with correct codec
				sourceBuffer = mediaSource.addSourceBuffer(mimeType);
				sourceBuffer.addEventListener('error', (e) => console.error('[VIDEO] SourceBuffer error:', e));

				// Now start the stream with timeout
				const streamController = new AbortController();
				const streamTimeout = setTimeout(() => streamController.abort(), 30000); // 30 second timeout
				
				const response = await fetch(`/api/stream/${cameraId}`, {
					signal: streamController.signal
				});
				clearTimeout(streamTimeout);
				
				if (!response.ok) {
					const errorText = await response.text().catch(() => 'Unknown error');
					throw new Error(`Stream failed (${response.status}): ${errorText}`);
				}
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
									} catch (e: any) {
					if (!isCancelled) {
						// Only log non-abort errors
						if (e?.name !== 'AbortError') {
							console.error('[VIDEO] Stream processing error:', e);
							setHasError(true);
							setErrorMessage(e?.message || 'Stream processing failed');
						}
						setIsLoading(false);
					}
				}
				};

				processChunks();

			} catch (e: any) {
				if (!isCancelled) {
					// Only log non-abort errors
					if (e?.name !== 'AbortError') {
						console.error('[VIDEO] Stream setup error:', e);
						setHasError(true);
						setErrorMessage(e?.message || 'Failed to setup stream');
					}
					setIsLoading(false);
				}
			}
		});

		video.src = URL.createObjectURL(mediaSource);
		video.play().catch((e: any) => {
			// Only log non-abort errors
			if (e?.name !== 'AbortError' && !isCancelled) {
				console.error('[VIDEO] Play failed:', e);
			}
		});

		return cleanup;
		};

		// Direct stream function for iOS/Safari compatibility
		const startDirectStream = async (video: HTMLVideoElement) => {
			try {
				console.log('[VIDEO] Starting iOS-compatible stream');
				
				// Hide the video element and show a message for now
				video.style.display = 'none';
				setIsLoading(false);
				setHasError(true);
				
				const cleanup = () => {
					// Nothing to clean up for now
				};
				
				cleanupRef.current = cleanup;
				return cleanup;
				
			} catch (error: any) {
				console.error('[VIDEO] iOS stream setup failed:', error);
				setHasError(true);
				setErrorMessage(error?.message || 'Mobile streaming not supported');
				setIsLoading(false);
			}
		};
		
		startStream();
	}, [cameraId, delay, retryCount]);

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
						<div className="text-white text-sm">
							Loading stream...
							{useDirectStream && <div className="text-xs opacity-70">Mobile optimized</div>}
						</div>
					</div>
				</div>
			)}
			{hasError && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
					<div className="text-center px-4">
						<div className="text-red-400 text-sm mb-2">
							{useDirectStream ? "iOS/Mobile streaming not yet supported" : "Failed to load stream"}
						</div>
						{errorMessage && !useDirectStream && (
							<div className="text-xs text-gray-400 mb-3 max-w-md">
								{errorMessage}
							</div>
						)}
						{useDirectStream ? (
							<div className="text-xs text-gray-400 mt-1">
								Please use a desktop browser for now.<br/>
								Mobile support coming soon!
							</div>
						) : retryCount < maxRetries ? (
							<button
								onClick={() => {
									setRetryCount(prev => prev + 1);
									setHasError(false);
									setIsLoading(true);
								}}
								className="px-4 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
							>
								Retry ({retryCount + 1}/{maxRetries})
							</button>
						) : (
							<div className="text-xs text-gray-500">
								Max retries reached. Please refresh the page.
							</div>
						)}
					</div>
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
	const [isConnecting, setIsConnecting] = useState(false);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const connectingRef = useRef(false); // Prevent duplicate connection attempts

	// Load env defaults and auto-connect
	useEffect(() => {
		if (connectingRef.current) return; // Prevent duplicate loads
		
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
			.catch((e) => {
				console.error('[APP] Failed to load env:', e);
			});
	}, []);

	const connectWithCredentials = async (credentials: Conn) => {
		// Prevent duplicate connection attempts
		if (connectingRef.current || isConnecting) {
			console.log('[APP] Connection already in progress, skipping...');
			return;
		}
		
		connectingRef.current = true;
		setIsConnecting(true);
		setError(null);
		
		try {
			console.log('[APP] Starting connection...');
			const res = await fetch("/api/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.error || `Failed to create session (${res.status})`);
			}
			
			console.log('[APP] Session created, fetching cameras...');
			const r = await fetch(`/api/cameras`, { cache: "no-store" });
			if (!r.ok) {
				const errorText = await r.text().catch(() => 'Unknown error');
				throw new Error(`Failed to fetch cameras (${r.status}): ${errorText}`);
			}
			const data = await r.json();
			const cameraList = Array.isArray(data) ? data : [];
			console.log(`[APP] Fetched ${cameraList.length} cameras`);
			setCameras(cameraList);
			
			// Auto-select first 3 cameras for grid view
			if (cameraList.length > 0) {
				const firstThree = new Set(cameraList.slice(0, 3).map(c => c.id));
				setSelectedCameras(firstThree);
			}
			
			setConnected(true);
		} catch (e: any) {
			console.error('[APP] Connection failed:', e);
			setConnected(false);
			setError(String(e?.message || e));
		} finally {
			setIsConnecting(false);
			connectingRef.current = false;
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
					<div className="flex items-center gap-3">
        <Image
							src="/bushards-logo.jpeg" 
							alt="Bushards Logo" 
							width={32}
							height={32}
							className="h-8 w-8 rounded-full"
						/>
						<h1 className="text-xl font-semibold tracking-tight">View Cameras</h1>
					</div>
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
						<div className="text-sm opacity-70">Bushards POS Camera System</div>
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
							disabled={isConnecting}
							className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
						>
							{isConnecting ? "Connecting..." : connected ? "Reconnect" : "Connect"}
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
									// Stagger delays: 0ms, 2000ms, 4000ms, 6000ms (increased to reduce load)
									const delay = index * 2000;
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
