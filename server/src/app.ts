import express from "express";
import cors from "cors";
import { apiV1Router } from "./routes/v1/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1", apiV1Router);

  app.use(errorHandler);
  return app;
}
