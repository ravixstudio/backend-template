# Authentication Guide

OAuth-based authentication with extensible provider support.

## Overview

The authentication system uses:

- **OAuth 2.0** for user authentication (no passwords stored)
- **JWT tokens** for API authorization
- **Encrypted tokens** for OAuth provider access
- **CSRF protection** with signed state tokens

## Authentication Flow

```
┌────────┐                ┌─────────┐                ┌──────────────┐
│ Client │                │   API   │                │   Provider   │
└────────┘                └─────────┘                └──────────────┘
    │                          │                           │
    │  1. GET /v1/oauth/{provider}                           │
    │─────────────────────────▶│                           │
    │                          │                           │
    │  2. Redirect to provider │                           │
    │     (state token in URL) │                           │
    │◀─────────────────────────│                           │
    │                          │                           │
    │  3. User authenticates at provider                   │
    │─────────────────────────────────────────────────────▶│
    │                          │                           │
    │  4. Provider callback with code                      │
    │◀─────────────────────────────────────────────────────│
    │                          │                           │
    │  5. GET or POST /v1/oauth/{provider}/callback        │
    │─────────────────────────▶│                           │
    │                          │                           │
    │                          │  6. Exchange code         │
    │                          │─────────────────────────▶│
    │                          │                           │
    │                          │  7. Tokens + user info    │
    │                          │◀─────────────────────────│
    │                          │                           │
    │  8. JWT access + refresh │                           │
    │◀─────────────────────────│                           │
    │                          │                           │
```

## Supported Providers

| Provider | Callback method | Notes |
| -------- | --------------- | ----- |
| `google` | `GET` query params | Standard OAuth 2.0 |
| `apple`  | `POST` form body   | Requires `form_post` when `name`/`email` scopes are used |

## Endpoints

### Initiate OAuth Flow

```
GET /v1/oauth/{provider}
```

**Path parameters:**

- `provider`: OAuth provider (`google`, `apple`)

**Query parameters:**

- `redirect` (optional): `"true"` (default) redirects to `FRONTEND_URL` after login; `"false"` returns JSON tokens

**Response:** JSON with authorization URL

**Examples:**

```bash
# Google
curl "http://localhost:8000/v1/oauth/google?redirect=false"

# Apple (use your public API URL in production or via ngrok locally)
curl "https://your-api.example.com/v1/oauth/apple?redirect=false"
```

### OAuth Callback

**Google** — query parameters on GET:

```
GET /v1/oauth/google/callback?code=...&state=...
```

**Apple** — form fields on POST (`application/x-www-form-urlencoded`):

```
POST /v1/oauth/apple/callback
```

| Field | Description |
| ----- | ----------- |
| `code` | Authorization code from Apple |
| `state` | CSRF state token |
| `user` | JSON string with name/email — **first authorization only** |
| `id_token` | OpenID Connect id_token (optional in callback body) |

**Query parameters (Google GET callback):**

- `code`: Authorization code from provider
- `state`: CSRF state token

**Response (when `redirect=false`):**

```json
{
  "message": "Logged in successfully",
  "payload": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

When `redirect=true` (default), the API sets HttpOnly cookies and redirects to `FRONTEND_URL`.

## Apple Sign In Setup

Apple differs from Google in several ways. Implementation lives in `apps/api/src/modules/auth/providers/apple.provider.ts`.

### Environment Variables

```bash
# apps/api/.env
APPLE_CLIENT_ID=com.example.app.web          # Services ID from Apple Developer
APPLE_TEAM_ID=XXXXXXXXXX                     # Apple Developer Team ID
APPLE_KEY_ID=XXXXXXXXXX                     # Sign in with Apple key ID
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY----- # Contents of downloaded .p8 file
...
-----END PRIVATE KEY-----
APPLE_REDIRECT_URI=https://your-api.example.com/v1/oauth/apple/callback
```

| Variable | Description |
| -------- | ----------- |
| `APPLE_CLIENT_ID` | **Services ID** identifier (not the App ID bundle) |
| `APPLE_TEAM_ID` | Team ID from Apple Developer membership |
| `APPLE_KEY_ID` | Key ID for the Sign in with Apple `.p8` private key |
| `APPLE_PRIVATE_KEY` | PEM contents of the `.p8` file (multi-line quoted or `\n`-escaped single line) |
| `APPLE_REDIRECT_URI` | Must match Apple Console **Return URL** exactly |

### Apple Developer Console

1. Enable **Sign in with Apple** on your App ID.
2. Create a **Services ID** — use this as `APPLE_CLIENT_ID`.
3. Configure the Services ID:
   - **Domains and Subdomains:** your API host (e.g. `api.example.com` or `xxxx.ngrok-free.app`)
   - **Return URLs:** `https://your-api-host/v1/oauth/apple/callback`
4. Create a **Sign in with Apple** key, download the `.p8` file, note the **Key ID**.

> **Local development:** Apple does **not** accept `localhost` as a Services ID domain. Use a tunnel (e.g. [ngrok](https://ngrok.com/)) pointing at your API port and register the ngrok hostname in Apple Console and `APPLE_REDIRECT_URI`.

```bash
# Example local setup
ngrok http 8000

# Apple Console domain:  abc123.ngrok-free.app
# APPLE_REDIRECT_URI:    https://abc123.ngrok-free.app/v1/oauth/apple/callback
```

### Apple-Specific Behavior

| Topic | Behavior |
| ----- | -------- |
| Client secret | ES256 JWT signed with `.p8` private key (regenerated per token request) |
| User info | Decoded from `id_token` — no userinfo REST endpoint |
| `response_mode` | Must be `form_post` when `name` or `email` scopes are requested |
| First sign-in | Apple POSTs a `user` JSON blob with name/email in the callback body |
| Repeat sign-in | Email may be omitted from `id_token`; API falls back to the stored user email |
| Callback route | `POST /v1/oauth/apple/callback` (not GET) |

### Test Apple OAuth

```bash
# 1. Get authorization URL
curl "https://your-api.example.com/v1/oauth/apple?redirect=false"

# 2. Open the `link` from the response in a browser and complete Apple sign-in
# 3. Apple POSTs to your callback; API returns JWT tokens or redirects to FRONTEND_URL
```

## Google OAuth Setup

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/v1/oauth/google/callback
```

Google uses a standard GET callback and works with `localhost` for local development.

### Refresh Access Token

```
POST /v1/auth/refresh
```

**Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

## Token Strategy

### Access Token

| Property | Value             |
| -------- | ----------------- |
| Type     | JWT               |
| Lifetime | 15 minutes        |
| Storage  | Client memory     |
| Purpose  | API authorization |

**Payload:**

```json
{
  "sub": "user-uuid",
  "sessionId": "session-uuid",
  "type": "access",
  "iat": 1705312800,
  "exp": 1705313700
}
```

### Refresh Token

| Property | Value                    |
| -------- | ------------------------ |
| Type     | JWT                      |
| Lifetime | 7 days                   |
| Storage  | HttpOnly cookie / secure |
| Purpose  | Obtain new access token  |

**Payload:**

```json
{
  "sub": "user-uuid",
  "sessionId": "session-uuid",
  "type": "refresh",
  "iat": 1705312800,
  "exp": 1705917600
}
```

### OAuth Provider Tokens

Stored encrypted in database (AES-256-GCM):

| Token         | Purpose                 | Lifetime |
| ------------- | ----------------------- | -------- |
| Access Token  | Call provider APIs      | ~1 hour  |
| Refresh Token | Refresh provider access | 90 days  |

## Security Features

### CSRF Protection

State tokens prevent cross-site request forgery:

```typescript
// State token payload
{
  "provider": "google",
  "iat": 1705312800,
  "exp": 1705313400  // 10 minute expiry
}
```

### Token Encryption

Provider tokens are encrypted before database storage:

```typescript
import { encrypt, decrypt } from "@repo/shared";

// Encrypt before storing
const { data, iv, tag } = encrypt(accessToken, ENCRYPTION_KEY);

// Decrypt when needed
const decrypted = decrypt(data, ENCRYPTION_KEY, iv, tag);
```

### Rate Limiting

Authentication endpoints use `authRateLimiter`:

- **20 requests** per **15 minutes** per IP
- Prevents brute force attempts

## Adding OAuth Providers

### 1. Implement Provider Interface

```typescript
// apps/api/src/modules/auth/providers/github.provider.ts
import type { OAuthProvider, OAuthTokenResponse, OAuthUserInfo } from "./base.provider";
import { env } from "@/env";

export class GitHubProvider implements OAuthProvider {
  getName(): string {
    return "github";
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${env.API_URL}/v1/auth/oauth/github/callback`,
      scope: this.getDefaultScopes().join(" "),
      state,
      response_type: "code",
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    return response.json();
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    // GitHub tokens don't expire, implement if needed
    throw new Error("GitHub tokens do not require refresh");
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();

    // Get email if not public
    let email = data.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const emails = await emailsRes.json();
      email = emails.find((e: any) => e.primary)?.email;
    }

    return {
      id: String(data.id),
      email,
      name: data.name,
      picture: data.avatar_url,
    };
  }

  getDefaultScopes(): string[] {
    return ["read:user", "user:email"];
  }

  getTokenEndpoint(): string {
    return "https://github.com/login/oauth/access_token";
  }

  getUserInfoEndpoint(): string {
    return "https://api.github.com/user";
  }
}
```

### 2. Register in Factory

```typescript
// apps/api/src/modules/auth/providers/index.ts
import { GoogleProvider } from "./google.provider";
import { GitHubProvider } from "./github.provider";

export const oauthProviderFactory = {
  google: new GoogleProvider(),
  github: new GitHubProvider(),
} as const;

export type SupportedProvider = keyof typeof oauthProviderFactory;
```

### 3. Add Environment Variables

```bash
# apps/api/.env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### 4. Update Environment Schema

```typescript
// apps/api/src/env.ts
export const apiEnvSchema = baseEnvSchema.extend({
  // ... existing vars
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
});
```

### 5. Add to Database Enum

```typescript
// packages/db/src/schema/users/sessions.db.ts
export const sessionProviderEnum = pgEnum("session_provider", [
  "google",
  "apple",
  "github", // Add new provider
]);
```

### 6. Generate Migration

```bash
bun run db:generate
bun run db:migrate
```

## Database Schema

### Sessions Table

```typescript
export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  status: sessionStatusEnum("status").notNull().default(SessionStatus.ACTIVE),
  provider: sessionProviderEnum("provider").notNull(),

  // Encrypted OAuth tokens
  providerAccessToken: varchar("provider_access_token", { length: 2048 }).notNull(),
  providerAccessTokenIv: varchar("provider_access_token_iv", { length: 32 }).notNull(),
  providerAccessTokenTag: varchar("provider_access_token_tag", { length: 32 }).notNull(),
  providerAccessTokenExpiresAt: timestamp("provider_access_token_expires_at", {
    withTimezone: true,
  }),

  providerRefreshToken: varchar("provider_refresh_token", { length: 2048 }),
  providerRefreshTokenIv: varchar("provider_refresh_token_iv", { length: 32 }),
  providerRefreshTokenTag: varchar("provider_refresh_token_tag", { length: 32 }),
  providerRefreshTokenExpiresAt: timestamp("provider_refresh_token_expires_at", {
    withTimezone: true,
  }),

  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  providerScope: text("provider_scope"),

  // Session metadata
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

## Using Provider Access Tokens

When you need to call provider APIs on behalf of the user:

```typescript
import { SessionService, decrypt } from "@repo/db";
import { env } from "@/env";

async function callProviderApi(sessionId: string) {
  const session = await SessionService.findById(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Decrypt access token
  const accessToken = decrypt(
    session.providerAccessToken,
    env.ENCRYPTION_KEY,
    session.providerAccessTokenIv,
    session.providerAccessTokenTag,
  );

  // Check if token is expired
  if (session.providerAccessTokenExpiresAt < new Date()) {
    // Refresh the token
    const provider = oauthProviderFactory[session.provider];
    const refreshToken = decrypt(
      session.providerRefreshToken,
      env.ENCRYPTION_KEY,
      session.providerRefreshTokenIv,
      session.providerRefreshTokenTag,
    );

    const newTokens = await provider.refreshAccessToken(refreshToken);
    // Update session with new tokens...
  }

  // Call provider API
  const response = await fetch("https://api.provider.com/data", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.json();
}
```

## Error Handling

### OAuth Errors

| Error                  | Status | Cause                              |
| ---------------------- | ------ | ---------------------------------- |
| Invalid provider       | 400    | Unsupported provider name          |
| Invalid state          | 400    | CSRF token invalid or expired      |
| Code exchange failed   | 400    | Authorization code invalid         |
| User info fetch failed | 400    | Cannot retrieve user from provider |

### Token Errors

| Error           | Status | Cause                        |
| --------------- | ------ | ---------------------------- |
| Token expired   | 401    | Access token past expiry     |
| Invalid token   | 401    | Token signature invalid      |
| Session expired | 401    | Refresh token past expiry    |
| Session revoked | 401    | Session manually invalidated |

## Metrics

OAuth events are tracked:

```typescript
// Increment on OAuth success
oauthEventsCounter.inc({ provider: "google", event_type: "login:success" });

// Increment on failure
oauthEventsCounter.inc({ provider: "apple", event_type: "login:error" });
```

View in Grafana: **API Metrics Dashboard** → **OAuth Events** panel

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [DATABASE.md](./DATABASE.md) - Schema details
- [MONITORING.md](./MONITORING.md) - OAuth metrics
