import { NextResponse } from "next/server";
import { getPosState, savePosState } from "@/lib/pos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getPosState();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load POS state", error);
    return NextResponse.json({ error: "Failed to load POS state" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const state = await savePosState(body);
    return NextResponse.json({ ok: true, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to save POS state", error);
    return NextResponse.json({ error: "Failed to save POS state" }, { status: 500 });
  }
}
