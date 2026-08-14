'use client';

import { ACCIONES } from '@/lib/admin';
import { ADMIN_ACTIONS, type AdminActionName, Button, Input, Select } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface ActivityToolbarProps {
  accion?: AdminActionName;
  desde?: string;
  hasta?: string;
}

/**
 * Los filtros del registro: qué y cuándo.
 *
 * ## Quién y sobre quién no tienen caja aquí
 *
 * Los acepta la URL (`?actor=`, `?objetivo=`) y el backend, pero pedirlos en el
 * formulario significaría pedir un **UUID a mano**, que nadie tiene memorizado.
 * La forma natural de llegar a «todo lo que se ha hecho sobre esta cuenta» es
 * desde la propia cuenta, no escribiendo su id aquí — y ese enlace se pondrá en
 * la tabla de cuentas cuando exista la ficha de usuario.
 *
 * Mientras tanto los parámetros funcionan si se pegan en la barra, que es lo que
 * hace falta para diagnosticar.
 *
 * ## Es un `<form>` de verdad
 *
 * Un botón de «Filtrar» y no un `onChange` por campo: con dos fechas, aplicar en
 * cada tecla dispararía media docena de consultas mientras se escribe el año.
 */
export function ActivityToolbar({ accion, desde, hasta }: ActivityToolbarProps) {
  const router = useRouter();
  const [valores, setValores] = useState({
    accion: accion ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
  });

  function aplicar(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (valores.accion) params.set('accion', valores.accion);
    if (valores.desde) params.set('desde', valores.desde);
    if (valores.hasta) params.set('hasta', valores.hasta);
    const qs = params.toString();
    router.push(qs ? `/actividad?${qs}` : '/actividad');
  }

  function limpiar() {
    setValores({ accion: '', desde: '', hasta: '' });
    router.push('/actividad');
  }

  const hayFiltros = Boolean(valores.accion || valores.desde || valores.hasta);

  return (
    <form
      onSubmit={aplicar}
      noValidate
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
    >
      <div className="w-full sm:max-w-xs">
        <Select
          label="Acción"
          placeholder="Todas"
          value={valores.accion}
          onValueChange={(valor) => setValores((v) => ({ ...v, accion: valor }))}
          options={ADMIN_ACTIONS.map((id) => ({ value: id, label: ACCIONES[id].etiqueta }))}
          fullWidth
        />
      </div>

      <Input
        type="date"
        label="Desde"
        value={valores.desde}
        onChange={(event) => setValores((v) => ({ ...v, desde: event.target.value }))}
      />

      <Input
        type="date"
        label="Hasta"
        value={valores.hasta}
        onChange={(event) => setValores((v) => ({ ...v, hasta: event.target.value }))}
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        {hayFiltros && (
          <Button type="button" size="sm" variant="ghost" onClick={limpiar}>
            Limpiar
          </Button>
        )}
      </div>
    </form>
  );
}
