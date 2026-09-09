import { Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto de una conversación: cabecera, burbujas y compositor.
 *
 * En un archivo propio porque lo usan **los dos** `loading.tsx` de conversación
 * —el privado (`[peerId]`) y el de proyecto (`proyecto/[projectId]`)— y son la
 * misma pantalla con otro interlocutor. Copiado en los dos, el día que una
 * cambie la otra se queda atrás sin que nada lo diga.
 *
 * Sin `PageSkeleton` por lo mismo que el listado: el `AppHeader lleno` de esta
 * sección lo pone su `layout.tsx` y se conserva. Ver la nota de
 * `chat/(conversaciones)/loading.tsx`.
 *
 * ⚠️ **Las burbujas alternan lado y ancho.** Un hilo real no es una columna de
 * rectángulos iguales: alterna quién habla y cuánto dice, y esa silueta es lo
 * único que hace reconocible un chat antes de que haya una sola palabra. Con
 * bloques idénticos el esqueleto se lee como una lista.
 *
 * ⚠️ Y **el compositor va abajo y quieto**, no en el flujo: es lo que evita que
 * al llegar los mensajes el campo de escribir dé un salto desde el medio de la
 * pantalla hasta el pie.
 */

/** `[mío, ancho]`. Escrito a mano y no aleatorio: un esqueleto tiene que salir
 *  igual en el servidor y en el cliente, o React avisa de hidratación. */
const BURBUJAS: [boolean, string][] = [
  [false, 'w-56'],
  [false, 'w-72'],
  [true, 'w-44'],
  [false, 'w-64'],
  [true, 'w-60'],
  [true, 'w-36'],
];

export function ConversacionSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 pb-4">
        <SkeletonCircle className="h-10 w-10 shrink-0" fuerte />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 py-6">
        {BURBUJAS.map(([mio, ancho], i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
            key={i}
            className={`flex items-end gap-2 ${mio ? 'flex-row-reverse' : ''}`}
          >
            {!mio && <SkeletonCircle className="h-7 w-7 shrink-0" />}
            <Skeleton className={`h-11 ${ancho} rounded-2xl`} fuerte={mio} />
          </div>
        ))}
      </div>

      <div className="shrink-0 pt-2">
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
