import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { validateReadOnlySql } from "@/lib/sql-validator";

export const dynamic = "force-dynamic";

// POST /api/sql/validate — check if SQL is read-only
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { sqlText } = body;

    if (!sqlText) {
      return NextResponse.json({ error: "sqlText is required" }, { status: 400 });
    }

    const result = validateReadOnlySql(sqlText);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sql/validate] POST error:", error);
    return NextResponse.json({ error: "Failed to validate SQL" }, { status: 500 });
  }
}
