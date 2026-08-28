const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/organizations/[organizationId]/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldReturn = `    <AppHeader title={organizacion.name ?? 'Organización sin nombre'} anchoCompleto={true}>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <Bloque
          accion={
            <EnlaceDeTexto href="/projects/new" cruzaDeZona>
              Crear un proyecto
            </EnlaceDeTexto>
          }
          titulo="Proyectos"
          entradilla="Todo el trabajo de la organización vive aquí. Quien tiene asiento puede ver todos los proyectos abiertos y entrar en ellos."
        >
          {proyectos ? (
            <DashboardProjects proyectos={proyectos} limite={6} />
          ) : (
            <Vacio>No se pudo cargar la lista de proyectos.</Vacio>
          )}
        </Bloque>

        {/* ─── El equipo ──────────────────────────────────────────────── */}
        <Bloque
          accion={
            permisos.canManageMembers ? (
              <EnlaceDeTexto href={\`/organizations/\${organizationId}/roles\`}>
                Papeles y plantillas
              </EnlaceDeTexto>
            ) : null
          }
          titulo="Equipo"
          entradilla={\`\${organizacion.seatsUsed} de \${organizacion.seats} asientos ocupados. Una invitación ocupa el suyo desde que se manda.\`}
        >
          {miembros ? (
            <MembersPanel
              organizationId={organizationId}
              miembros={miembros}
              permisos={permisos}
              papeles={papeles}
              asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
            />
          ) : (
            <Vacio>No se pudo leer la lista de miembros. Vuelve a cargar la página.</Vacio>
          )}
        </Bloque>

        {/* ─── El plan, que es una línea y no una portada ─────────────── */}
        {permisos.canManageBilling && (
          <Bloque
            titulo="Plan y asientos"
            entradilla={
              organizacion.tier === 'FREE'
                ? 'Estás en el plan gratuito. Se amplía cuando el equipo o los proyectos no quepan.'
                : \`Plan \${spec?.nombre}. Los asientos se cambian aquí y se cobran prorrateados.\`
            }
          >
            <div className="flex flex-col gap-6">
              <SeatsPanel
                organizationId={organizationId}
                contratados={organizacion.seats}
                ocupados={organizacion.seatsUsed}
              />

              {organizacion.tier === 'FREE' && contratables.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  {contratables.map((plan) => (
                    <CheckoutButton
                      key={plan.tier}
                      destino="checkout"
                      tier={plan.tier}
                      organizationId={organizationId}
                      seats={Math.max(organizacion.seats, plan.asientosMinimos)}
                    >
                      {\`Pasar a \${plan.nombre}\`}
                    </CheckoutButton>
                  ))}
                  {/* Sin \`/dashboard\` delante: es una ruta **de esta zona** y
                      \`next/link\` ya le pone el basePath. Con él salía
                      \`/dashboard/dashboard/billing\`. */}
                  <EnlaceDeTexto href="/billing">Comparar los planes</EnlaceDeTexto>
                </div>
              )}
            </div>
          </Bloque>
        )}

        {/* ─── El registro ────────────────────────────────────────────── */}
        {permisos.canViewAuditLog && (
          <Bloque
            titulo="Registro"
            entradilla="Todo lo que ha movido el plan o los asientos, con su instante."
          >
            {historial && historial.length > 0 ? (
              <ol className="flex flex-col">
                {historial.map((evento) => (
                  <li
                    key={evento.id}
                    className="flex items-baseline justify-between gap-4 border-b border-white/5 py-4 last:border-b-0 hover:bg-white/[0.02] transition-colors -mx-4 px-4 rounded-xl"
                  >
                    <span className="font-sans text-sm text-text-primary">
                      {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-text-disabled">
                      {fechaCorta(evento.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              /* 🔴 No es decoración: el mes gratis se cobra al segundo, y «no me
                 avisaron» es la queja más cara de este terreno. Que esté vacío
                 se dice, en vez de no pintar nada y parecer que falla. */
              <Vacio>Todavía no ha pasado nada que registrar.</Vacio>
            )}
          </Bloque>
        )}
      </div>
    </AppHeader>`;

const newReturn = `    <AppHeader title={organizacion.name ?? 'Organización sin nombre'} anchoCompleto={true}>
      <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
        
        {/* Header Hero */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-12 gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center text-3xl font-black text-white shrink-0">
              {organizacion.name?.charAt(0).toUpperCase() ?? 'O'}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl sm:text-4xl font-black text-white">{organizacion.name ?? 'Organización sin nombre'}</h1>
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] uppercase tracking-widest font-bold text-white">
                  {organizacion.tier === 'FREE' ? 'Gratis' : organizacion.tier}
                </span>
              </div>
              <p className="text-sm text-white/50">
                {organizacion.soyDueno ? 'Eres el propietario' : (organizacion.myRoleName ?? 'Miembro del equipo')}
              </p>
            </div>
          </div>
          
          <EnlaceDeTexto href="/projects/new" cruzaDeZona>
            + Crear un proyecto
          </EnlaceDeTexto>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <Bloque
              titulo="Proyectos"
              entradilla="Todo el trabajo colaborativo vive aquí."
            >
              {proyectos ? (
                <div className="bg-[#080807] border border-white/10 rounded-2xl p-6">
                  <DashboardProjects proyectos={proyectos} limite={6} />
                </div>
              ) : (
                <Vacio>No se pudo cargar la lista de proyectos.</Vacio>
              )}
            </Bloque>

            <Bloque
              accion={
                permisos.canManageMembers ? (
                  <EnlaceDeTexto href={\`/organizations/\${organizationId}/roles\`}>
                    Papeles y plantillas
                  </EnlaceDeTexto>
                ) : null
              }
              titulo="Equipo"
              entradilla={\`\${organizacion.seatsUsed} de \${organizacion.seats} asientos ocupados.\`}
            >
              {miembros ? (
                <div className="bg-[#080807] border border-white/10 rounded-2xl p-6">
                  <MembersPanel
                    organizationId={organizationId}
                    miembros={miembros}
                    permisos={permisos}
                    papeles={papeles}
                    asientos={{ contratados: organizacion.seats, ocupados: organizacion.seatsUsed }}
                  />
                </div>
              ) : (
                <Vacio>No se pudo leer la lista de miembros.</Vacio>
              )}
            </Bloque>
          </div>

          {/* Sidebar Column */}
          <div className="flex flex-col gap-8">
            {permisos.canManageBilling && (
              <Bloque
                titulo="Suscripción"
                entradilla={
                  organizacion.tier === 'FREE'
                    ? 'Estás en el plan gratuito.'
                    : \`Plan \${spec?.nombre}.\`
                }
              >
                <div className="bg-[#080807] border border-white/10 rounded-2xl p-6 flex flex-col gap-6">
                  <SeatsPanel
                    organizationId={organizationId}
                    contratados={organizacion.seats}
                    ocupados={organizacion.seatsUsed}
                  />

                  {organizacion.tier === 'FREE' && contratables.length > 0 && (
                    <div className="flex flex-col gap-3 pt-6 border-t border-white/10">
                      {contratables.map((plan) => (
                        <CheckoutButton
                          key={plan.tier}
                          destino="checkout"
                          tier={plan.tier}
                          organizationId={organizationId}
                          seats={Math.max(organizacion.seats, plan.asientosMinimos)}
                        >
                          {\`Pasar a \${plan.nombre}\`}
                        </CheckoutButton>
                      ))}
                      <EnlaceDeTexto href="/billing">Comparar planes</EnlaceDeTexto>
                    </div>
                  )}
                </div>
              </Bloque>
            )}

            {permisos.canViewAuditLog && (
              <Bloque
                titulo="Registro"
                entradilla="Historial de movimientos de la cuenta."
              >
                <div className="bg-[#080807] border border-white/10 rounded-2xl p-6 max-h-[400px] overflow-y-auto">
                  {historial && historial.length > 0 ? (
                    <ol className="flex flex-col">
                      {historial.map((evento) => (
                        <li
                          key={evento.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 py-3 last:border-b-0"
                        >
                          <span className="font-sans text-xs text-white/90">
                            {TEXTO_DE_EVENTO[evento.type] ?? evento.type}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-white/40">
                            {fechaCorta(evento.occurredAt)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Vacio>No hay eventos recientes.</Vacio>
                  )}
                </div>
              </Bloque>
            )}
          </div>
        </div>
      </div>
    </AppHeader>`;

code = code.replace(oldReturn, newReturn);

// Ensure Bloque doesn't have borders anymore because we wrap the content in borders
const oldBloque = `function Bloque({
  titulo,
  entradilla,
  accion,
  children,
}: {
  titulo: string;
  entradilla?: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-white/10 py-10 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-2xl text-text-primary">{titulo}</h2>
          {entradilla && (
            <p className="max-w-xl font-serif text-sm italic text-text-secondary">{entradilla}</p>
          )}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}`;

const newBloque = `function Bloque({
  titulo,
  entradilla,
  accion,
  children,
}: {
  titulo: string;
  entradilla?: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-bold text-white">{titulo}</h2>
          {entradilla && (
            <p className="max-w-xl font-sans text-xs text-white/50">{entradilla}</p>
          )}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}`;

code = code.replace(oldBloque, newBloque);

fs.writeFileSync(path, code);
