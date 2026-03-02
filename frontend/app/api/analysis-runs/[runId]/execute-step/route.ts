import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { executeStep } from "@/lib/run-orchestrator";
import type { StepName } from "@/lib/types/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/analysis-runs/[runId]/execute-step — execute a single step
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userEmail } = authResult;

  const { runId } = await params;

  try {
    const body = await request.json();
    const { stepName } = body;

    if (!stepName) {
      return NextResponse.json({ error: "stepName is required" }, { status: 400 });
    }

    const step = await executeStep(parseInt(runId, 10), stepName as StepName, userEmail);
    return NextResponse.json({ step });
  } catch (error) {
    console.error("[execute-step] POST error:", error);
    return NextResponse.json({ error: "Failed to execute step" }, { status: 500 });
  }
}
