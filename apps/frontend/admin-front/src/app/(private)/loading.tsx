/**
 * Esqueleto del contenido, **sin la barra lateral**: vive en el layout y Next la
 * conserva entre navegaciones (ESTADO-ACTUAL §23).
 */

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-elevated ${className}`} />;
}

export default function AdminLoading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-[#080807] px-4 sm:px-6">
        <Block className="h-6 w-40" />
      </header>

      <main className="relative flex-1 overflow-y-auto bg-background" aria-busy="true">
        <span className="sr-only">Cargando</span>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6">
          <Block className="h-8 w-56" />
          <Block className="h-16" />
          <Block className="h-72" />
        </div>
      </main>
    </>
  );
}
