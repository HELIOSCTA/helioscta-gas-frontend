import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // Skip auth enforcement if Entra ID is not configured (local dev)
  if (process.env.BYPASS_AUTH === "true" || !process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon\\.ico).*)"],
};
