import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// PATCH /api/watchlists/[watchlistId] — update a watchlist
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { watchlistId } = await params;
  const id = Number(watchlistId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, locationRoleIds } = body;

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      sets.push(`display_name = $${idx++}`);
      values.push(name.trim());
      sets.push(`slug = $${idx++}`);
      values.push(slug);
    }

    if (locationRoleIds !== undefined) {
      if (
        !Array.isArray(locationRoleIds) ||
        locationRoleIds.length === 0 ||
        !locationRoleIds.every((v: unknown) => typeof v === "number" && Number.isInteger(v))
      ) {
        return NextResponse.json(
          { error: "locationRoleIds must be a non-empty array of integers" },
          { status: 400 }
        );
      }
      sets.push(`location_role_ids = $${idx++}`);
      values.push(locationRoleIds);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE helioscta_app.genscape_noms_watchlists SET ${sets.join(", ")} WHERE watchlist_id = $${idx} AND is_active = TRUE RETURNING watchlist_id`;
    const result = await query<{ watchlist_id: number }>(sql, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A watchlist with that name already exists" },
        { status: 409 }
      );
    }
    console.error("[watchlists] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist" },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlists/[watchlistId] — soft-delete a watchlist
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ watchlistId: string }> }
) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { watchlistId } = await params;
  const id = Number(watchlistId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid watchlist ID" }, { status: 400 });
  }

  try {
    const result = await query(
      `UPDATE helioscta_app.genscape_noms_watchlists SET is_active = FALSE, updated_at = NOW() WHERE watchlist_id = $1 AND is_active = TRUE`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[watchlists] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete watchlist" },
      { status: 500 }
    );
  }
}
