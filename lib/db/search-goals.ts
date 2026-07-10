import { prisma } from "@/lib/db/prisma";

export async function getSearchGoals() {
  return prisma.searchGoal.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        select: { id: true },
      },
      candidates: {
        select: {
          status: true,
        },
      },
    },
  });
}

export async function getSearchGoalDetail(goalId: string) {
  return prisma.searchGoal.findUnique({
    where: { id: goalId },
    include: {
      runs: {
        orderBy: { createdAt: "asc" },
        include: {
          candidates: {
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            include: {
              company: true,
            },
          },
        },
      },
      candidates: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          company: true,
        },
      },
    },
  });
}
