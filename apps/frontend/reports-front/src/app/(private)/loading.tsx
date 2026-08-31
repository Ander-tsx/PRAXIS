/**
 * Esqueleto del contenido, **sin la barra lateral**: vive en el layout y Next la
 * conserva entre navegaciones. Ver la nota del mismo archivo en el panel.
 */

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#202020] ${className}`} />;
}

export default function ReportsLoading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-white/10 bg-[#191919] px-4 sm:px-6">
        <Block className="h-6 w-40" />
      </header>

      <main className="relative flex-1 overflow-y-auto bg-[#0c0c0b]" aria-busy="true">
        <span className="sr-only">Cargando</span>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6">
          <Block className="h-10 w-64" />
          <Block className="h-12" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Block className="h-44" />
            <Block className="h-44 opacity-80" />
            <Block className="h-44 opacity-60" />
          </div>
        </div>
      </main>
    </>
  );
}
