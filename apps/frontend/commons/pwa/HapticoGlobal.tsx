'use client';

import { useEffect } from 'react';
import { instalarHapticoGlobal } from './haptico';

/** Monta el háptico global (ver `haptico.ts`). No pinta nada. */
export function HapticoGlobal() {
  useEffect(() => instalarHapticoGlobal(), []);
  return null;
}
