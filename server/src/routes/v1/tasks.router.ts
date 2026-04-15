import { Router } from "express";
import { z } from "zod";
import { Priority, TaskStatus } from "@prisma/client";
import { ApiError } from "../../errors/ApiError.js";
import { taskRepository } from "../../repositories/taskRepository.js";
import { taskService } from "../../services/taskService.js";
import { llmService } from "../../services/llmService.js";
import { parseTaskFiltersInput } from "../../validation/taskFilters.js";

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const statusSchema = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);

const createBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: prioritySchema,
  status: statusSchema,
  dueDate: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const updateBodySchema = createBodySchema.partial();

const subtasksBodySchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        priority: prioritySchema,
      })
    )
    .min(1),
});

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res, next) => {
  try {
    const tasks = await taskService.list(parseTaskFiltersInput(req.query));
    res.json({ data: tasks });
  } catch (e) {
    next(e);
  }
});

tasksRouter.get("/:id", async (req, res, next) => {
  try {
    const task = await taskService.get(req.params.id);
    res.json({ data: task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/", async (req, res, next) => {
  try {
    const body = createBodySchema.parse(req.body);
    const task = await taskService.create(body);
    res.status(201).json({ data: task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateBodySchema.parse(req.body);
    const task = await taskService.update(req.params.id, body);
    res.json({ data: task });
  } catch (e) {
    next(e);
  }
});

tasksRouter.delete("/:id", async (req, res, next) => {
  try {
    await taskService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/subtasks", async (req, res, next) => {
  try {
    const body = subtasksBodySchema.parse(req.body);
    const created = await taskService.createSubtasksFromSuggestion(req.params.id, body.items);
    res.status(201).json({ data: created });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/llm/category", async (req, res, next) => {
  try {
    const task = await taskRepository.findById(req.params.id);
    if (!task) throw new ApiError("NOT_FOUND", "Task not found", 404);
    const suggestion = await llmService.suggestCategory(task);
    res.json({ data: { suggestion } });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/llm/decompose", async (req, res, next) => {
  try {
    const task = await taskRepository.findById(req.params.id);
    if (!task) throw new ApiError("NOT_FOUND", "Task not found", 404);
    const subtasks = await llmService.suggestSubtasks(task);
    res.json({ data: { subtasks } });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post("/:id/llm/priority", async (req, res, next) => {
  try {
    const task = await taskRepository.findById(req.params.id);
    if (!task) throw new ApiError("NOT_FOUND", "Task not found", 404);
    const suggestion = await llmService.suggestPriority(task);
    res.json({ data: { suggestion } });
  } catch (e) {
    next(e);
  }
});
