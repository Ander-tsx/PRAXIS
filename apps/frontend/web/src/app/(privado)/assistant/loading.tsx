import { PageSkeleton, Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto de PRAX: su ficha, el selector de proyecto y la conversación.
 *
 * Las burbujas alternan lado igual que en el chat, y por lo mismo: es la
 * silueta lo que hace reconocible una conversación antes de que haya texto.
 */
export default function AssistantLoading() {
  return (
    <PageSkeleton title="Asistente" lleno>
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6">
        <div className="flex shrink-0 items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" fuerte />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>

        {/* El selector de proyecto: se puede hablar con PRAX sin ninguno. */}
        <Skeleton className="h-11 w-full shrink-0 max-w-xs rounded-lg" />

        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3">
          <div className="flex items-end gap-2">
            <SkeletonCircle className="h-8 w-8 shrink-0" fuerte />
            <Skeleton className="h-16 w-3/5 rounded-2xl" />
          </div>
          <div className="flex flex-row-reverse items-end gap-2">
            <Skeleton className="h-11 w-2/5 rounded-2xl" fuerte />
          </div>
          <div className="flex items-end gap-2">
            <SkeletonCircle className="h-8 w-8 shrink-0" fuerte />
            <Skeleton className="h-24 w-4/5 rounded-2xl" />
          </div>
        </div>

        <Skeleton className="h-14 w-full shrink-0 rounded-xl" />
      </div>
    </PageSkeleton>
  );
}
