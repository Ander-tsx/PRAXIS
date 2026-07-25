#!/usr/bin/env node

/**
 * backend-dev.mjs
 *
 * Orquesta el entorno de desarrollo del backend sin Turbo:
 *   1. Genera Prisma clients (paralelo)
 *   2. Compila commons (una vez)
 *   3. Lanza commons en modo watch
 *   4. Lanza gateway + servicios en modo watch
 *   5. Agrega todos los logs con colores por servicio
 *
 * Uso: node scripts/backend-dev.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Colores ANSI ────────────────────────────────────────────────────────────
const COLORS = [
  "\x1b[36m", // cyan
  "\x1b[33m", // yellow
  "\x1b[35m", // magenta
  "\x1b[32m", // green
  "\x1b[34m", // blue
  "\x1b[91m", // bright red
  "\x1b[93m", // bright yellow
  "\x1b[95m", // bright magenta
  "\x1b[96m", // bright cyan
  "\x1b[92m", // bright green
];

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
};

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, "..");
const SERVICES_DIR = resolve(ROOT, "apps/backend/services");
const COMMONS_DIR = resolve(ROOT, "apps/backend/commons");
const GATEWAY_DIR = resolve(ROOT, "apps/backend/gateway");

// ── State ───────────────────────────────────────────────────────────────────
/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let colorIndex = 0;
let shuttingDown = false;

// ── Helpers ─────────────────────────────────────────────────────────────────
function getColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

function pad(str, len) {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function prefixedSpawn(label, cmd, cwd, color) {
  const tag = `${color}${c.bold}[${pad(label, 14)}]${c.reset}`;
  const proc = spawn(cmd, { cwd, shell: true, stdio: "pipe" });
  children.push(proc);

  const pipeLines = (stream) => {
    let buffer = "";
    stream.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) console.log(`${tag} ${line}`);
      }
    });
  };

  pipeLines(proc.stdout);
  pipeLines(proc.stderr);

  proc.on("close", (code) => {
    if (!shuttingDown) {
      console.log(`${tag} ${c.dim}proceso terminó con código ${code}${c.reset}`);
    }
  });

  return proc;
}

/**
 * Ejecuta un comando y espera a que termine.
 */
function exec(cmd, cwd) {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, { cwd, shell: true, stdio: "pipe" });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.stdout.on("data", () => {});
    proc.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`${cmd} falló (código ${code}): ${stderr.trim()}`));
    });
  });
}

function logStep(name, ok) {
  const icon = ok ? `${c.green}✓` : `${c.red}✗`;
  console.log(`   ${icon} ${name}${c.reset}`);
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
    .filter((d) => existsSync(resolve(COMMONS_DIR, d.name, "package.json")))
    .map((d) => ({
      name: d.name,
      path: resolve(COMMONS_DIR, d.name),
    }));
}

// ── Shutdown ────────────────────────────────────────────────────────────────
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${c.cyan}${c.bold}🛑 Deteniendo todos los procesos...${c.reset}`);

  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ya terminó
    }
  }

  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ya terminó
      }
    }
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.cyan}${c.bold}━━━ PRAXIS Backend Dev ━━━${c.reset}\n`);

  const services = discoverServices();
  const commons = discoverCommons();
  const prismaServices = services.filter((s) => s.hasPrisma);

  console.log(`${c.dim}Servicios:  ${services.map((s) => s.name).join(", ")}`);
  console.log(`Commons:    ${commons.map((s) => s.name).join(", ")}`);
  console.log(`Con Prisma: ${prismaServices.map((s) => s.name).join(", ")}${c.reset}`);

  // ── Step 1: Prisma Generate ──────────────────────────────────────────
  if (prismaServices.length > 0) {
    console.log(`\n📦  ${c.bold}Generando Prisma clients...${c.reset}`);
    const results = await Promise.allSettled(
      prismaServices.map(async (s) => {
        await exec("npx prisma generate --schema ./prisma/schema.prisma", s.path);
        logStep(s.name, true);
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`${c.red}   ${f.reason.message}${c.reset}`);
      }
      console.error(`\n${c.red}${c.bold}❌ Prisma generate falló${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 2: Build Commons (una vez) ──────────────────────────────────
  if (commons.length > 0) {
    console.log(`\n🏗️   ${c.bold}Compilando commons (inicial)...${c.reset}`);
    const results = await Promise.allSettled(
      commons.map(async (s) => {
        await exec("pnpm run build", s.path);
        logStep(s.name, true);
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`${c.red}   ${f.reason.message}${c.reset}`);
      }
      console.error(`\n${c.red}${c.bold}❌ Build de commons falló${c.reset}`);
      process.exit(1);
    }
  }

  // ── Step 3: Lanzar commons en watch ──────────────────────────────────
  console.log(`\n👀  ${c.bold}Iniciando watch de commons...${c.reset}`);
  for (const s of commons) {
    // Solo hacer watch si tiene script "dev" en su package.json
    try {
      const pkg = JSON.parse(readFileSync(resolve(s.path, "package.json"), "utf-8"));
      if (!pkg.scripts?.dev) {
        console.log(`   ${c.dim}⏭  ${s.name} (sin script dev, omitido)${c.reset}`);
        continue;
      }
    } catch {
      continue;
    }
    const color = getColor();
    prefixedSpawn(s.name, "pnpm run dev", s.path, color);
  }

  // Dar un segundo para que el watch de commons se establezca
  await new Promise((res) => setTimeout(res, 1500));

  // ── Step 4: Lanzar gateway + servicios ───────────────────────────────
  console.log(`\n🚀  ${c.bold}Iniciando gateway + servicios...${c.reset}\n`);

  const gwColor = getColor();
  prefixedSpawn("gateway", "npx nest start --watch", GATEWAY_DIR, gwColor);

  for (const s of services) {
    const color = getColor();
    prefixedSpawn(s.name, "npx nest start --watch", s.path, color);
  }

  console.log(
    `\n${c.green}${c.bold}✅ Todos los procesos iniciados. Ctrl+C para detener.${c.reset}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
