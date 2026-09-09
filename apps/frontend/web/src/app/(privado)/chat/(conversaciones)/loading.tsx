import { Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto del listado de conversaciones.
 *
 * ⚠️ **Sin `PageSkeleton`, y es la excepción.** El armazón de esta sección lo
 * pone su `layout.tsx` —un `AppHeader` con `lleno`— y el layout **no se
 * reemplaza** por el `loading.tsx` de un segmento hijo: se conserva y lo que se
 * sustituye es lo de dentro. Envolver aquí en `PageSkeleton` pintaría un
 * `<main>` dentro de otro `<main>`, que además de HTML dudoso deja dos
 * contenedores de desplazamiento anidados.
 *
 * La forma sale de la propia pantalla: el título «Tus mensajes», y debajo la
 * lista agrupada por epígrafe con avatar, nombre y último mensaje.
 */

function Conversacion() {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3">
      <SkeletonCircle className="h-10 w-10 shrink-0" fuerte />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>
      <Skeleton className="h-3 w-10 shrink-0" />
    </div>
  );
}

export default function ChatLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Dos grupos, porque la pantalla agrupa: la lista real lleva epígrafes. */}
      {[3, 2].map((cuantas, grupo) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
        <div key={grupo} className="flex flex-col gap-1">
          <Skeleton className="mb-1 ml-1 h-3 w-24" />
          {Array.from({ length: cuantas }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cajas decorativas
            <Conversacion key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
