import type { Request, Response, NextFunction } from "express";
import { validateSession, type SessionData } from "../security.ts";

export interface AuthenticatedRequest extends Request {
  user?: SessionData;
  isCookieAuth?: boolean;
  hadToken?: boolean;
  sessionExpired?: boolean;
}

/**
 * Middleware that extracts and validates the session token from:
 * 1. HttpOnly Cookie: "aods_session"
 * 2. Authorization Header: "Bearer <token>"
 * 3. Custom Header: "x-auth-token"
 * 
 * Enforces 15-minute idle expiration and absolute 8-hour lifetime.
 * Distinguishes user-driven mutating/touch actions from background polling.
 * Does not block unauthenticated requests; attaches req.user if valid.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  let token: string | undefined;
  let fromCookie = false;

  // 1. Check HttpOnly cookie
  if (req.cookies && typeof req.cookies.aods_session === "string") {
    token = req.cookies.aods_session.trim();
    fromCookie = true;
  }

  // 2. Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
      fromCookie = false;
    } else if (typeof req.headers["x-auth-token"] === "string") {
      token = req.headers["x-auth-token"].trim();
      fromCookie = false;
    }
  }

  if (token) {
    authReq.hadToken = true;
    const isBackground = req.headers["x-aods-background"] === "1";
    const isTouch = req.path === "/touch" || req.path === "/auth/touch" || req.originalUrl?.includes("/auth/touch");
    const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
    const touchActivity = !isBackground && (isTouch || isMutating);

    const session = validateSession(token, { touchActivity });
    if (session) {
      authReq.user = session;
      authReq.isCookieAuth = fromCookie;
    } else {
      authReq.sessionExpired = true;
      if (fromCookie) {
        const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.HTTPS_ENABLED === "true";
        res.clearCookie("aods_session", {
          path: "/",
          httpOnly: true,
          secure: isHttps || process.env.NODE_ENV === "production",
          sameSite: "lax"
        });
      }
    }
  }

  next();
}

/**
 * Guard middleware requiring an active authenticated session.
 * Also enforces Anti-CSRF verification for cookie-authenticated mutating requests.
 * Responds with 401 Unauthorized if not authenticated or expired.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    if (authReq.sessionExpired) {
      res.status(401).json({
        success: false,
        error: "Your session expired due to inactivity. Please log in again.",
        code: "SESSION_EXPIRED"
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: "Authentication required. Please sign in with your employee credentials.",
      code: "AUTH_REQUIRED"
    });
    return;
  }

  // Anti-CSRF verification for browser cookie sessions on mutating requests
  if (authReq.isCookieAuth && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const requestedWith = req.headers["x-requested-with"];
    if (requestedWith !== "AODS") {
      res.status(403).json({
        success: false,
        error: "CSRF security check failed: Missing or invalid X-Requested-With header."
      });
      return;
    }
  }

  next();
}

/**
 * Guard middleware requiring specific role(s) (e.g. Administrator).
 * Responds with 403 Forbidden if user does not possess the required role.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required."
      });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      res.status(403).json({
        success: false,
        error: "Access denied. Administrator privileges are required to perform this action."
      });
      return;
    }

    next();
  };
}

