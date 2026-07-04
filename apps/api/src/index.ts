import { env } from "@/env";
import { serve, type ServerType } from "@hono/node-server";
import { cors } from "hono/cors";
import packageJson from "../package.json";
import {
  configureOpenAPI,
  createApp,
  logger,
  globalRateLimiter,
  requestLogger,
  metricsMiddleware,
} from "@repo/shared";
import { getMetrics, getMetricsContentType } from "@repo/shared/metrics";
import { initializeDB, connectDB, closeDB } from "@repo/db";
import authRoutes from "@/modules/auth/auth.routes";
import { getUserMiddleware } from "@/middlewares/get-user.middleware";
import { type AppBindings, type AppRouteHandler } from "./types";
import { createRoute, z } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import { userRoutes } from "./modules/users/user.routes";
import { initializePayments } from "@repo/payments";

// Initialize database with config
initializeDB({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Initialize payments
initializePayments({
  apiKey: env.DODO_PAYMENTS_API_KEY,
  webhookSecret: env.DODO_PAYMENTS_WEBHOOK_KEY,
  environment: env.DODO_PAYMENTS_ENVIRONMENT,
});

const app = createApp<AppBindings>();

// CORS configuration
const allowedOrigins =
  env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
  }),
);

app.use(secureHeaders());

// Apply request logging middleware
app.use(requestLogger());

// Apply metrics middleware
app.use(metricsMiddleware());

// Apply global rate limiter
app.use(globalRateLimiter);

app.use(getUserMiddleware);

const getHealthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check endpoint",
  description: "Returns the health status of the server",
  responses: {
    200: {
      description: "Server is healthy",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().openapi({
              example: "Server is up and running!!",
            }),
          }),
        },
      },
    },
  },
});

type GetHealthRoute = typeof getHealthRoute;

const healthHandler: AppRouteHandler<GetHealthRoute> = (c) => {
  return c.json({
    message: "Server is up and running!!",
  });
};

app.openapi(getHealthRoute, healthHandler);

// Prometheus metrics endpoint
app.get("/metrics", async (c) => {
  const metrics = await getMetrics();
  return c.text(metrics, 200, {
    "Content-Type": getMetricsContentType(),
  });
});

const routes = [authRoutes, userRoutes] as const;

routes.forEach((route) => {
  app.route("/", route);
});

configureOpenAPI(app, {
  title: "API",
  version: packageJson.version,
});

// Start server
async function start() {
  try {
    await connectDB();
    server = serve({
      fetch: app.fetch,
      port: +env.PORT,
    });
    logger.info(`Server running on port ${env.PORT}`, {
      module: "system",
      action: "startup",
    });
  } catch (error) {
    logger.error("Failed to start server", {
      module: "system",
      action: "startup",
      error: error as Error,
    });
    process.exit(1);
  }
}

let server: ServerType;
void start();

// Stop server
async function stop() {
  const shutdownTimeout = setTimeout(() => {
    logger.error("Shutdown timeout reached, forcing exit", {
      module: "system",
      action: "shutdown",
    });
    process.exit(1);
  }, 10_000); // Increased to 10s for Resource close reliability

  try {
    // Clear resources
    await closeDB();
    // await closeRedis()
  } catch (error) {
    logger.error("Failed to close DB", {
      module: "db",
      action: "shutdown",
      error: error as Error,
    });
  }

  // Close server after resources
  server.close((err) => {
    if (err) {
      logger.error("Force closed server", {
        module: "system",
        action: "shutdown",
        error: err,
      });
    } else {
      logger.info("Server closed", {
        module: "system",
        action: "shutdown",
      });
    }
    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
