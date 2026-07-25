#!/usr/bin/env node

/**
 * backend-build.mjs
 *
 * Compila todo el backend con un solo comando:
 *   1. Descubre servicios automáticamente
 *   2. Genera Prisma clients (paralelo)
 *   3. Compila commons (paralelo)
 *   4. Compila gateway + servicios (paralelo)
 *
 * Uso: node scripts/backend-build.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ── Colores ANSI ────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, "..");
const SERVICES_DIR = resolve(ROOT, "apps/backend/services");
const COMMONS_DIR = resolve(ROOT, "apps/backend/commons");
const GATEWAY_DIR = resolve(ROOT, "apps/backend/gateway");

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(emoji, msg) {
  console.log(`\n${emoji}  ${c.bold}${msg}${c.reset}`);
}

function logStep(name, status) {
  const icon = status === "ok" ? `${c.green}✓` : `${c.red}✗`;
  console.log(`   ${icon} ${name}${c.reset}`);
}

function timer() {
  const start = performance.now();
  return () => ((performance.now() - start) / 1000).toFixed(1);
}

/**
 * Ejecuta un comando en un cwd dado.
 * Retorna una promesa que resuelve con { ok, name, duration }.
 */
function run(name, cmd, cwd) {
  return new Promise((res) => {
    const elapsed = timer();
    const proc = spawn(cmd, { cwd, shell: true, stdio: "pipe" });

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.stdout.on("data", () => {}); // drain

    proc.on("close", (code) => {
      const ok = code === 0;
      logStep(`${name} ${c.dim}(${elapsed()}s)`, ok ? "ok" : "fail");
      if (!ok) {
        console.error(`${c.red}${stderr.trim()}${c.reset}`);
      }
      res({ ok, name });
    });
  });
}

/**
 * Ejecuta varias tareas en paralelo. Retorna true si todas fueron exitosas.
 */
async function runParallel(tasks) {
  const results = await Promise.all(tasks);
  return results.every((r) => r.ok);
}

// ── Descubrimiento ──────────────────────────────────────────────────────────
function discoverServices() {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      path: resolve(SERVICES_DIR, d.name),
      hasPrisma: existsSync(resolve(SERVICES_DIR, d.name, "prisma/schema.prisma")),
    }));
}

function discoverCommons() {
  return readdirSync(COMMONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => {
      const pkgPath = resolve(COMMONS_DIR, d.name, "package.json");
      return existsSync(pkgPath);
    })
    .map((d) => ({
      name: d.name,
      path: resolve(COMMONS_DIR, d.name),
    }));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const totalTime = timer();

  console.log(`\n${c.cyan}${c.bold}━━━ PRAXIS Backend Build ━━━${c.reset}\n`);

  const services = discoverServices();
  const commons = discoverCommons();
  const prismaServices = services.filter((s) => s.hasPrisma);

  console.log(`${c.dim}Servicios:  ${services.map((s) => s.name).join(", ")}`);
  console.log(`Commons:    ${commons.map((s) => s.name).join(", ")}`);
  console.log(`Con Prisma: ${prismaServices.map((s) => s.name).join(", ")}${c.reset}`);

  // ── Step 1: Prisma Generate ──────────────────────────────────────────
  if (prismaServices.length > 0) {
    log("📦", "Generando Prisma clients...");
    const ok = await runParallel(
      prismaServices.map((s) =>
        run(s.name, "npx prisma generate --schema ./prisma/schema.prisma", s.path)
      )
    );
    if (!ok) return exit(1, "Prisma generate falló");
  }

  // ── Step 2: Build Commons ────────────────────────────────────────────
  if (commons.length > 0) {
    log("🏗️ ", "Compilando commons...");
    const ok = await runParallel(
      commons.map((s) => run(s.name, "pnpm run build", s.path))
    );
    if (!ok) return exit(1, "Build de commons falló");
  }

  // ── Step 3: Build Gateway + Services ─────────────────────────────────
  log("🏗️ ", "Compilando gateway + servicios...");
  const buildTargets = [
    { name: "gateway", path: GATEWAY_DIR },
    ...services.map((s) => ({ name: s.name, path: s.path })),
  ];

  const ok = await runParallel(
    buildTargets.map((t) => run(t.name, "npx nest build", t.path))
  );
  if (!ok) return exit(1, "Build de servicios falló");

  // ── Done ─────────────────────────────────────────────────────────────
  console.log(
    `\n${c.green}${c.bold}✅ Build completado en ${totalTime()}s${c.reset}\n`
  );
}

function exit(code, msg) {
  console.error(`\n${c.red}${c.bold}❌ ${msg}${c.reset}\n`);
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
