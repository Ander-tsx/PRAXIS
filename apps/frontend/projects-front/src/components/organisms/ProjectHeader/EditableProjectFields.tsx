'use client';

import { alpha, colors } from '@praxis/commons';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { saveProjectFieldAction, settleProjectAction } from '@/app/(private)/[id]/actions';
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  validateProject,
} from '@/lib/validation';

export interface EditableProjectFieldsProps {
  projectId: string;
  initialName: string;
  initialDescription: string;
  /**
   * Va en la fila del título, a la derecha del campo.
   *
   * Es un slot y no una prop `isOwner` porque la insignia es del proyecto, no de
   * la edición: este componente no tiene por qué saber qué dice. Patrón de
   * `AuthForm` y `AppHeader`.
   */
  badgeSlot?: ReactNode;
}

/** Milisegundos de silencio antes de guardar. */
const DEBOUNCE_MS = 700;

type FieldStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Nombre y descripción del proyecto, editables en el sitio donde se leen.
 *
 * Antes eran texto plano y solo se podían cambiar con `curl`. Se comportan como
 * en un documento compartido: **parecen texto, al hacer clic son un campo, y se
 * guardan solos**.
 *
 * ### Por qué son campos siempre, y no texto que se convierte al pulsar
 *
 * Cambiar el `<h2>` por un `<input>` en el clic obliga a devolver el foco a mano
 * y a acertar con el momento —el primer carácter se pierde si el `focus()` llega
 * tarde—, y deja al teclado sin forma de entrar. Aquí el campo está desde el
 * principio y lo que cambia es solo cómo se pinta: sin borde en reposo, con
 * fondo al pasar por encima y con anillo al enfocar. Se tabula hasta él como a
 * cualquier campo.
 *
 * ### Las tres trampas, y cómo se sortean
 *
 * 1. **`Project.name` es único por dueño, así que un guardado a medio texto puede
 *    dar 409.** «Rediseño» pasa por «Redi» camino de su nombre final. Por eso se
 *    guarda tras `DEBOUNCE_MS` de silencio y no en cada tecla, y por eso un 409
 *    **no toca el texto**: el mensaje sale debajo y lo escrito sigue donde estaba,
 *    listo para seguir. Lo contrario —revertir al valor del servidor— borraría lo
 *    que la persona está escribiendo justo cuando más le importa.
 * 2. **La página es un Server Component con el árbol entero del proyecto detrás.**
 *    El guardado **no revalida nada**; la revalidación es una sola, al salir del
 *    campo (`settleProjectAction`). Se intentó primero revalidar solo `/` desde el
 *    guardado, confiando en que la documentación dice que eso actualiza la
 *    interfaz «si estás viendo esa ruta»: en el navegador el detalle se
 *    re-renderizaba igual, y cada pulsación volvía a pedir el proyecto, sus
 *    espacios y las tareas de cada tablero.
 * 3. **El título vive en tres sitios**: aquí, en `AppHeader` y en la pestaña del
 *    navegador (`generateMetadata`). La revalidación se encarga de los dos
 *    primeros. La pestaña se escribe a mano al confirmar el guardado, porque
 *    `generateMetadata` solo se vuelve a evaluar al navegar y quedarse con el
 *    nombre viejo en la pestaña se nota.
 *
 * El valor que llega por props **no pisa lo que se está escribiendo**: se usa
 * como estado inicial y nada más. Si no, la revalidación del punto 2 devolvería
 * el cursor al principio en cuanto el servidor respondiera.
 */
export function EditableProjectFields({
  projectId,
  initialName,
  initialDescription,
  badgeSlot,
}: EditableProjectFieldsProps) {
  /**
   * ¿Se ha guardado algo desde la última revalidación?
   *
   * Hace falta separado del `flush()` de cada campo, y el motivo se vio en el
   * navegador: al salir del campo, el debounce **ya había guardado**, así que
   * `flush()` no tenía nada que hacer y devolvía «no». Con eso como señal, la
   * revalidación no se disparaba nunca y el `<h1>` se quedaba con el nombre
   * viejo. «Acabo de guardar ahora» y «hay algo que poner al día» no son la
   * misma pregunta.
   */
  const savedSinceSettle = useRef(false);
  const markSaved = useCallback(() => {
    savedSinceSettle.current = true;
  }, []);

  const name = useAutosave({
    initial: initialName,
    validate: (value) => validateProject({ name: value }),
    save: (value) => saveProjectFieldAction({ projectId, name: value }),
    onSaved: (saved) => {
      markSaved();
      /* La pestaña, que la revalidación no recalcula: `generateMetadata` solo se
         vuelve a evaluar al navegar. El sufijo es el `template` del layout de la
         zona: '%s | Praxis'. */
      document.title = `${saved} | Praxis`;
    },
  });

  const description = useAutosave({
    initial: initialDescription,
    validate: (value) => validateProject({ name: 'ok', description: value }),
    save: (value) => saveProjectFieldAction({ projectId, description: value }),
    onSaved: markSaved,
  });

  /**
   * Una sola revalidación, al salir del campo.
   *
   * Es lo que pone al día el `<h1>` de `AppHeader` y la tarjeta de la lista. Va
   * aquí y no dentro del guardado porque **cualquier** `revalidatePath` desde una
   * Server Function vuelve a renderizar esta ruta, y esta ruta es el árbol entero
   * del proyecto: pagarlo por pulsación es lo que se quería evitar.
   *
   * Solo si algo cambió de verdad: salir del campo sin tocar nada no debe costar
   * un re-render.
   */
  const settle = useCallback(async () => {
    /* Los dos: al salir de uno puede quedar pendiente lo escrito en el otro. */
    await name.flush();
    await description.flush();

    if (!savedSinceSettle.current) return;
    savedSinceSettle.current = false;
    await settleProjectAction(projectId);
  }, [name, description, projectId]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* La rejilla de una celda hace que el campo mida **lo que mide su
            texto**: el `<span>` invisible ocupa el mismo hueco y dicta el
            ancho. Sin esto el input abarcaría toda la fila y se leería como un
            formulario en reposo, además de empujar la insignia al final. */}
        <span className="grid min-w-0 max-w-full">
          {/* ⚠️ El fantasma lleva **el mismo borde** que el campo, aunque no se
              vea: si no, mide 2 px menos y el campo se queda corto. */}
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 whitespace-pre border border-transparent px-2 font-display text-3xl sm:text-4xl"
          >
            {name.value || 'Sin nombre'}
          </span>
          <input
            value={name.value}
            onChange={(event) => name.change(event.target.value)}
            onBlur={settle}
            aria-label="Nombre del proyecto"
            aria-invalid={name.status === 'error'}
            maxLength={PROJECT_NAME_MAX}
            /**
             * ⚠️ `size={1}` no es cosmético: sin él el campo sale mucho más
             * ancho que su texto. Al medir la columna de la rejilla cuenta
             * también el ancho intrínseco del `<input>`, que por defecto son 20
             * caracteres —y en `text-4xl` eso es media pantalla—, así que el
             * `<span>` invisible dejaba de mandar. Con `size={1}` el intrínseco
             * es despreciable y gana el texto de verdad.
             */
            size={1}
            /* La validación y el mensaje son nuestros: `minLength` nativo
               cortaría el evento antes de llegar aquí (§17.6). */
            className="col-start-1 row-start-1 w-full rounded-lg border border-transparent bg-transparent px-2 font-display text-3xl text-text-primary outline-none transition-colors hover:border-border hover:bg-surface focus:border-border-strong focus:bg-surface sm:text-4xl"
          />
        </span>

        {badgeSlot}
        <Status field={name} />
      </div>

      {/* Misma rejilla, ahora para la altura: el `<span>` crece con el texto y
          el `<textarea>` lo sigue, así que no hay barra de scroll ni salto. El
          espacio final conserva la línea en blanco mientras se escribe. */}
      <span className="grid max-w-2xl">
        <span
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 whitespace-pre-wrap border border-transparent px-2 py-1 font-serif text-lg italic"
        >
          {`${description.value || 'Sin descripción'} `}
        </span>
        <textarea
          value={description.value}
          onChange={(event) => description.change(event.target.value)}
          onBlur={settle}
          aria-label="Descripción del proyecto"
          aria-invalid={description.status === 'error'}
          maxLength={PROJECT_DESCRIPTION_MAX}
          placeholder="Sin descripción"
          rows={1}
          className="col-start-1 row-start-1 w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 font-serif text-lg italic text-text-secondary outline-none transition-colors placeholder:text-text-disabled hover:border-border hover:bg-surface focus:border-border-strong focus:bg-surface"
        />
      </span>

      {description.status !== 'idle' && (
        <div className="px-2">
          <Status field={description} />
        </div>
      )}
    </div>
  );
}

/** El estado del guardado, dicho en una línea y sin ocupar sitio en reposo. */
function Status({ field }: { field: Autosave }) {
  if (field.status === 'error') {
    return (
      <p role="alert" className="font-sans text-sm text-error">
        {field.error}
      </p>
    );
  }
  if (field.status === 'saving') {
    return <span className="font-sans text-sm text-text-disabled">Guardando…</span>;
  }
  if (field.status === 'saved') {
    return (
      /* `<output>` es el elemento con semántica de `role="status"`. */
      <output className="font-sans text-sm" style={{ color: alpha(colors.success, 90) }}>
        Guardado
      </output>
    );
  }
  return null;
}

interface Autosave {
  value: string;
  status: FieldStatus;
  error: string | null;
  change: (value: string) => void;
  /**
   * Guarda ya lo pendiente, sin esperar el debounce.
   *
   * No dice si guardó: quien llama necesita saber si hay algo que revalidar, y
   * eso incluye lo que el debounce guardó hace un segundo. Lo lleva `onSaved`.
   */
  flush: () => Promise<void>;
}

/**
 * Un campo que se guarda solo tras un rato de silencio.
 *
 * Dos detalles que no se ven y sin los que esto no funciona:
 *
 * - **Se compara con lo último confirmado**, no con el valor inicial: escribir y
 *   deshacer no debe mandar nada, y salir del campo dos veces tampoco.
 * - **Cada guardado lleva número de orden** y solo el último manda. Con el
 *   debounce es raro, pero si dos peticiones se solapan la lenta podría llegar
 *   después y dejar en pantalla el resultado de un texto que ya no existe.
 */
function useAutosave({
  initial,
  validate,
  save,
  onSaved,
}: {
  initial: string;
  validate: (value: string) => string | null;
  save: (value: string) => Promise<{ error: string | null }>;
  onSaved?: (value: string) => void;
}): Autosave {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<FieldStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const savedRef = useRef(initial);
  const valueRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // Al desmontar no queda ningún temporizador escribiendo sobre nada.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const commit = useCallback(async (): Promise<void> => {
    const next = valueRef.current.trim();
    if (next === savedRef.current.trim()) return;

    const invalid = validate(next);
    if (invalid) {
      setStatus('error');
      setError(invalid);
      return;
    }

    const seq = ++seqRef.current;
    setStatus('saving');
    setError(null);

    const result = await save(next);
    if (seq !== seqRef.current) return; // llegó una respuesta más nueva

    if (result.error) {
      setStatus('error');
      setError(result.error);
      return;
    }

    savedRef.current = next;
    setStatus('saved');
    onSaved?.(next);
  }, [save, validate, onSaved]);

  const change = useCallback(
    (next: string) => {
      setValue(next);
      valueRef.current = next;
      setStatus('idle');
      setError(null);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void commit();
      }, DEBOUNCE_MS);
    },
    [commit],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return commit();
  }, [commit]);

  return { value, status, error, change, flush };
}
