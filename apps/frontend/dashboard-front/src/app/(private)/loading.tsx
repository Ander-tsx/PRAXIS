/**
 * Esqueleto del contenido, **sin la barra lateral**.
 *
 * Antes reproducía el armazón entero, porque el armazón vivía dentro de cada
 * page: al navegar se desmontaba y había que dibujarlo de nuevo. Ahora vive en
 * el layout y Next lo conserva, así que este fallback solo cubre lo que de
 * verdad está cargando. Dibujar aquí unos enlaces y un nombre de mentira, sobre
 * los de verdad que ya están en pantalla, era puro parpadeo.
 */

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#202020] ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-white/10 bg-[#191919] px-4 sm:px-6">
        <Block className="h-6 w-32" />
      </header>

      <main className="relative flex-1 overflow-y-auto bg-[#0c0c0b]" aria-busy="true">
        <span className="sr-only">Cargando</span>

        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <Block className="h-9 w-72" />
            <Block className="h-5 w-52 opacity-60" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Block className="h-32" />
            <Block className="h-32 opacity-80" />
            <Block className="h-32 opacity-60" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Block className="h-40" />
            <Block className="h-40 opacity-80" />
            <Block className="h-40 opacity-60" />
          </div>
        </div>
      </main>
    </>
  );
}
