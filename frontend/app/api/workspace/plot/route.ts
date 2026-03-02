import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:1111";

// POST /api/workspace/plot — proxy to backend for plot generation
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();

    const res = await fetch(`${PYTHON_API_URL}/api/workspace/plot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[workspace/plot] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate plot" },
      { status: 500 }
    );
  }
}
