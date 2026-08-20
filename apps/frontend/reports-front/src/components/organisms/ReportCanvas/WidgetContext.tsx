'use client';
import { createContext } from 'react';

export const WidgetContext = createContext<{
  flipped: boolean;
  setFlipped: (flipped: boolean) => void;
  hasHelp: boolean;
  setHasHelp: (has: boolean) => void;
}>({
  flipped: false,
  setFlipped: () => {},
  hasHelp: false,
  setHasHelp: () => {},
});
