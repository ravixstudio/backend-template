import { errorResponseSchemas } from "@repo/shared";
import { createRoute, z } from "@hono/zod-openapi";
import { SessionProvider } from "@repo/db";
import { type AppRouteHandler } from "@/types";
import { processOauthCallback } from "./oauth-callback.logic";

const appleCallbackBodySchema = z.object({
  code: z
    .string()
    .optional()
    .openapi({
      description: "Authorization code returned by Apple",
      example: "c4d6c2e8f0a1b2c3d4e5f6a7b8c9d0e1",
    }),
  state: z
    .string()
    .optional()
    .openapi({
      description: "CSRF state token returned by Apple",
      example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    }),
  error: z
    .string()
    .optional()
    .openapi({
      description: "Error code returned by Apple, if authorization failed",
      example: "user_cancelled_authorize",
    }),
  user: z
    .string()
    .optional()
    .openapi({
      description:
        "JSON string with name and email — only sent by Apple on first authorization (form_post)",
      example: '{"name":{"firstName":"Jane","lastName":"Doe"},"email":"jane@privaterelay.appleid.com"}',
    }),
  id_token: z
    .string()
    .optional()
    .openapi({
      description: "OpenID Connect id_token — may be included in Apple form_post callback",
      example: "eyJraWQiOiJ...",
    }),
});

export const postOauthAppleCallbackRoute = createRoute({
  method: "post",
  path: "/v1/oauth/apple/callback",
  tags: ["OAuth"],
  summary: "Apple OAuth callback (form_post)",
  description:
    "Handles Apple's form_post OAuth callback. Required when name or email scopes are requested. Apple POSTs code, state, and optionally user/id_token in the request body.",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: appleCallbackBodySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Successfully authenticated and tokens generated (when redirect=false in state)",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().openapi({ example: "Logged in successfully" }),
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
    302: {
      description: "Redirect to frontend after successful authentication (when redirect=true in state)",
    },
    ...errorResponseSchemas,
  },
});

export type PostOauthAppleCallbackRoute = typeof postOauthAppleCallbackRoute;

export const postOauthAppleCallbackHandler: AppRouteHandler<PostOauthAppleCallbackRoute> = async (
  c,
) => {
  const body = c.req.valid("form");

  // Fallback: ensure Apple's first-time `user` JSON is captured from the raw form body
  let userPayload = body.user;
  if (!userPayload) {
    const rawBody = await c.req.parseBody();
    if (typeof rawBody.user === "string") {
      userPayload = rawBody.user;
    }
  }

  return processOauthCallback(c, {
    provider: SessionProvider.APPLE,
    code: body.code,
    state: body.state,
    error: body.error,
    user: userPayload,
    id_token: body.id_token,
  });
};
