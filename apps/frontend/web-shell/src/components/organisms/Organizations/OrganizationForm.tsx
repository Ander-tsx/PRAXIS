'use client';

import { crearOrganizacionAction } from '@/app/(privado)/main/team/actions';
import { CREAR_ORGANIZACION_INITIAL_STATE } from '@/lib/main/action-state';
import { Button, Input, useAccion } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useId } from 'react';

/**
 * Crear una organización. Un campo, y nada más.
 *
 * ## Lo que ya no pregunta
 *
 * 🔴 Pedía el **plan** y los **asientos** antes de crearla, porque la etapa
 * anterior daba por hecho que una organización solo existía para pagar un plan
 * de empresa. Desde que la organización **contiene** los proyectos —hasta la de
 * quien trabaja solo— eso dejó de ser cierto: crear una es un gesto de
 * organización, no de compra. Nace en gratuito y el plan se contrata desde su
 * portal, el día que el equipo o los proyectos no quepan.
 *
 * ## `action={…}` y no `onSubmit`, a propósito
 *
 * ⚠️ Es la excepción de la regla del repositorio: un formulario que **edita** se
 * envía con `onSubmit` + `preventDefault()` porque React 19 resetea los campos
 * al terminar la acción. Este **da de alta**, y ahí vaciarse al enviar es justo
 * lo que se quiere.
 */
export function OrganizationForm() {
  const router = useRouter();
  const [state, formAction, pending] = useAccion(
    crearOrganizacionAction,
    CREAR_ORGANIZACION_INITIAL_STATE,
  );

  const nombreId = useId();

  /* Al crearla se entra directamente en su portal. Dejar a alguien en el
     formulario vacío tras crear algo obliga a preguntarse si funcionó. */
  useEffect(() => {
    if (state.creada) router.push(`/main/organizations/${state.creada}`);
  }, [state.creada, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5 border-t border-border pt-8">
      <div className="flex flex-col gap-2">
        <label htmlFor={nombreId} className="font-display text-xl text-text-primary">
          ¿Cómo se llama?
        </label>
        <p className="font-serif text-sm italic text-white">
          El nombre del equipo, del estudio o de la empresa. Se puede cambiar después.
        </p>
      </div>

      <Input
        id={nombreId}
        name="name"
        placeholder="Estudio Nordeste"
        maxLength={80}
        required
        autoComplete="organization"
      />

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
        <Button type="submit" isLoading={pending}>
          Crear la organización
        </Button>
        {/* ⚠️ Se dice antes de pulsar, no en la letra pequeña de después: nace
            en gratuito, y alguien que espere haber comprado algo aquí se lleva
            una sorpresa al invitar a la undécima persona. */}
        <span className="font-sans text-xs text-white">
          Empieza en el plan gratuito · 3 asientos · 3 proyectos
        </span>
      </div>
    </form>
  );
}
