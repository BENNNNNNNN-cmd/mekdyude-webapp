import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

let cachedKey: Uint8Array | null = null;
function getEncodedKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is required");
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const PUBLIC_PATHS = ["/login"];

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function apiUnauthorizedResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("session")?.value;

  if (!sessionToken) {
    if (isApiPath(pathname)) {
      return apiUnauthorizedResponse("Session expirée. Veuillez vous reconnecter.");
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(sessionToken, getEncodedKey(), { algorithms: ["HS256"] });

    // Check idle timeout — if lastActivity exists and is too old, force logout
    const lastActivity = payload.lastActivity as number | undefined;
    if (lastActivity && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      const response = isApiPath(pathname)
        ? apiUnauthorizedResponse("Session expirée. Veuillez vous reconnecter.")
        : NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("session");
      return response;
    }

    // Refresh lastActivity in the JWT token
    const refreshed = await new SignJWT({ ...payload, lastActivity: Date.now() })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getEncodedKey());

    const response = NextResponse.next();
    response.cookies.set("session", refreshed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch {
    const response = isApiPath(pathname)
      ? apiUnauthorizedResponse("Session invalide. Veuillez vous reconnecter.")
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
