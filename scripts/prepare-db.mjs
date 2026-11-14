import "dotenv/config";

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { env } from "prisma/config";

const databaseUrl = env("DATABASE_URL");

const require = createRequire(import.meta.url);
const { Client } = require(
  require.resolve("pg", {
    paths: [require.resolve("@prisma/adapter-pg")],
  }),
);
const initialMigration = "20261113162000_init";

function prisma(args, allowedCodes = [0]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  if (!allowedCodes.includes(result.status)) {
    throw new Error(
      `Prisma ${args.slice(0, 2).join(" ")} falhou (código ${result.status}). Nenhum reset foi solicitado.`,
    );
  }
  return result.status;
}

async function main() {
  const url = new URL(databaseUrl);
  if (url.pathname !== "/bootcamp-treinos-api") {
    throw new Error(
      "O banco configurado não é bootcamp-treinos-api. Operação interrompida.",
    );
  }
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  let tables;
  let history;
  try {
    await client.connect();
    const server = await client.query(
      "select current_database() as database, current_user as username, version() as version",
    );
    console.log("Conexão Node.js confirmada:", server.rows[0]);
    tables = (
      await client.query(
        "select tablename from pg_tables where schemaname = 'public'",
      )
    ).rows.map((row) => row.tablename);
    if (tables.includes("_prisma_migrations")) {
      history = (
        await client.query(
          'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
        )
      ).rows;
    }
  } catch (error) {
    throw new Error(
      `Não foi possível inspecionar o banco (${error.code || "erro de conexão"}). Confira o container e a porta 5434.`,
    );
  } finally {
    await client.end();
  }

  if (
    history?.some(
      (row) =>
        !row.rolled_back_at &&
        (!row.finished_at || row.migration_name !== initialMigration),
    )
  ) {
    throw new Error(
      "Há migrations pendentes de resolução ou um histórico diferente do projeto. Inspecione antes de continuar.",
    );
  }

  const hasBaseline = history?.some(
    (row) =>
      row.migration_name === initialMigration &&
      row.finished_at &&
      !row.rolled_back_at,
  );
  const applicationTables = tables.filter(
    (table) => table !== "_prisma_migrations",
  );
  if (applicationTables.length) {
    const difference = prisma(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      [0, 2],
    );
    if (difference !== 0) {
      throw new Error(
        "O banco existente difere do schema. Nada foi aplicado; é necessária uma migration específica que preserve os dados.",
      );
    }
    if (!hasBaseline) {
      prisma(["migrate", "resolve", "--applied", initialMigration]);
      console.log(
        "Schema existente compatível: baseline registrada sem recriar tabelas.",
      );
    }
  } else if (hasBaseline) {
    throw new Error(
      "O histórico indica uma migration aplicada, mas as tabelas não existem. Operação interrompida.",
    );
  }

  prisma(["migrate", "deploy"]);
  prisma(["migrate", "status"]);
  console.log("Banco preparado, sem reset ou remoção de dados.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
