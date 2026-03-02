import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

interface WatchlistRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  location_role_ids: number[];
  created_at: string;
}

// GET /api/watchlists — list all active watchlists
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const result = await query<WatchlistRow>(
      `SELECT watchlist_id, slug, display_name, location_role_ids, created_at
       FROM helioscta_agents.genscape_noms_watchlists
       WHERE is_active = TRUE
       ORDER BY display_name`
    );
    return NextResponse.json({ watchlists: result.rows });
  } catch (error) {
    console.error("[watchlists] GET error:", error);
    return NextResponse.json(
      { error: "Failed to list watchlists" },
      { status: 500 }
    );
  }
}

// POST /api/watchlists — create a new watchlist
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { name, locationRoleIds } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(locationRoleIds) ||
      locationRoleIds.length === 0 ||
      !locationRoleIds.every((id: unknown) => typeof id === "number" && Number.isInteger(id))
    ) {
      return NextResponse.json(
        { error: "locationRoleIds must be a non-empty array of integers" },
        { status: 400 }
      );
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const result = await query<{ watchlist_id: number; slug: string }>(
      `INSERT INTO helioscta_agents.genscape_noms_watchlists (slug, display_name, location_role_ids, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING watchlist_id, slug`,
      [slug, name.trim(), locationRoleIds, authResult.userEmail]
    );

    return NextResponse.json(
      { watchlist_id: result.rows[0].watchlist_id, slug: result.rows[0].slug },
      { status: 201 }
    );
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A watchlist with that name already exists" },
        { status: 409 }
      );
    }
    console.error("[watchlists] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create watchlist" },
      { status: 500 }
    );
  }
}
