'use client';

import { useState } from 'react';
import type { OrgDelSelector } from './AppShell';

export function OrgSwitcherDropdown({
  name,
  plegada,
  organizaciones,
  activaId,
  zonePath,
}: {
  name: string;
  plegada: boolean;
  organizaciones?: OrgDelSelector[];
  activaId: string | null;
  zonePath: string;
}) {
  return null; // Will implement properly
}
