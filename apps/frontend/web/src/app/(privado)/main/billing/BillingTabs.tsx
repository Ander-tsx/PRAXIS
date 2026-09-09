'use client';

import { useState } from 'react';

type TabId = 'planes' | 'historial';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

function Icono({ d }: { d: string }) {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

/**
 * Las pestañas de Facturación, con el mismo dibujo que las de Equipo
 * (`TeamTabs`): una fila con subrayado, la activa en blanco.
 *
 * ## Ya no hay una pestaña «Tu plan» aparte
 *
 * Eran dos: «Tu plan» —el plan contratado y los asientos— y «Todos los planes»
 * —la tabla comparativa—. La separación obligaba a saltar de una a otra para
 * responder la única pregunta que se trae aquí: **qué tengo y qué me daría
 * cambiar**. Peor: los asientos, que son lo que de verdad se administra, vivían
 * en la pestaña que no se abre.
 *
 * Ahora es una sola, **«Planes»**, con lo tuyo arriba y la tabla debajo. Lo
 * ordena la página (`planesSlot`), no este componente: aquí solo quedan las
 * pestañas.
 */
export function BillingTabs({
  planes,
  historial,
}: {
  planes: React.ReactNode;
  /** El registro de facturación. `null` si no hay permiso o no hay plan. */
  historial: React.ReactNode | null;
}) {
  const tabs: Tab[] = [];
  tabs.push({
    id: 'planes',
    label: 'Planes',
    icon: <Icono d="M4 6h16M4 12h16M4 18h16" />,
  });
  if (historial) {
    tabs.push({
      id: 'historial',
      label: 'Registro',
      icon: <Icono d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
    });
  }

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0].id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b border-white/10 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-sans text-sm font-medium transition-all ${
              activeTab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:border-white/30 hover:text-white/80'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in pt-2 duration-300">
        {activeTab === 'planes' && planes}
        {activeTab === 'historial' && historial}
      </div>
    </div>
  );
}
