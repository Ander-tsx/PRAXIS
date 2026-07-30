/**
 * Esqueleto del panel.
 *
 * Reproduce el armazón de `AppLayout` (barra lateral + cabecera + rejilla) en
 * lugar de un spinner centrado: así la transición no da un salto y la pantalla
 * ya comunica lo que va a aparecer.
 *
 * No usa `AppLayout` porque ese componente exige datos del usuario que todavía
 * estamos esperando.
 */

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-elevated ${className}`} />;
}

export default function ProjectsLoading() {
  return (
    <div className="flex h-screen overflow-hidden bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando tus proyectos</span>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <span className="select-none font-serif text-xl font-black tracking-tight text-primary">
            PRAXIS
          </span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 pt-6">
          <Block className="h-11" />
          <Block className="h-11 opacity-60" />
          <Block className="h-11 opacity-40" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6">
          <Block className="h-6 w-32" />
        </header>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <Block className="h-10 w-72 max-w-full" />
            <Block className="h-5 w-56 max-w-full opacity-60" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Block className="h-32" />
            <Block className="h-32" />
            <Block className="h-32" />
          </div>

          <div className="flex flex-col gap-4">
            <Block className="h-8 w-48" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Block className="h-36" />
              <Block className="h-36 opacity-70" />
              <Block className="h-36 opacity-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
