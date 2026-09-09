import { PageSkeleton, Skeleton, SkeletonCircle } from '@praxis/commons';

/**
 * Esqueleto de la invitación a una organización.
 *
 * Reproduce el `NoticePanel`: el disco con el sobre, el título, la pista y el
 * bloque de tres puntos con lo que pasa al aceptar.
 *
 * ⚠️ **Vale para las dos ramas de la pantalla** —la que trae token y la que no—
 * porque las dos son un panel del mismo tamaño. Es lo que se quiere: aquí no se
 * sabe todavía si el enlace está completo, y elegir una forma que solo acierta
 * en un caso dejaría la mitad de las visitas con un salto.
 */
export default function InvitacionLoading() {
  return (
    <PageSkeleton title="Invitación">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-3">
            <SkeletonCircle className="h-10 w-10 shrink-0" fuerte />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </div>

          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-44 rounded-lg" fuerte />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
