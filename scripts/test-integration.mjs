// Run after pnpm build. All auth, gateway and persistence calls are mocked.
import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET = "integration-test-secret-with-32-characters";
process.env.API_BASE_URL = "http://localhost:8081";
process.env.BETTER_AUTH_URL = "http://localhost:8081";
process.env.WEB_APP_BASE_URL = "http://localhost:3000";
process.env.ANTHROPIC_BASE_URL = "https://gpt.teamsoclo.site/v1";
process.env.ANTHROPIC_AUTH_TOKEN = "test-token-never-real";
process.env.GOOGLE_CLIENT_ID = "test-google-client";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
delete process.env.COOKIE_DOMAIN;

const userId = "11111111-1111-4111-8111-111111111111";
const prisma = { user: { findUnique: async () => null } };
global.prisma = prisma;
const { parseEnv } = await import("../dist/src/lib/env-schema.js");
const { env } = await import("../dist/src/lib/env.js");
const { auth } = await import("../dist/src/lib/auth.js");
const { CreateWorkoutPlan } =
  await import("../dist/src/usecases/CreateWorkoutPlan.js");
const { app } = await import("../dist/src/index.js");
await app.ready();

const valid = {
  DATABASE_URL: env.DATABASE_URL,
  BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
};

beforeEach(() => {
  mock.restoreAll();
  mock.method(auth.api, "getSession", async () => null);
});
after(async () => {
  mock.restoreAll();
  await app.close();
  delete global.prisma;
});

test("environment defaults preserve local ports, legacy URL and TeamSocLo", () => {
  const config = parseEnv({
    ...valid,
    BETTER_AUTH_URL: "http://localhost:8081",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  });
  assert.equal(config.PORT, 8081);
  assert.equal(config.API_BASE_URL, "http://localhost:8081");
  assert.equal(config.WEB_APP_BASE_URL, "http://localhost:3000");
  assert.equal(config.ANTHROPIC_BASE_URL, "https://gpt.teamsoclo.site/v1");
  assert.equal(config.GOOGLE_CLIENT_ID, undefined);
});

test("invalid environments fail without including input values", () => {
  for (const changes of [
    { PORT: "invalid" },
    { PORT: 0 },
    { PORT: 65536 },
    { DATABASE_URL: "secret-invalid-url" },
    { BETTER_AUTH_SECRET: "short-secret" },
    { GOOGLE_CLIENT_ID: "client-without-secret" },
    {
      API_BASE_URL: "http://localhost:8081",
      BETTER_AUTH_URL: "http://localhost:8082",
    },
    { WEB_APP_BASE_URL: "https://example.com/path" },
    { WEB_APP_BASE_URL: "invalid-url" },
    { ANTHROPIC_BASE_URL: "https://gpt.teamsoclo.site" },
    {
      COOKIE_DOMAIN: ".unrelated.example",
      API_BASE_URL: "https://api.example.com",
      WEB_APP_BASE_URL: "https://app.example.com",
    },
    { NODE_ENV: "production" },
  ]) {
    assert.throws(
      () => parseEnv({ ...valid, ...changes }),
      (error) => {
        assert.match(error.message, /^Invalid environment variables:/);
        for (const value of Object.values(changes))
          assert.ok(!error.message.includes(String(value)));
        return true;
      },
    );
  }
  const config = parseEnv({
    ...valid,
    NODE_ENV: "production",
    API_BASE_URL: "https://api.example.com",
    WEB_APP_BASE_URL: "https://app.example.com",
    COOKIE_DOMAIN: ".example.com",
  });
  assert.equal(config.COOKIE_DOMAIN, ".example.com");
});

test("email/password remains enabled alongside optional Google", () => {
  assert.equal(auth.options.emailAndPassword.enabled, true);
  assert.equal(
    auth.options.socialProviders.google.clientId,
    "test-google-client",
  );
  assert.equal(auth.options.socialProviders.google.prompt, "select_account");
  assert.equal(auth.options.baseURL, env.API_BASE_URL);
});

test("CORS permits only the configured frontend and supports credentialed preflight", async () => {
  const allowed = await app.inject({
    method: "OPTIONS",
    url: "/ai",
    headers: {
      origin: env.WEB_APP_BASE_URL,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(allowed.statusCode, 204);
  assert.equal(
    allowed.headers["access-control-allow-origin"],
    env.WEB_APP_BASE_URL,
  );
  assert.equal(allowed.headers["access-control-allow-credentials"], "true");
  const blocked = await app.inject({
    url: "/",
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(blocked.headers["access-control-allow-origin"], undefined);
});

test("OpenAPI operations retain generated client names and auth has a separate schema", async () => {
  const response = await app.inject("/swagger.json");
  assert.equal(response.statusCode, 200);
  const { paths } = response.json();
  const ids = Object.values(paths).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId),
  );
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(!Object.keys(paths).some((path) => path.startsWith("/api/auth")));
  assert.deepEqual(
    new Set(ids),
    new Set([
      "getRoot",
      "getHomeData",
      "getUserTrainData",
      "putMe",
      "getStats",
      "getWorkoutPlans",
      "postWorkoutPlans",
      "getWorkoutPlan",
      "getWorkoutDay",
      "startWorkoutSession",
      "updateWorkoutSession",
      "postAi",
    ]),
  );
});

test("existing protected routes still reject unauthenticated requests", async () => {
  for (const url of [
    "/home/2026-11-13",
    "/me",
    "/stats?from=2026-11-01&to=2026-11-13",
    "/workout-plans",
  ]) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 401, url);
  }
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/ai",
        payload: { messages: [] },
      })
    ).statusCode,
    401,
  );
});

test("auth forwarding preserves multiple cookies and uses the configured public URL", async () => {
  mock.method(auth, "handler", async (request) => {
    assert.equal(new URL(request.url).origin, env.API_BASE_URL);
    const headers = new Headers();
    headers.append("set-cookie", "session=mock; HttpOnly; Path=/");
    headers.append("set-cookie", "state=mock; HttpOnly; Path=/");
    return new Response(JSON.stringify({ ok: true }), { headers });
  });
  const result = await app.inject("/api/auth/get-session");
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["set-cookie"].length, 2);
});

test("missing Coach token retains the existing authenticated 503 response", async () => {
  mock.method(auth.api, "getSession", async () => ({ user: { id: userId } }));
  const token = env.ANTHROPIC_AUTH_TOKEN;
  try {
    env.ANTHROPIC_AUTH_TOKEN = undefined;
    const response = await app.inject({
      method: "POST",
      url: "/ai",
      payload: { messages: [] },
    });
    assert.equal(response.statusCode, 503);
  } finally {
    env.ANTHROPIC_AUTH_TOKEN = token;
  }
});

function sse(block, stopReason) {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block:
        block.type === "text"
          ? { type: "text", text: "" }
          : { type: "tool_use", id: block.id, name: block.name, input: {} },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta:
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : {
              type: "input_json_delta",
              partial_json: JSON.stringify(block.input),
            },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: "message_stop" },
  ];
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("upstream failures never expose gateway response data or use SDK raw error logging", async () => {
  mock.method(auth.api, "getSession", async () => ({ user: { id: userId } }));
  const consoleError = mock.method(console, "error", () => {});
  mock.method(
    global,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            type: "authentication_error",
            message: "private-upstream-sentinel",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
  );
  const response = await app.inject({
    method: "POST",
    url: "/ai",
    payload: {
      messages: [
        { id: "u", role: "user", parts: [{ type: "text", text: "Olá" }] },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"error"/);
  assert.ok(!response.body.includes("private-upstream-sentinel"));
  assert.ok(!response.body.includes(env.ANTHROPIC_AUTH_TOKEN));
  assert.equal(consoleError.mock.callCount(), 0);
});

test("Coach streams Messages API via TeamSocLo, retaining history and workout creation tool", async () => {
  mock.method(auth.api, "getSession", async () => ({ user: { id: userId } }));
  const created = mock.method(
    CreateWorkoutPlan.prototype,
    "execute",
    async (input) => ({ id: "mock-plan", ...input }),
  );
  const days = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].map((weekDay) => ({
    weekDay,
    name: "Rest",
    isRest: true,
    exercises: [],
    estimatedDurationInSeconds: 0,
    coverImageUrl: "https://example.com/cover.jpg",
  }));
  const bodies = [];
  mock.method(global, "fetch", async (url, options) => {
    assert.equal(String(url), "https://gpt.teamsoclo.site/v1/messages");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("authorization"), "Bearer test-token-never-real");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    assert.equal(headers.get("x-api-key"), null);
    const body = JSON.parse(options.body);
    assert.equal(body.model, "claude-haiku-4-5");
    assert.equal(body.stream, true);
    bodies.push(body);
    if (bodies.length === 1)
      return sse(
        {
          type: "tool_use",
          id: "tool_user",
          name: "getUserTrainData",
          input: {},
        },
        "tool_use",
      );
    if (bodies.length === 2)
      return sse(
        {
          type: "tool_use",
          id: "tool_plan",
          name: "createWorkoutPlan",
          input: { name: "Test plan", workoutDays: days },
        },
        "tool_use",
      );
    return sse({ type: "text", text: "Plano criado com sucesso." }, "end_turn");
  });
  const response = await app.inject({
    method: "POST",
    url: "/ai",
    payload: {
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [
            { type: "text", text: "Quero treinar três vezes por semana." },
          ],
        },
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Qual seu objetivo?" }],
        },
        {
          id: "u2",
          role: "user",
          parts: [{ type: "text", text: "Monte meu plano para hipertrofia." }],
        },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/event-stream/);
  assert.equal(response.headers["x-vercel-ai-ui-message-stream"], "v1");
  assert.match(response.body, /Plano criado com sucesso/);
  assert.match(response.body, /tool-output-available/);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0].messages.length, 3);
  assert.match(JSON.stringify(bodies[2].messages), /tool_result/);
  assert.equal(created.mock.callCount(), 1);
  assert.equal(created.mock.calls[0].arguments[0].userId, userId);
  assert.deepEqual(created.mock.calls[0].arguments[0].workoutDays, days);
});
