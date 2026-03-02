import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// GET /api/analysis-packs/[packId] — detail: metadata + inputs + last 10 runs
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { packId } = await params;

  try {
    const packResult = await query(
      `SELECT * FROM helioscta_agents.analysis_packs WHERE pack_id = $1 AND is_active = TRUE`,
      [packId]
    );
    if (packResult.rows.length === 0) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }

    const inputsResult = await query(
      `SELECT * FROM helioscta_agents.analysis_pack_inputs WHERE pack_id = $1 ORDER BY sort_order`,
      [packId]
    );

    const runsResult = await query(
      `SELECT * FROM helioscta_agents.pack_runs WHERE pack_id = $1 ORDER BY run_date DESC, started_at DESC LIMIT 10`,
      [packId]
    );

    const pack = packResult.rows[0] as { slug: string };
    const inputs = inputsResult.rows as Array<{
      file_path: string | null;
      relative_path: string | null;
      category: string | null;
      input_type: string | null;
    }>;
    const runs = runsResult.rows as Array<{ run_output_path: string | null }>;

    const packPath = `.prompts/${pack.slug}`;
    const toPackPath = (relativePath: string | null | undefined): string | null => {
      if (!relativePath) return null;
      return `${packPath}/${relativePath.replace(/^\/+/, "")}`;
    };

    const coreSqlPaths = inputs
      .filter((input) => {
        const rel = input.relative_path ?? input.file_path ?? "";
        return (
          input.category === "core_sql" ||
          (input.input_type === "sql" && rel.startsWith("sql/core/"))
        );
      })
      .map((input) => toPackPath(input.relative_path ?? input.file_path))
      .filter((p): p is string => !!p);

    const analysisPaths = {
      working: `${packPath}/analysis/working.md`,
      final: `${packPath}/analysis/final.md`,
    };

    const latestRunPath = runs[0]?.run_output_path ?? null;

    return NextResponse.json({
      pack,
      inputs,
      runs,
      pack_path: packPath,
      core_sql_paths: coreSqlPaths,
      analysis_paths: analysisPaths,
      latest_run_path: latestRunPath,
    });
  } catch (error) {
    console.error("[analysis-packs/:id] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch pack details" }, { status: 500 });
  }
}

// PATCH /api/analysis-packs/[packId] — update pack metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { packId } = await params;

  try {
    const body = await request.json();
    const { displayName, description, isActive } = body;

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (displayName !== undefined) {
      sets.push(`display_name = $${idx++}`);
      values.push(displayName);
    }
    if (description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(description);
    }
    if (isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(isActive);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(packId);

    await query(
      `UPDATE helioscta_agents.analysis_packs SET ${sets.join(", ")} WHERE pack_id = $${idx}`,
      values
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[analysis-packs/:id] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update pack" }, { status: 500 });
  }
}
