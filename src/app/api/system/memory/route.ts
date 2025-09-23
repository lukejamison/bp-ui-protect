import { NextRequest, NextResponse } from "next/server";
import { memoryMonitor } from "@/lib/memory-monitor";

export async function GET(req: NextRequest) {
  try {
    const snapshot = memoryMonitor.getMemorySnapshot();
    
    return NextResponse.json({
      memory: snapshot,
      timestamp: new Date().toISOString(),
      message: "Memory usage retrieved successfully"
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to get memory usage" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "gc") {
      memoryMonitor.forceGarbageCollection();
      const snapshot = memoryMonitor.getMemorySnapshot();
      
      return NextResponse.json({
        memory: snapshot,
        timestamp: new Date().toISOString(),
        message: "Garbage collection triggered"
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'gc' to force garbage collection" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to perform memory operation" },
      { status: 500 }
    );
  }
}

