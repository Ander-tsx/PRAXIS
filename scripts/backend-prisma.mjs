#!/usr/bin/env node

/**
 * backend-prisma.mjs
 *
 * Script unificado para operaciones de Prisma en todos los servicios.
 *
 * Uso:
 *   node scripts/backend-prisma.mjs generate   → Genera Prisma clients
 *   node scripts/backend-prisma.mjs migrate    → Ejecuta migrate deploy
 *   node scripts/backend-prisma.mjs reset      → Reset de bases de datos (sin seed)
 *   node scripts/backend-prisma.mjs seed       → Ejecuta seed en orden
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline";

// ── Colores ANSI ────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, "..");
const SERVICES_DIR = resolve(ROOT, "apps/backend/services");

/**
 * Orden de seeding. Los servicios que no están aquí se ejecutan al final.
 * Este orden respeta dependencias entre datos.
 */
const SEED_ORDER = ["permissions", "credentials", "projects", "tasks"];

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(emoji, msg) {
  console.log(`\n${emoji}  ${c.bold}${msg}${c.reset}`);
}

function logStep(name, ok) {
  const icon = ok ? `${c.green}✓` : `${c.red}✗`;
  console.log(`   ${icon} ${name}${c.reset}`);
}

function timer() {
  const start = performance.now();
  return () => ((performance.now() - start) / 1000).toFixed(1);
}

/**
 * Ejecuta un comando en un cwd dado.
 */
function run(name, cmd, cwd) {
  return new Promise((res) => {
    const elapsed = timer();
    const proc = spawn(cmd, { cwd, shell: true, stdio: "pipe" });

    let stderr = "";
    let stdout = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.stdout.on("data", (d) => (stdout += d.toString()));

    proc.on("close", (code) => {
      const ok = code === 0;
      logStep(`${name} ${c.dim}(${elapsed()}s)`, ok);
      if (!ok) {
        const output = (stderr || stdout).trim();
        if (output) console.error(`     ${c.red}${output.split("\n").join("\n     ")}${c.reset}`);
      }
      res({ ok, name });
    });
  });
}

async function runParallel(tasks) {
  const results = await Promise.all(tasks);
  return results.every((r) => r.ok);
}

async function runSequential(tasks) {
  for (const taskFn of tasks) {
    const result = await taskFn();
    if (!result.ok) return false;
  }
  return true;
}

function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(`${c.yellow}⚠️  ${question} (s/N): ${c.reset}`, (answer) => {
      rl.close();
      res(answer.toLowerCase() === "s" || answer.toLowerCase() === "si");
    });
  });
}

// ── Descubrimiento ──────────────────────────────────────────────────────────
function discoverPrismaServices() {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(resolve(SERVICES_DIR, d.name, "prisma/schema.prisma")))
    .map((d) => ({
      name: d.name,
      path: resolve(SERVICES_DIR, d.name),
    }));
}

function hasSeedScript(servicePath) {
  try {
    const pkgPath = resolve(servicePath, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return !!pkg.scripts?.["prisma:seed"];
  } catch {
    return false;
  }
}

function sortByOrder(services, order) {
  const ordered = [];
  for (const name of order) {
    const svc = services.find((s) => s.name === name);
    if (svc) ordered.push(svc);
  }
  // Agregar servicios que no están en el orden definido
  for (const svc of services) {
    if (!order.includes(svc.name)) ordered.push(svc);
  }
  return ordered;
}

// ── Comandos ────────────────────────────────────────────────────────────────
async function cmdGenerate(services) {
  log("📦", "Generando Prisma clients...");
  const ok = await runParallel(
    services.map((s) =>
      run(s.name, "npx prisma generate --schema ./prisma/schema.prisma", s.path)
    )
  );
  return ok;
}

async function cmdMigrate(services) {
  log("🔄", "Ejecutando migrate deploy...");
  const ok = await runParallel(
    services.map((s) =>
      run(s.name, "npx prisma migrate deploy --schema ./prisma/schema.prisma", s.path)
    )
  );
  return ok;
}

async function cmdReset(services) {
  const confirmed = await confirm(
    "Esto eliminará TODOS los datos de las bases de datos. ¿Continuar?"
  );
  if (!confirmed) {
    console.log(`${c.dim}Cancelado.${c.reset}`);
    return true;
  }

  log("💥", "Reseteando bases de datos...");
  // Reset secuencial para evitar conflictos de conexión
  const ok = await runSequential(
    services.map((s) => () =>
      run(
        s.name,
        "npx prisma migrate reset --force --skip-seed --schema ./prisma/schema.prisma",
        s.path
      )
    )
  );
  return ok;
}

async function cmdSeed(services) {
  const ordered = sortByOrder(services, SEED_ORDER);

  log("🌱", `Ejecutando seed (orden: ${ordered.map((s) => s.name).join(" → ")})...`);

  // Seed debe ser secuencial para respetar dependencias
  const ok = await runSequential(
    ordered.map((s) => () => run(s.name, "pnpm run prisma:seed", s.path))
  );
  return ok;
}

// ── Main ────────────────────────────────────────────────────────────────────
const COMMANDS = {
  generate: cmdGenerate,
  migrate: cmdMigrate,
  reset: cmdReset,
  seed: cmdSeed,
};

async function main() {
  const action = process.argv[2];

  if (!action || !COMMANDS[action]) {
    console.log(`
${c.cyan}${c.bold}PRAXIS — Prisma Management${c.reset}

${c.bold}Uso:${c.reset} node scripts/backend-prisma.mjs <comando>

${c.bold}Comandos:${c.reset}
  generate   Genera Prisma clients en todos los servicios
  migrate    Ejecuta migrate deploy en todos los servicios
  reset      Resetea todas las bases de datos (con confirmación)
  seed       Ejecuta seed en orden de dependencias
`);
    process.exit(action ? 1 : 0);
  }

  const totalTime = timer();
  console.log(`\n${c.cyan}${c.bold}━━━ PRAXIS Prisma: ${action} ━━━${c.reset}`);

  const services = discoverPrismaServices();

  if (services.length === 0) {
    console.log(`${c.yellow}No se encontraron servicios con Prisma.${c.reset}`);
    return;
  }

  console.log(
    `${c.dim}Servicios: ${services.map((s) => s.name).join(", ")}${c.reset}`
  );

  const ok = await COMMANDS[action](services);

  if (ok) {
    console.log(
      `\n${c.green}${c.bold}✅ ${action} completado en ${totalTime()}s${c.reset}\n`
    );
  } else {
    console.error(
      `\n${c.red}${c.bold}❌ ${action} falló después de ${totalTime()}s${c.reset}\n`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
