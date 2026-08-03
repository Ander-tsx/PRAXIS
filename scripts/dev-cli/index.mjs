#!/usr/bin/env node
/**
 * `pnpm dev:cli` — asistente para levantar PRAXIS en local.
 *
 * ## Qué aporta frente a los comandos sueltos del README
 *
 * Levantar solo lo que necesitas, y **saber si arrancó**. Esto último es la
 * mitad del valor: `turbo run dev` deja ocho procesos escupiendo logs
 * entrelazados y averiguar cuál no llegó a levantar se hace mirando puertos a
 * mano. Aquí cada servicio declara el suyo y el CLI espera a que responda.
 *
 * ## Cómo estaba
 *
 * No funcionaba, y lo peor es que no lo parecía. El catálogo apuntaba a un
 * layout de repo anterior —`apps/backend/<x>-service` en vez de
 * `apps/backend/services/<x>`—, así que los pasos que usaban `dir` (rellenar
 * `.env`) no encontraban nada y **volvían en silencio**, mientras el arranque
 * seguía funcionando porque caía a `pnpm --filter <paquete>`. Faltaban además
 * `reports-service` entero, el `prisma generate` y la mitad de los paquetes
 * compartidos que hay que compilar.
 *
 * `config/services.mjs` lo explica en detalle y `revisarCatalogo()` impide que
 * vuelva a pasar sin avisar.
 */

import readline from 'node:readline';
import inquirer from 'inquirer';

import {
  BACKEND_SERVICES,
  FRONTEND_APPS,
  FRONTEND_TURBO_SERVICE,
  PRESETS,
  revisarCatalogo,
} from './config/index.mjs';
import { esperarPuerto, estadoDePuertos, quienOcupa } from './lib/ports.mjs';
import { arrancar, detener, detenerTodo, estaCorriendo, reiniciar, usarEscritor } from './lib/proc.mjs';
import {
  compilarCompartidos,
  completarEnv,
  docker,
  esperarPostgres,
  prismaGenerate,
  prismaReset,
  prismaSeed,
  revisarEnvFaltantes,
} from './lib/steps.mjs';
import { ambar, azul, banner, error, gris, negrita, ok, paso, rojo, tabla, titulo, verde } from './lib/ui.mjs';

// ── Comprobaciones previas ──────────────────────────────────────────────────

/**
 * Sin TTY no hay asistente que valga.
 *
 * Antes reventaba con un `ExitPromptError` y treinta líneas de stack de
 * inquirer, que no dice en ningún sitio que el problema sea que lo has pipeado.
 */
function exigirTerminal() {
  if (process.stdin.isTTY) return;

  console.error(rojo('\n✖  pnpm dev:cli necesita una terminal interactiva.'));
  console.error(gris('   Lo has lanzado con la entrada redirigida (una tubería, CI, un editor).'));
  console.error(gris('   Para un arranque no interactivo usa los comandos del README:\n'));
  console.error(gris('     docker compose -f infra/docker/compose/docker-compose.yml up -d'));
  console.error(gris('     npx turbo run dev --filter=@praxis/gateway --filter="@praxis/*-service"'));
  console.error(gris('     pnpm dev:frontend\n'));
  process.exit(1);
}

function exigirCatalogoSano() {
  const problemas = revisarCatalogo();
  if (problemas.length === 0) return;

  console.error(rojo('\n✖  El catálogo del CLI no cuadra con el repositorio:\n'));
  for (const p of problemas) console.error(rojo(`   · ${p}`));
  console.error(gris('\n   Alguien movió o renombró carpetas. Actualiza scripts/dev-cli/config/services.mjs.\n'));
  process.exit(1);
}

// ── Preguntas ───────────────────────────────────────────────────────────────

async function preguntarQueLevantar() {
  const { preset } = await inquirer.prompt([
    {
      type: 'select',
      name: 'preset',
      message: '¿Qué quieres levantar?',
      choices: PRESETS.map((p) => ({ name: p.nombre, value: p.key })),
      pageSize: 10,
    },
  ]);

  const elegido = PRESETS.find((p) => p.key === preset);
  if (elegido.backend !== null) {
    return {
      backend: BACKEND_SERVICES.filter((s) => elegido.backend.includes(s.key)),
      frontend: elegido.frontend,
    };
  }

  const { claves } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'claves',
      message: 'Servicios del backend',
      pageSize: 12,
      choices: BACKEND_SERVICES.map((s) => ({
        name: `${s.key.padEnd(12)} ${gris(`:${s.port}`.padEnd(6))} ${gris(s.descripcion)}`,
        value: s.key,
        checked: true,
      })),
    },
  ]);

  const { frontend } = await inquirer.prompt([
    { type: 'confirm', name: 'frontend', message: 'Levantar también las 5 zonas del frontend', default: true },
  ]);

  return { backend: BACKEND_SERVICES.filter((s) => claves.includes(s.key)), frontend };
}

async function preguntarPreparacion(backend) {
  const hayPrisma = backend.some((s) => s.prisma);
  const haySeed = backend.some((s) => s.seedOrder !== null);

  return inquirer.prompt([
    {
      type: 'select',
      name: 'docker',
      message: 'Postgres y Redis',
      choices: [
        { name: 'Levantar si no están (up -d)', value: 'up' },
        { name: 'Reiniciar de cero (down + up -d)', value: 'restart' },
        { name: 'Ya están, no tocar', value: 'skip' },
      ],
      default: 'up',
    },
    {
      type: 'confirm',
      name: 'env',
      message: 'Completar los .env que falten desde .env.example',
      default: true,
    },
    {
      type: 'confirm',
      name: 'generate',
      message: 'Generar los clientes de Prisma (obligatorio en un clon nuevo)',
      default: true,
      when: () => hayPrisma,
    },
    {
      type: 'confirm',
      name: 'reset',
      message: ambar('Recrear las tablas — BORRA TODOS LOS DATOS'),
      default: false,
      when: () => hayPrisma,
    },
    {
      /* Se pregunta siempre que haya seeds, no solo tras un reset: sembrar
         sobre una base ya poblada es legítimo —los seeds saltan lo que ya
         existe— y es como se recupera el usuario de demostración sin perder el
         trabajo. Eso sí, si acabas de recrear las tablas lo normal es querer
         sembrar, así que la respuesta por defecto sigue a la anterior. */
      type: 'confirm',
      name: 'seed',
      message: 'Ejecutar los seeds',
      default: (r) => r.reset === true,
      when: () => haySeed,
    },
  ]);
}

// ── Arranque ────────────────────────────────────────────────────────────────

/**
 * Avisa de los puertos ya ocupados **antes** de arrancar nada.
 *
 * Sin esto el servicio arranca, muere con EADDRINUSE en mitad de un muro de
 * logs de otros siete procesos, y el CLI se queda tan tranquilo.
 */
async function revisarPuertosOcupados(servicios) {
  const puertos = servicios.flatMap((s) => s.puertosVigilados ?? (s.port ? [s.port] : []));
  const estado = await estadoDePuertos(puertos);
  const ocupados = [...estado.entries()].filter(([, libre]) => libre).map(([p]) => p);

  if (ocupados.length === 0) return true;

  console.log();
  error(`Puertos ya ocupados: ${ocupados.join(', ')}`);

  for (const puerto of ocupados) {
    const quien = await quienOcupa(puerto);
    console.log(gris(quien ? `  :${puerto} → ${quien.cmd} (pid ${quien.pid})` : `  :${puerto} → no se pudo averiguar quién`));
  }

  const { seguir } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'seguir',
      message: 'Arrancar igualmente (los que choquen morirán)',
      default: false,
    },
  ]);

  return seguir;
}

/** Arranca todo y espera a que cada puerto conteste, informando de cuál no llegó. */
async function arrancarYEsperar(servicios) {
  titulo('Arrancando');

  for (const svc of servicios) {
    paso(`${svc.key} ${gris(svc.descripcion ?? '')}`);
    arrancar(svc);
  }

  console.log(gris('\n  Esperando a que respondan…\n'));

  const esperas = servicios.map(async (svc) => {
    const puertos = svc.puertosVigilados ?? (svc.port ? [svc.port] : []);
    if (puertos.length === 0) return { svc, ms: 0, listo: true };

    const tiempos = await Promise.all(puertos.map((p) => esperarPuerto(p)));
    const listo = tiempos.every((t) => t !== null);

    return { svc, ms: Math.max(...tiempos.map((t) => t ?? 0)), listo };
  });

  const resultados = await Promise.all(esperas);

  console.log();
  tabla(
    ['SERVICIO', 'PUERTO', 'ESTADO', 'TIEMPO'],
    resultados.map(({ svc, ms, listo }) => [
      azul(svc.key),
      gris((svc.puertosVigilados ?? [svc.port]).join(', ')),
      listo ? verde('listo') : rojo('no responde'),
      gris(listo ? `${(ms / 1000).toFixed(1)}s` : '—'),
    ]),
  );

  const caidos = resultados.filter((r) => !r.listo);
  if (caidos.length > 0) {
    console.log();
    error(`No llegaron a levantar: ${caidos.map((r) => r.svc.key).join(', ')}`);
    console.log(gris('  Mira sus líneas más arriba. Lo más habitual en un clon nuevo:'));
    console.log(gris("  · Cannot find module '../generated/prisma-client'  → responde sí a «generar clientes»"));
    console.log(gris("  · Cannot find module '@praxis/contracts'           → se compila solo al arrancar"));
    console.log(gris('  · falta el .env                                    → responde sí a «completar .env»'));
  }

  return resultados;
}

// ── REPL ────────────────────────────────────────────────────────────────────

const AYUDA = `
  ${negrita('rs')} <servicio|all>     reinicia (hace falta tras recompilar contracts)
  ${negrita('stop')} <servicio|all>   detiene
  ${negrita('start')} <servicio|all>  vuelve a arrancar algo detenido
  ${negrita('status')}                estado y puertos, comprobados de verdad
  ${negrita('help')}                  esto
  ${negrita('exit')}                  detiene todo y sale
`;

async function mostrarEstado(servicios) {
  const filas = await Promise.all(
    servicios.map(async (svc) => {
      const puertos = svc.puertosVigilados ?? (svc.port ? [svc.port] : []);
      const estado = await estadoDePuertos(puertos);
      const respondiendo = puertos.length > 0 && [...estado.values()].every(Boolean);
      const vivo = estaCorriendo(svc.key);

      /* Proceso vivo pero puerto mudo es el estado interesante: o sigue
         compilando, o murió por dentro sin cerrar. Merece su propia palabra. */
      const texto = !vivo
        ? gris('detenido')
        : respondiendo
          ? verde('listo')
          : ambar('arrancando…');

      return [azul(svc.key), gris(puertos.join(', ') || '—'), texto];
    }),
  );

  console.log();
  tabla(['SERVICIO', 'PUERTO', 'ESTADO'], filas);
  console.log();
}

function iniciarRepl(servicios) {
  console.log(gris(`\nEscribe ${negrita('help')}${gris(' para ver los comandos.')}\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: azul('praxis> ') });

  /**
   * Escribir por debajo del prompt sin destrozarlo.
   *
   * Se borra la línea del prompt, se escribe el log y se repinta. El `true` de
   * `rl.prompt()` conserva lo que llevaras tecleado: sin él, cada línea de log
   * —y hay nueve servicios escribiendo— te borraba el comando a medias.
   */
  usarEscritor((texto) => {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(texto);
    rl.prompt(true);
  });

  rl.prompt();

  const resolver = (arg) =>
    arg === 'all' ? servicios : servicios.filter((s) => s.key === arg);

  rl.on('line', async (linea) => {
    const [cmd, arg] = linea.trim().split(/\s+/);

    try {
      switch (cmd) {
        case '':
          break;

        case 'rs':
        case 'stop':
        case 'start': {
          if (!arg) {
            console.log(rojo(`uso: ${cmd} <servicio|all>`));
            break;
          }
          const objetivo = resolver(arg);
          if (objetivo.length === 0) {
            console.log(rojo(`no conozco «${arg}». Servicios: ${servicios.map((s) => s.key).join(', ')}`));
            break;
          }
          if (cmd === 'rs') await Promise.all(objetivo.map(reiniciar));
          else if (cmd === 'stop') await Promise.all(objetivo.map((s) => detener(s)));
          else objetivo.filter((s) => !estaCorriendo(s.key)).forEach((s) => arrancar(s));
          break;
        }

        case 'status':
          await mostrarEstado(servicios);
          break;

        case 'help':
          console.log(AYUDA);
          break;

        case 'exit':
        case 'quit':
          await salir(rl);
          return;

        default:
          console.log(rojo(`comando desconocido: ${cmd}`));
          console.log(gris('escribe «help»'));
      }
    } catch (err) {
      console.log(rojo(`falló «${cmd}»: ${err.message}`));
    }

    rl.prompt();
  });

  /**
   * Ctrl-C apaga **esperando** a los hijos.
   *
   * La versión anterior llamaba a `process.exit(0)` justo después de mandar
   * SIGTERM, así que el CLI desaparecía antes de que nadie muriera y dejaba
   * ocho procesos huérfanos con los puertos cogidos. El siguiente arranque
   * fallaba con EADDRINUSE culpando a nadie.
   */
  let apagando = false;
  process.on('SIGINT', async () => {
    if (apagando) return;
    apagando = true;
    await salir(rl);
  });
}

async function salir(rl) {
  /* Se vuelve al escritor simple antes de apagar: repintar el prompt detrás de
     cada línea de despedida deja una columna de «praxis>» que ya no acepta
     nada. Cerrar readline primero evita además que capture el último Enter. */
  usarEscritor((texto) => process.stdout.write(texto));
  rl?.close();

  console.log(gris('\nDeteniendo servicios…'));
  await detenerTodo();
  ok('Todo detenido');
  process.exit(0);
}

// ── Principal ───────────────────────────────────────────────────────────────

async function main() {
  exigirTerminal();
  exigirCatalogoSano();
  banner();

  const { backend, frontend } = await preguntarQueLevantar();

  if (backend.length === 0 && !frontend) {
    console.log(ambar('\nNo has elegido nada. Saliendo.'));
    return;
  }

  const respuestas = await preguntarPreparacion(backend);

  const objetivosDeEnv = [...backend, ...(frontend ? FRONTEND_APPS : [])];
  const objetivosDeArranque = [...backend, ...(frontend ? [FRONTEND_TURBO_SERVICE] : [])];

  titulo('Preparando');

  docker(respuestas.docker);

  if (respuestas.docker !== 'skip' && backend.some((s) => s.prisma)) {
    if (!esperarPostgres()) {
      error('Postgres no aceptó conexiones. ¿Está bien el contenedor?');
      process.exit(1);
    }
    ok('Postgres acepta conexiones');
  }

  if (respuestas.env) {
    paso('Archivos de entorno');
    const resultados = [];
    for (const svc of objetivosDeEnv) resultados.push(await completarEnv(svc));

    const completados = resultados.filter((r) => r.estado === 'completado');
    const sinPlantilla = resultados.filter((r) => r.estado === 'sin-plantilla');

    ok(
      completados.length > 0
        ? `${completados.length} archivo(s) completado(s)`
        : 'Todos los .env estaban completos',
    );
    if (sinPlantilla.length > 0) {
      console.log(gris(`  Sin .env.example ni .env: ${sinPlantilla.map((r) => r.key).join(', ')}`));
    }
  }

  revisarEnvFaltantes(objetivosDeEnv);

  /* Antes que Prisma: sus esquemas no dependen de esto, pero los servicios sí,
     y compilar primero deja el árbol coherente si algo falla a mitad. */
  if (backend.length > 0) compilarCompartidos();

  if (respuestas.generate) prismaGenerate(backend);
  if (respuestas.reset) prismaReset(backend);
  if (respuestas.seed) prismaSeed(backend);

  if (!(await revisarPuertosOcupados(objetivosDeArranque))) {
    console.log(ambar('\nCancelado. Libera los puertos y vuelve a lanzarlo.'));
    return;
  }

  await arrancarYEsperar(objetivosDeArranque);

  if (frontend) {
    console.log(`\n  ${negrita('Entra por')} ${azul('http://localhost:4100')}`);
  }
  if (backend.some((s) => s.key === 'gateway')) {
    console.log(`  ${negrita('Swagger')}   ${azul('http://localhost:3000/api/docs')}`);
  }

  iniciarRepl(objetivosDeArranque);
}

main().catch(async (err) => {
  /* Ctrl-C durante una pregunta no es un fallo: es alguien que se ha
     arrepentido. Inquirer lo señala con `ExitPromptError`, y tratarlo como
     error imprimía «User force closed the prompt with 0 null» —en inglés y sin
     sentido— al final de una sesión que había ido bien. */
  if (err?.name === 'ExitPromptError') {
    console.log(gris('\nCancelado.'));
    await detenerTodo();
    process.exit(0);
  }

  console.error(rojo(`\n✖  ${err.message}`));
  if (process.env.DEBUG) console.error(err);
  await detenerTodo();
  process.exit(1);
});
