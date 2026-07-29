'use client';

import { Input } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

export interface ProjectSearchProps {
  initialValue: string;
}

/**
 * Búsqueda de proyectos.
 *
 * Escribe en la URL (`?q=`) en vez de guardar estado local: el filtrado lo hace
 * el backend, la lista está paginada y así la búsqueda se puede compartir y
 * sobrevive a un refresco.
 *
 * `router.push` sin el basePath: Next añade `/projects` solo. Ver ESTADO-ACTUAL §16.
 */
export function ProjectSearch({ initialValue }: ProjectSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const inputId = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/?q=${encodeURIComponent(query)}` : '/');
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm items-end gap-2">
      <Input
        id={inputId}
        name="q"
        type="search"
        placeholder="Buscar por nombre o descripción"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Buscar proyectos"
        fullWidth
      />
    </form>
  );
}
