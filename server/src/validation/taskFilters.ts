import { z } from "zod";
import { ApiError } from "../errors/ApiError.js";
import type { TaskFilters } from "../repositories/taskRepository.js";

export const taskFiltersFieldsSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  search: z.string().optional(),
});

function parseOptionalDate(label: string, value: string | undefined): Date | undefined {
  if (!value || value.trim() === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError("VALIDATION_ERROR", `Invalid ${label}`, 400);
  }
  return d;
}

export function parseTaskFiltersInput(input: unknown): TaskFilters {
  const q = taskFiltersFieldsSchema.parse(input);
  return {
    status: q.status,
    priority: q.priority,
    dueFrom: parseOptionalDate("dueFrom", q.dueFrom),
    dueTo: parseOptionalDate("dueTo", q.dueTo),
    search: q.search,
  };
}
