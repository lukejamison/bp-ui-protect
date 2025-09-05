declare module "mp4frag" {
	import { EventEmitter } from "events";

	export default class Mp4Frag extends EventEmitter implements NodeJS.WritableStream {
		readonly mime?: string;
		readonly initialization?: Buffer;
		readonly segment?: Buffer;
		writable: boolean;
		constructor(options?: unknown);
		on(event: "initialized" | "segment", listener: (data: Buffer) => void): this;
		write(buffer: any, cb?: (error?: Error | null) => void): boolean;
		end(cb?: () => void): void;
		end(buffer: any, cb?: () => void): void;
		end(str: any, encoding?: string, cb?: () => void): void;
	}
}


