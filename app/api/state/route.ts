import { NextResponse } from "next/server";
import { getPosState, savePosState } from "@/lib/pos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { state, revision } = await getPosState();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store", ETag: `"${revision}"` },
    });
  } catch (error) {
    console.error("Failed to load POS state", error);
    return NextResponse.json({ error: "Failed to load POS state" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const match = /^"([^"\r\n]+)"$/.exec(request.headers.get("If-Match") ?? "");
  if (!match) return NextResponse.json({ error: "A current revision is required" }, { status: 428 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.menus) || !Array.isArray(body.toppings) || !Array.isArray(body.orders) || !Array.isArray(body.sales)) {
      return NextResponse.json({ error: "Invalid POS state" }, { status: 400 });
    }
    const revision = await savePosState(body, match[1]);
    if (!revision) return NextResponse.json({ error: "Central data has changed" }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store", ETag: `"${revision}"` } });
  } catch (error) {
    console.error("Failed to save POS state", error);
    return NextResponse.json({ error: "Failed to save POS state" }, { status: 500 });
  }
}
