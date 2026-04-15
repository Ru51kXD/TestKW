import type { Prisma, Priority, Task, TaskStatus } from "@prisma/client";
import { ApiError } from "../errors/ApiError.js";
import { taskRepository, type TaskFilters } from "../repositories/taskRepository.js";

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  category: string | null;
  parentId: string | null;
  createdAt: string;
};

function toDto(t: Task): TaskDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    category: t.category,
    parentId: t.parentId,
    createdAt: t.createdAt.toISOString(),
  };
}

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate?: string | null;
  category?: string | null;
  parentId?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;

function parseDueDate(iso: string | null | undefined): Date | null | undefined {
  if (iso === undefined) return undefined;
  if (iso === null || iso === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError("VALIDATION_ERROR", "Invalid dueDate", 400);
  }
  return d;
}

export const taskService = {
  async list(filters: TaskFilters): Promise<TaskDto[]> {
    const rows = await taskRepository.findMany(filters);
    return rows.map(toDto);
  },

  async get(id: string): Promise<TaskDto> {
    const t = await taskRepository.findById(id);
    if (!t) throw new ApiError("NOT_FOUND", "Task not found", 404);
    return toDto(t);
  },

  async create(input: CreateTaskInput): Promise<TaskDto> {
    const due = parseDueDate(input.dueDate ?? null);
    const t = await taskRepository.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      status: input.status,
      dueDate: due ?? null,
      category: input.category?.trim() || null,
      parent: input.parentId ? { connect: { id: input.parentId } } : undefined,
    });
    return toDto(t);
  },

  async update(id: string, input: UpdateTaskInput): Promise<TaskDto> {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", "Task not found", 404);

    const due = parseDueDate(input.dueDate);
    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.status !== undefined) data.status = input.status;
    if (due !== undefined) data.dueDate = due;
    if (input.category !== undefined) data.category = input.category?.trim() || null;
    if (input.parentId !== undefined) {
      data.parent = input.parentId
        ? { connect: { id: input.parentId } }
        : { disconnect: true };
    }

    const t = await taskRepository.update(id, data);
    return toDto(t);
  },

  async remove(id: string): Promise<void> {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", "Task not found", 404);
    await taskRepository.delete(id);
  },

  async createSubtasksFromSuggestion(
    parentId: string,
    items: { title: string; description?: string | null; priority: Priority }[]
  ): Promise<TaskDto[]> {
    const parent = await taskRepository.findById(parentId);
    if (!parent) throw new ApiError("NOT_FOUND", "Parent task not found", 404);
    const created = await taskRepository.createManySubtasks(parentId, items);
    return created.map(toDto);
  },
};
