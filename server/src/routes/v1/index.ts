import { Router } from "express";
import { tasksRouter } from "./tasks.router.js";
import { llmRouter } from "./llm.router.js";

export const apiV1Router = Router();

apiV1Router.use("/tasks", tasksRouter);
apiV1Router.use("/llm", llmRouter);
