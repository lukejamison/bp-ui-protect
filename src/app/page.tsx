"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Camera = {
	id: string;
	name: string;
	isOnline?: boolean;
};

export default function Home() {
	const [cameras, setCameras] = useState<Camera[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		fetch("/api/cameras")
			.then((r) => r.json())
			.then((data) => setCameras(Array.isArray(data) ? data : []))
			.catch((e) => setError(String(e?.message || e)));
	}, []);

	useEffect(() => {
		if (!selectedId || !videoRef.current) return;
		const src = `/api/stream/${selectedId}`;
		const video = videoRef.current;
		video.src = src;
		video.play().catch(() => {});
	}, [selectedId]);

	return (
		<main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<div className="mx-auto max-w-7xl p-6">
				<header className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold tracking-tight">UniFi Protect Live</h1>
					<div className="text-sm opacity-70">Business camera viewer</div>
				</header>

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
									<div className="text-sm opacity-70">No cameras found</div>
								)}
								{error && <div className="text-sm text-red-600">{error}</div>}
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
