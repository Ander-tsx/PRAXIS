/**
 * Pintado de la terminal: color, cabeceras y tablas.
 *
 * Sin dependencias. Un `chalk` para esto son doce paquetes transitivos en un
 * script que solo necesita envolver texto en un código ANSI.
 */

/** Respeta NO_COLOR y las tuberías: `dev:cli | tee` no debe llenarse de escapes. */
const HAY_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;

export const color = (code, texto) => (HAY_COLOR ? `\x1b[${code}m${texto}\x1b[0m` : String(texto));

export const gris = (t) => color(90, t);
export const rojo = (t) => color(31, t);
export const verde = (t) => color(32, t);
export const ambar = (t) => color(33, t);
export const azul = (t) => color(36, t);
export const negrita = (t) => color(1, t);

/** Ancho real del texto, ignorando los códigos de color. */
export const ancho = (t) => t.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Rellena a la derecha contando el ancho visible, no el de la cadena. */
export const pad = (t, n) => t + ' '.repeat(Math.max(0, n - ancho(t)));

export function banner() {
  const linea = '─'.repeat(52);
  console.log(`\n${azul(linea)}`);
  console.log(`${negrita('  PRAXIS')} ${gris('· entorno de desarrollo')}`);
  console.log(`${azul(linea)}\n`);
}

export function titulo(texto) {
  console.log(`\n${negrita(texto)}`);
  console.log(gris('─'.repeat(Math.max(12, ancho(texto)))));
}

export function paso(texto) {
  console.log(`${azul('▸')} ${texto}`);
}

export function ok(texto) {
  console.log(`${verde('✔')} ${texto}`);
}

export function aviso(texto) {
  console.log(`${ambar('⚠')} ${texto}`);
}

export function error(texto) {
  console.log(`${rojo('✖')} ${texto}`);
}

/**
 * Tabla mínima con columnas alineadas.
 *
 * `filas` es un array de arrays ya coloreados; el ancho se calcula sobre el
 * texto visible para que el color no descuadre las columnas.
 */
export function tabla(cabeceras, filas) {
  const columnas = cabeceras.length;
  const anchos = new Array(columnas).fill(0);

  for (const fila of [cabeceras, ...filas]) {
    for (let i = 0; i < columnas; i++) {
      anchos[i] = Math.max(anchos[i], ancho(String(fila[i] ?? '')));
    }
  }

  const render = (fila) =>
    fila.map((celda, i) => pad(String(celda ?? ''), anchos[i])).join('  ').trimEnd();

  console.log(gris(render(cabeceras)));
  console.log(gris(anchos.map((a) => '─'.repeat(a)).join('  ')));
  for (const fila of filas) console.log(render(fila));
}

/**
 * Quita las secuencias que **borran la pantalla**.
 *
 * `nest start --watch` y `next dev` limpian la terminal en cada recompilación.
 * Con ocho procesos escribiendo a la vez, el primero que recompile se lleva por
 * delante la salida de los otros siete —incluido el error que estabas leyendo.
 * Los colores y el resto de escapes se dejan intactos.
 */
export function sinBorradoDePantalla(texto) {
  return texto
    .replace(/\x1Bc/g, '')
    .replace(/\x1B\[[0-9;]*[Hf]/g, '')
    .replace(/\x1B\[[23]?J/g, '');
}
