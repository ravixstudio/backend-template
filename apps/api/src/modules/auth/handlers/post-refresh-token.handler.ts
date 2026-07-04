import { logger, errorResponseSchemas } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "@repo/config";
import { TokenService } from "../services";
import { createRoute, z } from "@hono/zod-openapi";
import { type AppRouteHandler } from "@/types";

export const postRefreshTokenRoute = createRoute({
  method: "post",
  path: "/v1/auth/refresh-token",
  tags: ["Auth"],
  summary: "Refresh access token",
  description: "Generates a new access token using the session ID",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            sessionId: z.string({ message: "Session ID is required" }).openapi({
              description: "The session ID to refresh the token for",
              example: "550e8400-e29b-41d4-a716-446655440000",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Token refreshed successfully",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().openapi({
              example: "Token refreshed successfully",
            }),
            payload: z.object({
              accessToken: z.string().openapi({
                description: "New JWT access token",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              }),
              accessTokenExpiresAt: z.string().datetime().openapi({
                description: "Access token expiration timestamp",
                example: "2025-12-22T12:00:00.000Z",
              }),
              refreshToken: z.string().optional().openapi({
                description: "New refresh token (if rotated)",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              }),
              refreshTokenExpiresAt: z.string().datetime().optional().openapi({
                description: "Refresh token expiration timestamp (if rotated)",
                example: "2026-03-22T12:00:00.000Z",
              }),
            }),
          }),
        },
      },
    },
    ...errorResponseSchemas,
  },
});

export type PostRefreshTokenRoute = typeof postRefreshTokenRoute;

export const postRefreshTokenHandler: AppRouteHandler<PostRefreshTokenRoute> = async (c) => {
  try {
    const { sessionId } = c.req.valid("json");
    const ipAddress =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");

    // Refresh access token
    const result = await TokenService.refreshAccessToken(sessionId, {
      metadata: {
        ...(ipAddress && { ipAddress }),
      },
    });

    logger.audit("Access token refreshed", {
      module: "auth",
      action: "token:refresh:success",
      sessionId,
    });

    return c.json({
      message: "Token refreshed successfully",
      payload: {
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        ...(result.refreshToken && {
          refreshToken: result.refreshToken,
          refreshTokenExpiresAt: result.refreshTokenExpiresAt?.toISOString(),
        }),
      },
    });
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }

    logger.error("Error refreshing token", {
      module: "auth",
      action: "token:refresh:error",
      error: err instanceof Error ? err.message : String(err),
    });

    // Check for specific error messages
    if (err instanceof Error) {
      if (err.message.includes("Session not found")) {
        throw new HTTPException(StatusCodes.HTTP_404_NOT_FOUND, {
          message: "Session not found",
          res: c.json({
            message: "Session not found",
          }),
        });
      }

      if (err.message.includes("Refresh token expired") || err.message.includes("not active")) {
        throw new HTTPException(StatusCodes.HTTP_401_UNAUTHORIZED, {
          message: "Session expired. Please re-authenticate.",
          res: c.json({
            message: "Session expired. Please re-authenticate.",
          }),
        });
      }
    }

    throw new HTTPException(StatusCodes.HTTP_500_INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
      res: c.json({
        message: "Internal Server Error",
      }),
    });
  }
};
