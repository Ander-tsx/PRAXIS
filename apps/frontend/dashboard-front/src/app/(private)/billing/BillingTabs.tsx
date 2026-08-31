'use client';

import { useState } from 'react';

type TabId = 'plan' | 'planes' | 'historial';

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
 * ⚠️ **La pestaña «Tu plan» solo aparece cuando hay plan de pago.** En una
 * organización gratuita no hay nada que gestionar ahí —ni asientos contratados,
 * ni portal de Stripe, ni registro— así que se entra directamente a comparar.
 */
export function BillingTabs({
  tuPlan,
  planes,
  historial,
}: {
  /** El bloque «Tu plan». `null` en organizaciones gratuitas. */
  tuPlan: React.ReactNode | null;
  planes: React.ReactNode;
  /** El registro de facturación. `null` si no hay permiso o no hay plan. */
  historial: React.ReactNode | null;
}) {
  const tabs: Tab[] = [];
  if (tuPlan) {
    tabs.push({
      id: 'plan',
      label: 'Tu plan',
      icon: (
        <Icono d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      ),
    });
  }
  tabs.push({
    id: 'planes',
    label: 'Todos los planes',
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
        {activeTab === 'plan' && tuPlan}
        {activeTab === 'planes' && planes}
        {activeTab === 'historial' && historial}
      </div>
    </div>
  );
}
