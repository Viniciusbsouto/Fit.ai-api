// Creates one test account, without adding physical data or workout plans.
// FITAI_API_URL defaults to the regular API; FITAI_FRONTEND_URL enables SSR checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const api = process.env.FITAI_API_URL || "http://localhost:8081";
const frontend = process.env.FITAI_FRONTEND_URL;
const email = `fitai-first-access-${Date.now()}@example.com`;
const password = randomUUID();
let cookie = "";

async function request(path, { method = "GET", body, status = 200 } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  const cookies = response.headers.getSetCookie();
  if (cookies.length)
    cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  return response.json();
}

const date = new Date().toISOString().slice(0, 10);
await request(`/home/${date}`, { status: 401 });
const registered = await request("/api/auth/sign-up/email", {
  method: "POST",
  body: { name: "First access validation", email, password },
});
assert(cookie, "Signup must issue a session cookie");
const session = await request("/api/auth/get-session");
assert.equal(session.user.id, registered.user.id);
assert.equal(session.user.email, email);
assert.equal(await request("/me"), null);
assert.equal(await request(`/home/${date}`), null);
assert.deepEqual(await request("/workout-plans"), []);
console.log(
  "PASS: signup, session cookie, profile absent, home 200/null, no plans.",
);

await request("/api/auth/sign-out", { method: "POST", body: {} });
cookie = "";
await request(`/home/${date}`, { status: 401 });
await request("/api/auth/sign-in/email", {
  method: "POST",
  body: { email, password },
});
assert.equal(
  (await request("/api/auth/get-session")).user.id,
  registered.user.id,
);
assert.equal(await request(`/home/${date}`), null);
console.log(
  "PASS: persisted account, logout, login, first access still has no plan.",
);

if (frontend) {
  const home = await fetch(frontend, {
    headers: { Cookie: cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(120000),
  });
  const homeHtml = await home.text();
  // Next may send a redirect in streamed HTML after the headers have been flushed.
  assert(
    ([307, 308].includes(home.status) &&
      home.headers.get("location") === "/onboarding") ||
      (home.status === 200 &&
        homeHtml.includes("NEXT_REDIRECT;replace;/onboarding;")),
    `Home must redirect to onboarding (HTTP ${home.status})`,
  );
  const onboarding = await fetch(`${frontend}/onboarding`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(120000),
  });
  const html = await onboarding.text();
  assert.equal(onboarding.status, 200);
  assert(html.includes("Coach AI"), "Onboarding must render the embedded chat");
  assert(!html.includes("Failed to fetch home data"));
  console.log(
    "PASS: authenticated home redirects to onboarding; Coach AI renders.",
  );
}

await request("/api/auth/sign-out", { method: "POST", body: {} });
console.log("Test account kept without physical data or plans:", email);
