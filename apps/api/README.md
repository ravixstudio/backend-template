# API Service

The main API service with OAuth authentication and PostgreSQL database.

## Development

```bash
# From repository root
turbo dev --filter=@repo/api

# Or from this directory
bun run dev
```

## Database

```bash
# Start local PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Generate migration
bun run db:generate

# Run migration
bun run db:migrate
```

## Environment Variables

Copy `apps/api/.env.example` to `apps/api/.env` and configure:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_REDIRECT_URI`
- `ENCRYPTION_KEY` (64-char hex string for AES-256)
- `JWT_SECRET` (min 32 chars)

See [AUTHENTICATION.md](../../docs/AUTHENTICATION.md) for full OAuth setup, including Apple Sign In with ngrok for local development.

## OAuth Providers

| Provider | Initiate | Callback |
| -------- | -------- | -------- |
| Google | `GET /v1/oauth/google` | `GET /v1/oauth/google/callback` |
| Apple | `GET /v1/oauth/apple` | `POST /v1/oauth/apple/callback` |

Apple uses `response_mode=form_post` (required when `name`/`email` scopes are requested), so the callback is a **POST** with `application/x-www-form-urlencoded` body fields: `code`, `state`, and optionally `user` (first sign-in only).

## Handler Pattern

Use `AppRouteHandler<R>` instead of `RouteHandler` from `@hono/zod-openapi` to get proper typing for app-specific context variables (`user`, `session`).

### Creating a Handler

```typescript
// src/modules/{feature}/handlers/{action}.handler.ts
import { createRoute, z } from "@hono/zod-openapi";
import { StatusCodes } from "@repo/config";
import { errorResponseSchemas } from "@repo/shared";
import { AppRouteHandler } from "@/types";

// 1. Define the route
export const myRoute = createRoute({
  method: "get",
  path: "/v1/resource/{id}",
  tags: ["Resource"],
  summary: "Get resource by ID",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    [StatusCodes.HTTP_200_OK]: {
      content: { "application/json": { schema: responseSchema } },
      description: "Success",
    },
    ...errorResponseSchemas, // Always include for 400,401,403,404,429,500
  },
});

// 2. Export the route type
export type MyRoute = typeof myRoute;

// 3. Create the handler with AppRouteHandler<RouteType>
export const myHandler: AppRouteHandler<MyRoute> = async (c) => {
  // Access validated path params (use "param" not "params")
  const { id } = c.req.valid("param");

  // Access query params if defined in route
  const { page } = c.req.valid("query");

  // Access request body if defined in route
  const body = c.req.valid("json");

  // Access authenticated user & session (see below)
  const user = c.get("user");
  const session = c.get("session");

  return c.json({ data: result }, StatusCodes.HTTP_200_OK);
};
```

### User & Session Context

The `getUserMiddleware` (`src/middlewares/get-user.middleware.ts`) populates `user` and `session` in the context:

1. Extracts JWT from `Authorization: Bearer <token>` header
2. Verifies the token using `JWT_SECRET`
3. Validates the session (checks if not revoked/expired)
4. Fetches the user from database
5. Attaches both to context via `c.set("user", user)` and `c.set("session", session)`

**Note:** For unauthenticated routes, `user` and `session` will be `undefined`. For protected routes, apply the middleware and check for their presence.
