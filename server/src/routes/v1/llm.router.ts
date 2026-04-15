import { Router } from "express";
import { taskRepository } from "../../repositories/taskRepository.js";
import { llmService } from "../../services/llmService.js";
import { parseTaskFiltersInput } from "../../validation/taskFilters.js";

export const llmRouter = Router();

/** Тело опционально: те же поля, что у GET /tasks (фильтры применяются к выборке для сводки). */
llmRouter.post("/workload-summary", async (req, res, next) => {
  try {
    const filters = parseTaskFiltersInput(req.body ?? {});
    const tasks = await taskRepository.findMany(filters);
    const summary = await llmService.workloadSummary(tasks);
    res.json({ data: { summary } });
  } catch (e) {
    next(e);
  }
});
