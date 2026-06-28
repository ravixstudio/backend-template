import { z } from "zod";
import { baseEnvSchema } from "@repo/config";

/**
 * API-specific environment schema
 * Extends base schema with API-specific variables
 */
const apiEnvSchema = baseEnvSchema.extend({
  // Server
  PORT: z.string().optional().default("8000"),

  // Database
  DATABASE_URL: z.string({ message: "DATABASE_URL is required" }),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string({ message: "GOOGLE_CLIENT_ID is required" }),
  GOOGLE_CLIENT_SECRET: z.string({ message: "GOOGLE_CLIENT_SECRET is required" }),
  GOOGLE_REDIRECT_URI: z.string({ message: "GOOGLE_REDIRECT_URI is required" }),

  // OAuth - Apple
  APPLE_CLIENT_ID: z.string({ message: "APPLE_CLIENT_ID is required" }),
  APPLE_TEAM_ID: z.string({ message: "APPLE_TEAM_ID is required" }),
  APPLE_KEY_ID: z.string({ message: "APPLE_KEY_ID is required" }),
  APPLE_PRIVATE_KEY: z.string({ message: "APPLE_PRIVATE_KEY is required" }),
  APPLE_REDIRECT_URI: z.string({ message: "APPLE_REDIRECT_URI is required" }),

  // Security
  ENCRYPTION_KEY: z.string({ message: "ENCRYPTION_KEY is required" }).refine(
    (val) => {
      // AES-256-GCM requires a 32-byte (256-bit) key
      // Hex encoded means 64 characters (32 bytes * 2)
      return /^[0-9a-fA-F]{64}$/.test(val);
    },
    {
      message: "ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes for AES-256)",
    },
  ),
  JWT_SECRET: z
    .string({ message: "JWT_SECRET is required" })
    .min(32, { message: "JWT_SECRET must be at least 32 characters long for security" }),

  // CORS
  CORS_ORIGIN: z
    .string()
    .optional()
    .default("*")
    .describe("Comma-separated list of allowed origins or * for all"),
  FRONTEND_URL: z
    .string()
    .url({ message: "FRONTEND_URL must be a valid URL" })
    .optional()
    .default("http://localhost:3000"),

  // Docker Services (optional, with defaults)
  POSTGRES_PORT: z.string().optional().default("5432"),
  PROMETHEUS_PORT: z.string().optional().default("9090"),
  GRAFANA_PORT: z.string().optional().default("8001"),
  METRICS_SERVER_PORT: z.string().optional().default("3002"),
});

export const env = apiEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_KEY_ID: process.env.APPLE_KEY_ID,
  APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
  APPLE_REDIRECT_URI: process.env.APPLE_REDIRECT_URI,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  FRONTEND_URL: process.env.FRONTEND_URL,
  POSTGRES_PORT: process.env.POSTGRES_PORT,
  PROMETHEUS_PORT: process.env.PROMETHEUS_PORT,
  GRAFANA_PORT: process.env.GRAFANA_PORT,
  METRICS_SERVER_PORT: process.env.METRICS_SERVER_PORT,
});

export type Env = z.infer<typeof apiEnvSchema>;
