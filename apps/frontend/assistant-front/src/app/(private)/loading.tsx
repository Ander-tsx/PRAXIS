/**
 * Esqueleto del contenido, **sin la barra lateral**: vive en el layout y Next la
 * conserva entre navegaciones (ESTADO-ACTUAL §23).
 *
 * La forma imita la de la pantalla: la ficha de PRAX arriba, el selector de
 * proyecto y el cuerpo de la conversación. Un esqueleto que no se parece a lo
 * que va a salir hace que la página «salte» al cargar, que es peor que no tener
 * esqueleto.
 */

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-elevated ${className}`} />;
}

export default function AssistantLoading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6">
        <Block className="h-6 w-32" />
      </header>

      <main className="relative flex-1 overflow-y-auto bg-background" aria-busy="true">
        <span className="sr-only">Cargando</span>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Block className="h-20 w-20 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Block className="h-8 w-48" />
              <Block className="h-4 w-72 opacity-70" />
            </div>
          </div>

          <Block className="h-12" />
          <Block className="h-72" />
        </div>
      </main>
    </>
  );
}
