import { errorResponseSchemas } from "@repo/shared";
import { StatusCodes } from "@repo/config";
import { createRoute, z } from "@hono/zod-openapi";
import { SessionProvider } from "@repo/db";
import { type AppRouteHandler } from "@/types";
import { processOauthCallback } from "./oauth-callback.logic";

export const getOauthCallbackRoute = createRoute({
  method: "get",
  path: "/v1/oauth/{provider}/callback",
  tags: ["OAuth"],
  summary: "OAuth provider callback",
  description: "Handles the OAuth callback from the provider and exchanges code for tokens",
  request: {
    params: z.object({
      provider: z
        .enum(SessionProvider, {
          message: "Invalid OAuth provider",
        })
        .openapi({
          description: "The OAuth provider to use (e.g., google, github)",
          example: SessionProvider.GOOGLE,
          param: {
            in: "path",
            name: "provider",
          },
        }),
    }),
    query: z.object({
      code: z
        .string({ message: "Please enter a valid code" })
        .optional()
        .openapi({
          description: "The authorization code returned by the OAuth provider",
          example: "4/0AX4XfWg...example_code...Xg",
          param: {
            in: "query",
            name: "code",
          },
        }),
      error: z
        .string()
        .optional()
        .openapi({
          description: "Error code returned by the OAuth provider, if any",
          example: "access_denied",
          param: {
            in: "query",
            name: "error",
          },
        }),
      error_description: z
        .string()
        .optional()
        .openapi({
          description: "Error description returned by the OAuth provider, if any",
          example: "The user denied access to the application.",
          param: {
            in: "query",
            name: "error_description",
          },
        }),
      state: z
        .string({ message: "State parameter is required for CSRF protection" })
        .optional()
        .openapi({
          description: "The state parameter returned by the OAuth provider for CSRF protection",
          example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...example_state...X0",
          param: {
            in: "query",
            name: "state",
          },
        }),
    }),
  },
  responses: {
    200: {
      description: "Successfully authenticated and tokens generated",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().openapi({
              example: "Logged in successfully",
            }),
            payload: z.object({
              accessToken: z.string().openapi({
                description: "JWT access token for API authentication",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              }),
              refreshToken: z.string().openapi({
                description: "JWT refresh token for obtaining new access tokens",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              }),
            }),
          }),
        },
      },
    },
    [StatusCodes.HTTP_302_FOUND]: {
      description: "Redirect to app after successful authentication",
    },
    ...errorResponseSchemas,
  },
});

export type GetOauthCallbackRoute = typeof getOauthCallbackRoute;

export const getOauthCallbackHandler: AppRouteHandler<GetOauthCallbackRoute> = async (c) => {
  const { provider } = c.req.valid("param");
  const { code, error, error_description, state } = c.req.valid("query");

  return processOauthCallback(c, {
    provider,
    code,
    state,
    error,
    error_description,
  });
};
