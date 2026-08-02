#!/usr/bin/env node
import inquirer from "inquirer";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import {
  ROOT,
  DOCKER_COMPOSE_FILE,
  SENSITIVE_KEY_RE,
  label,
  BACKEND_SERVICES,
  FRONTEND_APPS,
  ALL_SERVICES
} from "./config/index.mjs";

const color = (code, text) => `\x1b[${code}m${text}\x1b[0m`;

function sh(cmd, opts = {}) {
  console.log(color(90, `$ ${cmd}`));
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function parseEnvFile(content) {
  const map = new Map();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    map.set(key, value);
  }
  return map;
}

function serializeEnv(map) {
  return `${Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("\n")} \n`;
}

const ESC = "\x1B";
function stripClearScreen(text) {
  return text
    .replace(new RegExp(`${ESC}c`, "g"), "")
    .replace(new RegExp(`${ESC}\\[[0-9;]*[Hf]`, "g"), "")
    .replace(new RegExp(`${ESC}\\[[23]?J`, "g"), "");
}

function getDevCommand(svc) {
  const pkgJsonPath = path.join(ROOT, svc.dir, "package.json");
  let devScript = null;

  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    devScript = pkgJson.scripts?.dev ?? null;
  }

  if (!devScript) {
    return { cmd: "pnpm", args: ["--filter", svc.pkg, "run", "dev"], cwd: ROOT };
  }

  const withoutWatch = devScript
    .replace(/--watch(=\S+)?/g, "")
    .replace(/(^|\s)-w(?=\s|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cmd: withoutWatch, args: [], cwd: path.join(ROOT, svc.dir), shellString: true };
}

async function ensureEnvFile(svc) {
  const dir = path.join(ROOT, svc.dir);
  const examplePath = path.join(dir, ".env.example");
  const envPath = path.join(dir, ".env");

  if (!fs.existsSync(examplePath)) return;

  const exampleMap = parseEnvFile(fs.readFileSync(examplePath, "utf8"));
  const existingMap = fs.existsSync(envPath)
    ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
    : new Map();

  const missingKeys = [...exampleMap.keys()].filter((k) => !existingMap.has(k));
  if (missingKeys.length === 0) return;

  console.log(color(36, `\n[env] ${svc.pkg}: faltan ${missingKeys.length} variable(s), completando...`));

  for (const key of missingKeys) {
    const defaultValue = exampleMap.get(key);
    if (SENSITIVE_KEY_RE.test(key)) {
      const { value } = await inquirer.prompt([
        {
          type: "input",
          name: "value",
          message: `  ${svc.pkg} -> ${key}`,
          default: defaultValue,
        },
      ]);
      existingMap.set(key, value);
    } else {
      existingMap.set(key, defaultValue);
    }
  }

  fs.writeFileSync(envPath, serializeEnv(existingMap));
  console.log(color(32, `[env] ${svc.pkg}: .env actualizado`));
}

function prismaReset(svc) {
  sh(`pnpm --filter ${svc.pkg} exec prisma migrate reset --force --skip-seed`);
}

function prismaSeed(svc) {
  sh(`pnpm --filter ${svc.pkg} run prisma:seed`);
}

function buildDependencies(selected) {
  const deps = new Set();
  for (const svc of selected) {
    for (const dep of svc.buildDeps ?? []) deps.add(dep);
  }
  if (deps.size === 0) return;

  console.log(color(90, `\n> compilando dependencias compartidas: ${[...deps].join(", ")}`));
  for (const dep of deps) {
    sh(`pnpm --filter ${dep} run build`);
  }
}

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const running = new Map();

function prefix(svc) {
  return color(svc.color, `[${svc.key}]`.padEnd(14));
}

function pipeWithPrefix(stream, svc) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += stripClearScreen(chunk.toString());
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      process.stdout.write(`${prefix(svc)}${line}\n`);
    }
  });
}

function startService(svc) {
  if (running.has(svc.key)) return;
  const { cmd, args, cwd, shellString } = getDevCommand(svc);
  console.log(color(90, `\n> arrancando ${svc.pkg} (${shellString ? cmd : `${cmd} ${args.join(" ")}`})...`));
  const child = shellString
    ? spawn(cmd, { cwd, shell: true, env: process.env })
    : spawn(cmd, args, { cwd, shell: true, env: process.env });
  pipeWithPrefix(child.stdout, svc);
  pipeWithPrefix(child.stderr, svc);
  child.on("exit", (code) => {
    process.stdout.write(`${prefix(svc)}${color(90, `proceso terminó (code ${code})`)}\n`);
    running.delete(svc.key);
  });
  running.set(svc.key, child);
}

function stopService(svc, signal = "SIGTERM") {
  const child = running.get(svc.key);
  if (!child) return;
  child.kill(signal);
  running.delete(svc.key);
}

function restartService(svc) {
  console.log(color(90, `\n> reiniciando ${svc.pkg}...`));
  buildDependencies([svc]);
  const child = running.get(svc.key);
  if (!child) {
    startService(svc);
    return;
  }
  child.once("exit", () => startService(svc));
  child.kill("SIGTERM");
}

function stopAll() {
  for (const svc of ALL_SERVICES) stopService(svc);
}

function startRepl(selectedServices) {
  console.log(
    color(
      90,
      "\nComandos disponibles: rs <servicio|all>  |  stop <servicio|all>  |  list  |  help  |  exit\n"
    )
  );
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const [cmd, arg] = line.trim().split(/\s+/);
    const target = arg
      ? selectedServices.filter((s) => s.key === arg || arg === "all")
      : [];

    switch (cmd) {
      case "rs":
        if (!arg) return console.log(color(31, "uso: rs <servicio|all>"));
        if (target.length === 0) return console.log(color(31, `servicio desconocido: ${arg}`));
        target.forEach(restartService);
        break;
      case "stop":
        if (!arg) return console.log(color(31, "uso: stop <servicio|all>"));
        for (const s of target) {
          stopService(s);
        }
        break;
      case "list":
        for (const s of selectedServices) {
          console.log(
            `${prefix(s)}${running.has(s.key) ? color(32, "running") : color(90, "stopped")}`
          );
        }
        break;
      case "help":
        console.log("rs <servicio|all>  stop <servicio|all>  list  exit");
        break;
      case "exit":
        stopAll();
        process.exit(0);
        break;
      default:
        if (cmd) console.log(color(31, `comando desconocido: ${cmd}`));
    }
  });

  process.on("SIGINT", () => {
    console.log(color(90, "\nDeteniendo todos los servicios..."));
    stopAll();
    process.exit(0);
  });
}

async function main() {
  const { backendKeys } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "backendKeys",
      message: "Backend: ¿qué servicios quieres levantar?",
      choices: BACKEND_SERVICES.map((s) => ({ name: label(s), value: s.key })),
      pageSize: 15,
    },
  ]);

  const { frontendKeys } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "frontendKeys",
      message: "Frontend: ¿qué apps quieres levantar?",
      choices: FRONTEND_APPS.map((s) => ({ name: label(s), value: s.key })),
      pageSize: 15,
    },
  ]);

  const selectedKeys = [...backendKeys, ...frontendKeys];
  const selected = ALL_SERVICES.filter((s) => selectedKeys.includes(s.key));
  const selectedBackend = selected.filter((s) => BACKEND_SERVICES.includes(s));

  if (selected.length === 0) {
    console.log(color(33, "No seleccionaste ningún servicio. Saliendo."));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: "select",
      name: "docker",
      message: "¿Qué hacer con docker compose?",
      choices: [
        { name: "Levantar (up -d)", value: "up" },
        { name: "Reiniciar (down + up -d)", value: "restart" },
        { name: "No hacer nada", value: "skip" },
      ],
      default: "up",
    },
    {
      type: "confirm",
      name: "fillEnv",
      message: "¿Completar .env desde .env.example en los servicios elegidos?",
      default: true,
    },
    {
      type: "confirm",
      name: "prismaReset",
      message: "¿Resetear base de datos (prisma migrate reset) en los servicios elegidos?",
      default: false,
      when: () => selectedBackend.some((s) => s.prisma),
    },
    {
      type: "confirm",
      name: "prismaSeed",
      message: "¿Correr seeders en los servicios elegidos?",
      default: false,
      when: (a) => selectedBackend.some((s) => s.seed),
    },
  ]);

  if (answers.docker === "up") {
    sh(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`);
  } else if (answers.docker === "restart") {
    sh(`docker compose -f ${DOCKER_COMPOSE_FILE} down`);
    sh(`docker compose -f ${DOCKER_COMPOSE_FILE} up -d`);
  }

  if (answers.fillEnv) {
    for (const svc of selected) await ensureEnvFile(svc);
  }

  if (answers.prismaReset) {
    for (const svc of selectedBackend.filter((s) => s.prisma)) prismaReset(svc);
  }
  if (answers.prismaSeed) {
    for (const svc of selectedBackend.filter((s) => s.seed)) prismaSeed(svc);
  }

  buildDependencies(selected);

  for (const svc of selected) startService(svc);

  startRepl(selected);
}

main().catch((err) => {
  console.error(err);
  stopAll();
  process.exit(1);
});
