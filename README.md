# Server Template

Production-ready **Bun + Hono + TypeScript + PostgreSQL + Drizzle ORM** monorepo with built-in observability.

## Features

- **Monorepo**: Turborepo with Bun workspaces
- **API Framework**: Hono with OpenAPI/Scalar docs
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: OAuth 2.0 (Google, Apple, extensible)
- **Observability**: Prometheus + Grafana + Loki
- **Security**: JWT, encryption, rate limiting, CSRF protection
- **Type Safety**: Full TypeScript with Zod validation

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.1+
- [Docker](https://www.docker.com/)

### Setup

```bash
# Clone and install
git clone <repo-url> my-project
cd my-project
bun install

# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your values

# Start services (PostgreSQL + Prometheus + Grafana + Loki)
docker compose -f docker-compose.dev.yml up -d

# Run migrations
bun run db:migrate

# Start development
bun run dev
```

### Access Points

| Service    | URL                        | Credentials   |
| ---------- | -------------------------- | ------------- |
| API        | http://localhost:8000      | -             |
| API Docs   | http://localhost:8000/docs | -             |
| Grafana    | http://localhost:8001      | admin / admin |
| Prometheus | http://localhost:9090      | -             |
| Loki       | http://localhost:3100      | -             |

## Project Structure

```
├── apps/
│   └── api/                    # Main API service
│       ├── src/
│       │   ├── modules/        # Feature modules
│       │   │   └── auth/       # Authentication (OAuth)
│       │   └── index.ts        # Entry point
│       └── drizzle/            # Migrations
│
├── packages/
│   ├── config/                 # Environment & constants
│   ├── db/                     # Database schemas & services
│   └── shared/                 # Utilities, logging, middleware
│
├── infra/
│   └── monitoring/             # Prometheus, Grafana, Loki configs
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # System design
│   ├── AUTHENTICATION.md       # OAuth setup
│   ├── DATABASE.md             # Schema & queries
│   ├── LOGGING.md              # Structured logging
│   └── MONITORING.md           # Metrics & observability
│
└── docker-compose.dev.yml      # Local development services
```

## Development

### Commands

```bash
# Development
bun run dev                     # Start all services
bun run dev --filter=@repo/api  # Start API only

# Database
bun run db:generate             # Generate migrations
bun run db:migrate              # Apply migrations

# Docker
docker compose -f docker-compose.dev.yml up -d    # Start services
docker compose -f docker-compose.dev.yml down     # Stop services
docker compose -f docker-compose.dev.yml logs -f  # View logs

# Quality
bun run typecheck               # Type checking
bun run lint                    # Linting
```

### Adding Features

#### New API Module

```bash
mkdir -p apps/api/src/modules/myfeature/{handlers,services}
```

```typescript
// apps/api/src/modules/myfeature/handlers/get-items.handler.ts
import { createRoute, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";
import { StatusCodes, errorResponseSchemas } from "@repo/config";

export const getItemsRoute = createRoute({
  method: "get",
  path: "/items",
  tags: ["Items"],
  responses: {
    [StatusCodes.HTTP_200_OK]: {
      content: { "application/json": { schema: z.object({ items: z.array(z.any()) }) } },
      description: "Success",
    },
    ...errorResponseSchemas,
  },
});

export const getItemsHandler: RouteHandler<typeof getItemsRoute> = async (c) => {
  return c.json({ items: [] }, StatusCodes.HTTP_200_OK);
};
```

#### New Database Table

```typescript
// packages/db/src/schema/items/items.db.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const itemsTable = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

```bash
bun run db:generate && bun run db:migrate
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/backend-template

# Server
PORT=8000
NODE_ENV=development
API_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:3000

# Security
JWT_SECRET=your-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-64-char-hex-encryption-key

# OAuth - Google
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/v1/oauth/google/callback

# OAuth - Apple (see docs/AUTHENTICATION.md — requires a public HTTPS URL for local dev)
APPLE_CLIENT_ID=your-apple-services-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_REDIRECT_URI=https://your-tunnel.ngrok-free.app/v1/oauth/apple/callback

# Observability
LOG_LEVEL=info
LOKI_HOST=http://localhost:3100
```

Generate secrets:

```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key
openssl rand -hex 32
```

## Key Patterns

### Handler Pattern

```typescript
// Route + handler colocated with OpenAPI schema
export const myRoute = createRoute({
  /* OpenAPI spec */
});
export const myHandler: RouteHandler<typeof myRoute> = async (c) => {
  /* impl */
};
```

### Service Pattern

```typescript
// Namespace with optional logger and transaction support
export namespace UsersService {
  export async function create(
    payload: NewUser,
    logger?: Logger,
    options?: { tx?: DBTransaction },
  ) {
    /* impl */
  }
}
```

### Logging Pattern

```typescript
import { logger } from "@repo/shared";

logger.info("Operation completed", {
  module: "auth", // Required: db | auth | users | system | session | security | http
  action: "oauth:callback", // Required: context:operation
  userId: user.id, // Additional context
});
```

## Documentation

| Document                                    | Description                   |
| ------------------------------------------- | ----------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)     | System design & patterns      |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md) | OAuth flow & adding providers |
| [DATABASE.md](docs/DATABASE.md)             | Schemas, migrations, queries  |
| [LOGGING.md](docs/LOGGING.md)               | Structured logging guide      |
| [MONITORING.md](docs/MONITORING.md)         | Metrics, Grafana, Loki setup  |

## Tech Stack

| Category      | Technology                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| Runtime       | [Bun](https://bun.sh/)                                                       |
| Framework     | [Hono](https://hono.dev/)                                                    |
| Database      | [PostgreSQL](https://postgresql.org/) + [Drizzle](https://orm.drizzle.team/) |
| Validation    | [Zod](https://zod.dev/)                                                      |
| Documentation | [Scalar](https://scalar.com/)                                                |
| Logging       | [Pino](https://getpino.io/) + [Loki](https://grafana.com/oss/loki/)          |
| Metrics       | [Prometheus](https://prometheus.io/) + [Grafana](https://grafana.com/)       |
| Monorepo      | [Turborepo](https://turbo.build/)                                            |

## Troubleshooting

### Port in use

```bash
lsof -ti:8000 | xargs kill -9
```

### Database connection failed

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml restart postgres
```

### Module not found

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
bun install
```

### Grafana shows no data

1. Check Prometheus targets: http://localhost:9090/targets
2. Verify API metrics: http://localhost:8000/metrics
3. Check time range in Grafana (last 5-15 minutes)

---

**Happy Building! 🚀**
