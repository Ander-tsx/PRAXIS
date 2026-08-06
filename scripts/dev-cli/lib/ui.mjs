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

export const violeta = (t) => color(95, t);
export const cian = (t) => color(96, t);

/**
 * Ancho útil de la terminal. 80 si no hay forma de saberlo.
 *
 * ⚠️ Es `||` y no `??` a propósito. `process.stdout.columns` puede valer **0**
 * —un pty al que nadie le ha fijado tamaño, que es lo que pasa bajo `expect` o
 * dentro de algunos ejecutores de CI— y con `??` ese cero pasa el filtro: el
 * ancho queda en 0, todo se considera demasiado estrecho y la interfaz se cae
 * al modo pobre en una terminal que iba perfectamente.
 */
export const anchoTerminal = () => process.stdout.columns || 80;

const LOGO = [
  '██████╗ ██████╗  █████╗ ██╗  ██╗██╗███████╗',
  '██╔══██╗██╔══██╗██╔══██╗╚██╗██╔╝██║██╔════╝',
  '██████╔╝██████╔╝███████║ ╚███╔╝ ██║███████╗',
  '██╔═══╝ ██╔══██╗██╔══██║ ██╔██╗ ██║╚════██║',
  '██║     ██║  ██║██║  ██║██╔╝ ██╗██║███████║',
  '╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝',
];

/**
 * La portada.
 *
 * El logo mide 43 columnas. En una terminal más estrecha —o sin color, que
 * suele significar que esto va a un archivo— se cae a una línea de texto: un
 * bloque partido a la mitad se lee mucho peor que un título simple.
 *
 * El degradado va por líneas y no por caracteres a propósito: por carácter son
 * cientos de escapes ANSI por fotograma y el resultado, en una terminal con
 * poco contraste, es un logo que parece sucio.
 */
export function banner() {
  if (!HAY_COLOR || anchoTerminal() < 46) {
    console.log(`\n${negrita('PRAXIS')} ${gris('· entorno de desarrollo')}\n`);
    return;
  }

  /**
   * De morado a azul, siguiendo los tokens de la interfaz web: arranca por
   * encima de `primary` (#6C63FF) y baja hasta `info` (#60A5FA).
   *
   * Son códigos de la paleta de 256 y no color verdadero (`38;2;r;g;b`) porque
   * el Terminal.app de macOS no lo admite y ahí el degradado se vería plano.
   * Los 256 los pinta cualquier terminal de este siglo.
   */
  const degradado = [
    '38;5;141', // lavanda
    '38;5;99', // violeta
    '38;5;63', // índigo — el `primary` del sistema
    '38;5;69', // azul violáceo
    '38;5;75', // azul — el `info` del sistema
    '38;5;81', // azul claro
  ];

  console.log();
  LOGO.forEach((linea, i) => console.log(`  ${color(degradado[i], linea)}`));
  console.log(`  ${gris('entorno de desarrollo local')}\n`);
}

/**
 * Un recuadro, para lo que no se debe perder entre los logs.
 *
 * Se usa al final, con las direcciones: es lo único que se va a buscar con la
 * vista después de un arranque que ha escupido cien líneas.
 */
export function caja(lineas, tono = azul) {
  const util = Math.max(...lineas.map(ancho));
  const borde = '─'.repeat(util + 2);

  console.log(tono(`╭${borde}╮`));
  for (const linea of lineas) console.log(`${tono('│')} ${pad(linea, util)} ${tono('│')}`);
  console.log(tono(`╰${borde}╯`));
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
    fila
      .map((celda, i) => pad(String(celda ?? ''), anchos[i]))
      .join('  ')
      .trimEnd();

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

// ── Spinners ────────────────────────────────────────────────────────────────

const FOTOGRAMAS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Un indicador de «esto está trabajando», con el tiempo transcurrido.
 *
 * ⚠️ **Solo se anima si hay TTY.** Sin terminal, `\r` no vuelve al principio de
 * la línea: escribe el carácter, así que un spinner de treinta segundos deja
 * trescientas líneas de basura en el log. Sin TTY imprime una línea al empezar
 * y otra al terminar, que es lo que sirve en un archivo.
 *
 * El tiempo importa más de lo que parece: sin él, un `prisma generate` que
 * tarda cuarenta segundos y un proceso colgado se ven exactamente igual.
 */
export function spinner(texto) {
  const arranque = Date.now();
  const transcurrido = () => ((Date.now() - arranque) / 1000).toFixed(1);

  if (!HAY_COLOR) {
    console.log(`  ${texto}…`);
    return {
      exito: (final) => console.log(`  ✔ ${final ?? texto} (${transcurrido()}s)`),
      fallo: (final) => console.log(`  ✖ ${final ?? texto} (${transcurrido()}s)`),
      actualizar: () => {},
    };
  }

  let i = 0;
  let etiqueta = texto;

  const pintar = () => {
    const marco = color(96, FOTOGRAMAS[i++ % FOTOGRAMAS.length]);
    process.stdout.write(`\r\x1b[2K  ${marco} ${etiqueta} ${gris(`${transcurrido()}s`)}`);
  };

  pintar();
  const temporizador = setInterval(pintar, 80);

  const cerrar = (icono, final) => {
    clearInterval(temporizador);
    process.stdout.write(
      `\r\x1b[2K  ${icono} ${final ?? etiqueta} ${gris(`${transcurrido()}s`)}\n`,
    );
  };

  return {
    actualizar: (nuevo) => {
      etiqueta = nuevo;
    },
    exito: (final) => cerrar(verde('✔'), final),
    fallo: (final) => cerrar(rojo('✖'), final),
  };
}

/**
 * Lista de tareas que se van resolviendo, repintada en su sitio.
 *
 * Es lo que se enseña mientras arrancan los servicios: en vez de un «espera…»
 * mudo durante cuarenta segundos, se ve cuál ya responde y cuál sigue. Sin TTY
 * no se repinta nada —solo el resultado final— por el mismo motivo que el
 * spinner.
 */
export function listaViva(elementos) {
  const estados = new Map(elementos.map((e) => [e.key, 'pendiente']));
  let i = 0;
  let lineasPintadas = 0;

  const pintar = () => {
    if (!HAY_COLOR) return;

    /* Sube hasta el principio del bloque anterior y lo reescribe entero. Es más
       simple y más robusto que mover el cursor línea a línea, y a esta escala
       —una decena de filas— el parpadeo no se aprecia. */
    if (lineasPintadas > 0) process.stdout.write(`\x1b[${lineasPintadas}A`);

    for (const el of elementos) {
      const estado = estados.get(el.key);
      const icono =
        estado === 'listo'
          ? verde('✔')
          : estado === 'fallo'
            ? rojo('✖')
            : color(96, FOTOGRAMAS[i % FOTOGRAMAS.length]);

      /* `el.detalle` se pinta tal cual: lo colorea quien llama. Envolverlo aquí
         en `gris()` lo dejaba anidado dos veces, y el reset del interior cerraba
         el gris exterior a media línea. */
      const detalle =
        estado === 'listo'
          ? (el.detalle ?? '')
          : estado === 'fallo'
            ? rojo('no responde')
            : gris('arrancando…');

      process.stdout.write(`\x1b[2K  ${icono} ${pad(azul(el.key), 22)} ${detalle}\n`);
    }

    lineasPintadas = elementos.length;
    i++;
  };

  pintar();
  const temporizador = HAY_COLOR ? setInterval(pintar, 80) : null;

  return {
    resolver: (key, estado, detalle) => {
      estados.set(key, estado);
      const el = elementos.find((e) => e.key === key);
      if (el) el.detalle = detalle;
    },
    terminar: () => {
      if (temporizador) clearInterval(temporizador);
      pintar();
    },
  };
}
