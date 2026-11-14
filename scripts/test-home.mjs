// Run after `pnpm build`: node --test scripts/test-home.mjs
// All persistence and authentication calls are mocked; this suite never writes to the DB.
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, mock, test } from "node:test";

import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

const prisma = {
  workoutPlan: { findFirst: async () => null },
  workoutSession: { findMany: async () => [] },
};
global.prisma = prisma;
const { auth } = await import("../dist/src/lib/auth.js");
const { homeRoutes } = await import("../dist/src/routes/home.js");

const app = Fastify();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
await app.register(homeRoutes, { prefix: "/home" });
const userId = randomUUID();
const planId = randomUUID();

beforeEach(() => {
  mock.restoreAll();
  mock.method(auth.api, "getSession", async () => ({ user: { id: userId } }));
  mock.method(prisma.workoutPlan, "findFirst", async () => null);
  mock.method(prisma.workoutSession, "findMany", async () => []);
});

after(async () => {
  mock.restoreAll();
  await app.close();
  delete global.prisma;
});

test("no active plan is a successful null response, scoped to the session user", async () => {
  const response = await app.inject("/home/2026-11-13");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json(), null);
  assert.deepEqual(
    prisma.workoutPlan.findFirst.mock.calls[0].arguments[0].where,
    { userId, isActive: true },
  );
  assert.equal(prisma.workoutSession.findMany.mock.callCount(), 0);
});

test("an active plan keeps today's workout and consistency data", async () => {
  mock.method(prisma.workoutPlan, "findFirst", async () => ({
    id: planId,
    workoutDays: [
      {
        id: randomUUID(),
        name: "Friday",
        weekDay: "FRIDAY",
        isRest: false,
        estimatedDurationInSeconds: 1800,
        coverImageUrl: null,
        exercises: [{}],
        sessions: [],
      },
    ],
  }));
  const response = await app.inject("/home/2026-11-13");
  assert.equal(response.statusCode, 200);
  const data = response.json();
  assert.equal(data.activeWorkoutPlanId, planId);
  assert.equal(data.todayWorkoutDay.exercisesCount, 1);
  assert.equal(data.todayWorkoutDay.weekDay, "FRIDAY");
  assert.equal(data.workoutStreak, 0);
  assert.equal(Object.keys(data.consistencyByDay).length, 7);
});

test("an inconsistent active plan still returns 404", async () => {
  mock.method(prisma.workoutPlan, "findFirst", async () => ({
    id: planId,
    workoutDays: [],
  }));
  const response = await app.inject("/home/2026-11-13");
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "No workout day found for today");
});

test("database errors remain 500, not onboarding", async () => {
  mock.method(prisma.workoutPlan, "findFirst", async () => {
    throw new Error("DB unavailable");
  });
  const response = await app.inject("/home/2026-11-13");
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().code, "INTERNAL_SERVER_ERROR");
});

test("anonymous access remains 401 without querying plans", async () => {
  mock.method(auth.api, "getSession", async () => null);
  const response = await app.inject("/home/2026-11-13");
  assert.equal(response.statusCode, 401);
  assert.equal(prisma.workoutPlan.findFirst.mock.callCount(), 0);
});

test("invalid dates remain validation errors", async () => {
  const response = await app.inject("/home/invalid-date");
  assert.equal(response.statusCode, 400);
  assert.equal(prisma.workoutPlan.findFirst.mock.callCount(), 0);
});
