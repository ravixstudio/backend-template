import { verifyJwt, errorResponseSchemas } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "@repo/config";
import { createRoute, z } from "@hono/zod-openapi";
import { setCookie } from "hono/cookie";
import { env } from "@/env";
import { type AppRouteHandler } from "@/types";

const OAUTH_SESSION_TICKET_PURPOSE = "oauth_session";

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const target = new URL(url);
    const frontend = new URL(env.FRONTEND_URL);
    return target.origin === frontend.origin;
  } catch {
    return false;
  }
}

export const getOauthSessionEstablishRoute = createRoute({
  method: "get",
  path: "/v1/oauth/session/establish",
  tags: ["OAuth"],
  summary: "Establish OAuth session cookies",
  description:
    "Exchanges a short-lived OAuth session ticket for HttpOnly cookies on the API origin, then redirects to the frontend. Used when the OAuth callback lands on a different host (e.g. ngrok for Apple) than the API URL the browser uses.",
  request: {
    query: z.object({
      ticket: z.string().openapi({
        description: "Short-lived signed ticket containing OAuth tokens",
        example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        param: { in: "query", name: "ticket" },
      }),
      next: z
        .string()
        .url()
        .optional()
        .openapi({
          description: "Frontend URL to redirect to after cookies are set",
          example: "http://localhost:3000/dashboard",
          param: { in: "query", name: "next" },
        }),
    }),
  },
  responses: {
    [StatusCodes.HTTP_302_FOUND]: {
      description: "Session cookies set; redirecting to the frontend",
    },
    ...errorResponseSchemas,
  },
});

export type GetOauthSessionEstablishRoute = typeof getOauthSessionEstablishRoute;

export const getOauthSessionEstablishHandler: AppRouteHandler<GetOauthSessionEstablishRoute> = (
  c,
) => {
  const { ticket, next } = c.req.valid("query");
  const redirectUrl = next ?? env.FRONTEND_URL;

  if (!isAllowedRedirectUrl(redirectUrl)) {
    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "Invalid redirect URL",
      res: c.json({ message: "Invalid redirect URL" }),
    });
  }

  let decoded: { accessToken: string; refreshToken: string; purpose: string };

  try {
    decoded = verifyJwt(ticket, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { accessToken: string; refreshToken: string; purpose: string };
  } catch {
    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "Invalid or expired session ticket",
      res: c.json({ message: "Invalid or expired session ticket" }),
    });
  }

  if (decoded.purpose !== OAUTH_SESSION_TICKET_PURPOSE) {
    throw new HTTPException(StatusCodes.HTTP_400_BAD_REQUEST, {
      message: "Invalid session ticket",
      res: c.json({ message: "Invalid session ticket" }),
    });
  }

  setCookie(c, "refresh_token", decoded.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 90 * 24 * 60 * 60,
  });

  setCookie(c, "access_token", decoded.accessToken, {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return c.redirect(redirectUrl);
};

export { OAUTH_SESSION_TICKET_PURPOSE };
