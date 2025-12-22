import { env } from "@repo/config";
import { serve, type ServerType } from "@hono/node-server";
import { cors } from "hono/cors";
import packageJson from "../package.json";
import { configureOpenAPI, createApp, logger, globalRateLimiter } from "@repo/shared";
import { connectDB, closeDB } from "@repo/db";
import authRoutes from "./modules/auth/auth.routes";

let server: ServerType | null = null;
let isShuttingDown = false;
const app = createApp();

// CORS configuration
const allowedOrigins = env.CORS_ORIGIN === "*"
  ? "*"
  : env.CORS_ORIGIN.split(",").map(origin => origin.trim());

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

// Apply global rate limiter
app.use(globalRateLimiter);

app.get("/health", (c) => {
  return c.json({
    message: "Server is up and running!!",
  });
});

const routes = [authRoutes] as const;

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
    const port = env.PORT;

    server = serve({
      fetch: app.fetch,
      port: +port,
    });

    logger.info(`Server running on port ${port}`, {
      module: "system",
      action: "startup",
    });
  } catch (error) {
    logger.error("Failed to start server", {
      module: "system",
      action: "startup",
      error
    });
    process.exit(1);
  }
}

// Shutdown server
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.warn(`Shutdown signal received (${signal})`, {
    module: "system",
    action: "shutdown",
  });

  try {
    await closeDB();

    // close other services here

    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    logger.info("Server shutdown gracefully", {
      module: "system",
      action: "shutdown",
    });
    process.exit(0);
  } catch (error) {
    logger.error("Shutdown failed with error", {
      module: "system",
      action: "shutdown",
      error,
    });
    process.exit(1);
  }
}

const shutdownHandler = (signal: string) => shutdown(signal);
process.once("SIGTERM", shutdownHandler);
process.once("SIGINT", shutdownHandler);
process.once("SIGHUP", shutdownHandler);

process.once("uncaughtException", (error) => {
  logger.error("Uncaught exception", { module: "system", action: "crash", error });
  shutdownHandler("uncaughtException");
});

process.once("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", { module: "system", action: "crash", error });
  shutdown("unhandledRejection");
});

void start();
