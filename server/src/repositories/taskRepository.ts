import type { Prisma, Priority, Task, TaskStatus } from "@prisma/client";
import { prisma } from "../db/client.js";

export type TaskFilters = {
  status?: TaskStatus;
  priority?: Priority;
  dueFrom?: Date;
  dueTo?: Date;
  search?: string;
};

function buildWhere(filters: TaskFilters): Prisma.TaskWhereInput {
  const and: Prisma.TaskWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });

  if (filters.dueFrom || filters.dueTo) {
    const due: Prisma.DateTimeNullableFilter = {};
    if (filters.dueFrom) due.gte = filters.dueFrom;
    if (filters.dueTo) due.lte = filters.dueTo;
    and.push({ dueDate: due });
  }

  const q = filters.search?.trim();
  if (q) {
    and.push({
      OR: [{ title: { contains: q } }, { description: { contains: q } }],
    });
  }

  return and.length ? { AND: and } : {};
}

export const taskRepository = {
  async findMany(filters: TaskFilters): Promise<Task[]> {
    return prisma.task.findMany({
      where: buildWhere(filters),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
  },

  async findById(id: string): Promise<Task | null> {
    return prisma.task.findUnique({ where: { id } });
  },

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return prisma.task.create({ data });
  },

  async update(id: string, data: Prisma.TaskUpdateInput): Promise<Task> {
    return prisma.task.update({ where: { id }, data });
  },

  async delete(id: string): Promise<void> {
    await prisma.task.delete({ where: { id } });
  },

  async createManySubtasks(
    parentId: string,
    items: { title: string; description?: string | null; priority: Priority }[]
  ): Promise<Task[]> {
    return prisma.$transaction(
      items.map((item) =>
        prisma.task.create({
          data: {
            title: item.title,
            description: item.description ?? null,
            priority: item.priority,
            status: "PENDING",
            parent: { connect: { id: parentId } },
          },
        })
      )
    );
  },
};
