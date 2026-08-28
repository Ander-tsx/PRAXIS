import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { MAX_ORGANIZACIONES_PROPIAS, type OrganizationView } from '@praxis/commons/billing/planes';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Organizaciones',
};

/**
 * La lista de organizaciones — **ya no es un sitio al que se va a elegir**.
 *
 * 🔴 Hasta 2026-08-28 aquí se aterrizaba desde «Roles y permisos» con
 * `?elegir=roles`, para escoger en cuál trabajar. Esa pregunta la contesta ahora
 * el selector de la barra lateral y no se vuelve a hacer, así que el aviso que
 * la explicaba se ha ido con ella.
 *
 * Lo que queda es lo que siempre debió ser: la pantalla donde se administran las
 * organizaciones —crear, renombrar, ver quién paga qué—, no el desvío por el que
 * había que pasar para llegar a otra cosa.
 */
export default async function OrganizationsPage() {
  const organizaciones = await createServerApiClient()
    .get<OrganizationView[]>('/me/organizations')
    .catch(() => null);

  const lista = organizaciones ?? [];
  const soloLaPersonal = lista.length > 0 && lista.every((o) => o.kind === 'PERSONAL');
  /* ⚠️ El tope es de tres **a tu nombre**, la personal incluida, y no depende
     del plan: si el plan valiera solo dentro de su organización pero además
     dejara crear más, se estaría escapando de ella. Ver
     `MAX_ORGANIZACIONES_PROPIAS`. Se cuentan las que has creado tú: estar
     invitado en las de otros no ocupa ninguna. */
  const propias = lista.filter((organizacion) => organizacion.soyDueno).length;
  const caben = propias < MAX_ORGANIZACIONES_PROPIAS;

  return (
    <AppHeader title="Organizaciones" anchoCompleto={true}>
      <div className="w-full max-w-[1200px] mx-auto flex flex-col px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 mt-10 mb-12">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">
              Tus Organizaciones
            </h1>
            <p className="text-lg text-white/50 max-w-2xl font-sans">
              Una organización es donde vive el trabajo de un equipo. Los proyectos pertenecen a
              ella, no de forma individual a quien los creó.
            </p>
          </div>
          {caben ? (
            <Link
              href="/organizations/new"
              className="shrink-0 inline-flex items-center justify-center border border-white/20 bg-transparent text-white font-bold py-2.5 px-5 rounded-full hover:bg-white/5 transition-colors"
            >
              Crear nueva
            </Link>
          ) : (
            /* ⚠️ **Se dice antes de pulsar, no con un 402 después.** El servidor
               lo niega igual (`exigirOrganizacion`), pero llegar al formulario,
               escribir un nombre y que lo rechace al enviar es la peor forma de
               enterarse de un tope. */
            <p className="shrink-0 font-sans text-sm text-white/40">
              Has creado {propias} de {MAX_ORGANIZACIONES_PROPIAS}, que es el máximo.
            </p>
          )}
        </div>

        {organizaciones === null && (
          <div className="mb-8 border border-red-500/30 bg-red-500/10 rounded-2xl p-5">
            <p className="font-sans text-sm text-red-400">
              No se pudieron cargar tus organizaciones. Vuelve a intentarlo en un momento.
            </p>
          </div>
        )}

        {lista.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {lista.map((organizacion) => {
              const isPersonal = organizacion.kind === 'PERSONAL';

              return (
                <Link
                  key={organizacion.id}
                  href={`/organizations/${organizacion.id}`}
                  className="group relative flex flex-col justify-between rounded-2xl p-6 sm:p-8 bg-[#080807] border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-10 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-lg font-black text-white">
                        {isPersonal ? 'M' : (organizacion.name?.charAt(0).toUpperCase() ?? 'O')}
                      </div>
                      <div>
                        <h2 className="font-sans text-2xl font-bold text-white group-hover:text-primary transition-colors">
                          {organizacion.name ?? 'Sin nombre'}
                        </h2>
                        <p className="text-sm text-white/50">
                          {isPersonal
                            ? 'Espacio personal'
                            : `${organizacion.seatsUsed} de ${organizacion.seats} asientos ocupados`}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 bg-white/5 text-white/60 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full">
                      {organizacion.tier === 'FREE' ? 'Gratis' : organizacion.tier}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 relative z-10">
                    <div className="px-3 py-1.5 rounded-lg bg-black/50 border border-white/5 text-xs text-white/70 flex items-center gap-2">
                      <svg
                        className="w-3.5 h-3.5 text-white/40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      {organizacion.soyDueno
                        ? 'Eres el propietario'
                        : (organizacion.myRoleName ?? 'Miembro')}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {soloLaPersonal && <QueDaUnaOrganizacion />}
      </div>
    </AppHeader>
  );
}

function QueDaUnaOrganizacion() {
  return (
    <section className="mt-20 pt-16 border-t border-white/5">
      <h2 className="text-3xl font-black text-white mb-10 text-center">
        ¿Por qué crear un equipo?
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Razon
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          }
          titulo="El trabajo no se va con quien se va"
          texto="Si alguien deja el equipo, los proyectos y la historia siguen siendo propiedad de la organización de forma segura."
        />
        <Razon
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
          }
          titulo="Acceso centralizado e instantáneo"
          texto="No hace falta invitar proyecto por proyecto. Quien tiene asiento puede colaborar en todo lo que la organización ofrezca."
        />
        <Razon
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          }
          titulo="Control total de permisos y seguridad"
          texto="Define roles una sola vez. Tú decides quién crea proyectos, quién invita usuarios y quién accede a la facturación."
        />
      </div>
    </section>
  );
}

function Razon({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center text-center p-8 rounded-3xl bg-[#080807] border border-white/10 relative overflow-hidden group hover:border-white/20 transition-colors">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white mb-6 group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{titulo}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{texto}</p>
    </div>
  );
}
