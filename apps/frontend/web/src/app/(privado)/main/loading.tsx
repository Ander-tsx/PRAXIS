import { PageSkeleton, Skeleton } from '@praxis/commons';

/**
 * El repliegue de `/main/*`, para lo que no trae esqueleto propio.
 *
 * ⚠️ **A propósito es el más neutro de todos, y no es pereza.** Cubre a
 * cualquier pantalla futura bajo `/main` que nadie se haya acordado de dotar
 * del suyo, y ahí acertar la forma es imposible: un esqueleto que promete una
 * rejilla de tarjetas delante de un formulario es peor que uno que solo dice
 * «viene una cabecera y viene contenido».
 *
 * Las que sí tienen forma conocida traen la suya y pisan a este: `billing`,
 * `team`, `profile` y `organizations/new`. Cuando se añada una pantalla nueva
 * bajo `/main`, lo correcto es darle su `loading.tsx` — no ensanchar este.
 *
 * ⚠️ `/main` en sí **no tiene página**: la redirección a `/projects` la resuelve
 * el guard (`REDIRECCIONES_EXACTAS` en `proxy.ts`), así que este archivo nunca
 * se pinta para la ruta desnuda.
 */
export default function MainLoading() {
  return (
    <PageSkeleton title="Cuenta">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </header>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </PageSkeleton>
  );
}
