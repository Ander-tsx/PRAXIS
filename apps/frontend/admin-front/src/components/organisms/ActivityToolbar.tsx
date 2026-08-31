'use client';

import { ACCIONES } from '@/lib/admin';
import {
  ADMIN_ACTIONS,
  type AdminActionName,
  Button,
  Select,
  SelectorDeFecha,
} from '@praxis/commons';
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
    <form onSubmit={aplicar} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
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

      <div className="w-full sm:w-48">
        <SelectorDeFecha
          name="desde"
          label="Desde"
          defaultValue={valores.desde}
          onValueChange={(valor) => setValores((v) => ({ ...v, desde: valor }))}
        />
      </div>

      <div className="w-full sm:w-48">
        <SelectorDeFecha
          name="hasta"
          label="Hasta"
          defaultValue={valores.hasta}
          onValueChange={(valor) => setValores((v) => ({ ...v, hasta: valor }))}
        />
      </div>

      <div className="flex gap-2 h-10">
        <Button type="submit">Filtrar</Button>
        {hayFiltros && (
          <Button type="button" variant="ghost" onClick={limpiar}>
            Limpiar
          </Button>
        )}
      </div>
    </form>
  );
}
