import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.FITAI_API_URL || "http://localhost:8081";
let cookie = "";

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(180000),
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length) {
    cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
  }
  assert(response.ok, `${method} ${path}: HTTP ${response.status}`);
  return response;
}

async function main() {
  const email = `fitai-demo-${Date.now()}@example.com`;
  const password = randomUUID();
  await request("/api/auth/sign-up/email", {
    method: "POST",
    body: { name: "Demonstração FIT.AI", email, password },
  });
  assert(cookie, "Cadastro não retornou cookie de sessão");
  await request("/api/auth/sign-out", { method: "POST", body: {} });
  cookie = "";
  await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  const session = await (await request("/api/auth/get-session")).json();
  assert.equal(session.user.email, email);
  console.log("OK: cadastro, logout, login e sessão. Conta de teste:", email);

  await request("/me", {
    method: "PUT",
    body: {
      weightInGrams: 70000,
      heightInCentimeters: 175,
      age: 30,
      bodyFatPercentage: 20,
    },
  });
  const profile = await (await request("/me")).json();
  assert.equal(profile.weightInGrams, 70000);
  console.log("OK: preenchimento e consulta dos dados físicos.");

  const ai = await request("/ai", {
    method: "POST",
    body: {
      messages: [
        {
          id: randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: "Consulte meus dados. Atualize meu peso para 71 kg, mantendo altura 175 cm, idade 30 anos e gordura 20%. Quero um plano para hipertrofia com treinos segunda, quarta e sexta, descansando nos demais dias. Sou iniciante, tenho academia completa e nenhuma lesão ou restrição física. Pode criar e salvar agora o plano completo de 7 dias usando suas ferramentas, sem mais perguntas.",
            },
          ],
        },
      ],
    },
  });
  const stream = await ai.text();
  const events = stream
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
  assert(
    !events.some(
      (event) => event.type === "error" || event.type === "tool-output-error",
    ),
    "Claude retornou erro no stream; verifique chave, créditos e conectividade da API.",
  );
  assert(
    events.some((event) => event.type === "text-delta"),
    "Claude não retornou texto.",
  );
  const tools = events
    .filter((event) => event.type === "tool-input-available")
    .map((event) => event.toolName);
  for (const tool of [
    "getUserTrainData",
    "updateUserTrainData",
    "createWorkoutPlan",
  ]) {
    assert(tools.includes(tool), `Claude não executou a ferramenta ${tool}.`);
  }
  const updated = await (await request("/me")).json();
  assert.equal(updated.weightInGrams, 71000);
  const plans = await (await request("/workout-plans?active=true")).json();
  assert(plans.length > 0, "Claude não salvou um plano.");
  const plan = await (await request(`/workout-plans/${plans[0].id}`)).json();
  assert.equal(plan.workoutDays.length, 7);
  assert.equal(new Set(plan.workoutDays.map((day) => day.weekDay)).size, 7);
  console.log(
    "OK: stream real do Claude, consulta e atualização do perfil, geração, salvamento e consulta do plano.",
  );

  const day = plan.workoutDays.find((item) => !item.isRest);
  assert(day, "Plano sem dia de treino.");
  const path = `/workout-plans/${plan.id}/days/${day.id}`;
  await request(path);
  const started = await (
    await request(`${path}/sessions`, { method: "POST" })
  ).json();
  await request(`${path}/sessions/${started.id}`, {
    method: "PATCH",
    body: { completedAt: new Date().toISOString() },
  });
  const today = new Date().toISOString().slice(0, 10);
  const stats = await (
    await request(`/stats?from=${today}&to=${today}`)
  ).json();
  assert.equal(stats.completedWorkoutsCount, 1);
  await request(`/home/${today}`);
  console.log(
    "OK: consulta do treino, início e conclusão da sessão, home e estatísticas.",
  );
  console.log(
    "Validação da API concluída. A conta e o treino de teste foram mantidos no banco. A interface visual deve ser validada no navegador.",
  );
}

main().catch((error) => {
  console.error(
    "FALHA:",
    error instanceof Error ? error.message : "Erro de validação",
  );
  process.exitCode = 1;
});
