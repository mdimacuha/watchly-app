// This file should only be imported on the server.
// If imported on client, process.env will be empty for non-NEXT_PUBLIC vars.

import { z } from "zod";

const tmdbEnvSchema = z.object({
  TMDB_API_READ_TOKEN: z.string().min(1, "TMDB_API_READ_TOKEN is required"),
  TMDB_API_BASE_URL: z.url().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE_URL: z.url().default("https://image.tmdb.org/t/p"),
});

const tmdbEnvRaw = {
  TMDB_API_READ_TOKEN: process.env.TMDB_API_READ_TOKEN,
  TMDB_API_BASE_URL: process.env.TMDB_API_BASE_URL,
  TMDB_IMAGE_BASE_URL: process.env.TMDB_IMAGE_BASE_URL,
};


// Helper to ensure we are on the server before validating
const parsed = tmdbEnvSchema.safeParse(tmdbEnvRaw);

if (!parsed.success) {
  console.error(
    "Invalid TMDB environment variables:",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Invalid TMDB environment variables");
}

export const tmdbEnv = parsed.data;
