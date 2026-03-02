import { NextResponse } from "next/server";
import { auth } from "@/auth";

export interface AuthResult {
  userEmail: string;
}

/**
 * Require authentication on an API route.
 * Returns { userEmail } on success, or a 401 NextResponse on failure.
 * Skips auth when AUTH_MICROSOFT_ENTRA_ID_ID is not set (local dev).
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  // Local dev bypass — when Entra ID is not configured, skip auth
  if (!process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return { userEmail: "dev@localhost" };
  }

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { userEmail: session.user.email };
}

/** Type guard to check if requireAuth returned an error response */
export function isAuthError(
  result: AuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
