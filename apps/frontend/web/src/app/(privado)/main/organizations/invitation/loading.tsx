import { PageSkeleton, Skeleton } from '@praxis/commons';

/**
 * Esqueleto de la invitación a una organización.
 *
 * Reproduce `AcceptInvitation`: el título, la pista en serif, las tres filas
 * numeradas con raya punteada y el formulario colgando de un `border-t`. Ya no
 * es un panel con disco e icono —eso se fue con el `NoticePanel`— así que el
 * esqueleto tampoco lo finge.
 *
 * ⚠️ **Vale para las dos ramas de la pantalla** —la que trae token y la que
 * no— porque las dos son texto del mismo ancho. Es lo que se quiere: aquí no
 * se sabe todavía si el enlace está completo, y elegir una forma que solo
 * acierta en un caso dejaría la mitad de las visitas con un salto.
 */
export default function InvitacionLoading() {
  return (
    <PageSkeleton title="Invitación">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-baseline gap-5 border-b border-dotted border-border py-5 last:border-b-0"
            >
              <Skeleton className="h-3 w-6 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-8">
          <Skeleton className="h-11 w-44 rounded-lg" fuerte />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
    </PageSkeleton>
  );
}
