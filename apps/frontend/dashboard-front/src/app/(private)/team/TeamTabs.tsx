'use client';

import { useState } from 'react';

export function TeamTabs({
  members,
  roles,
}: {
  members: React.ReactNode;
  roles: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');

  const tabs = [
    { id: 'members', label: 'Miembros', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V16a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-4a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    ) },
    { id: 'roles', label: 'Roles y permisos', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    ) }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b border-white/10 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all font-sans text-sm font-medium ${
              activeTab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-2 animate-in fade-in duration-300">
        {activeTab === 'members' && members}
        {activeTab === 'roles' && roles}
      </div>
    </div>
  );
}
