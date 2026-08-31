'use client';

import { guardarIdentidadOrgAction } from '@/app/(private)/team/actions';
import { ORGANIZACION_INITIAL_STATE } from '@/lib/action-state';
import {
  Button,
  FloatingLabelInput,
  GLYPH_COLOR_DEFAULT,
  Glyph,
  GlyphPicker,
  type GlyphSelection,
  glyphByKey,
  useAccion,
} from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Nombre, icono y color de la organización.
 *
 * ## De dónde viene
 *
 * Estaba en un modal del selector de la barra lateral (`OrgSettingsModal` en
 * `commons/OrgSwitcher`). Se movió aquí para que toda la configuración de la
 * organización viva en su portal, y el botón «Configuración» del desplegable
 * **navega** a `#configuracion` en vez de abrir un modal.
 *
 * ## `onSubmit` y no `action={…}`
 *
 * ⚠️ Esto **edita** valores que ya existen: un `<form action>` se resetea solo
 * en React 19 y los campos volverían a su `defaultValue`. El estado se lleva en
 * React y el `FormData` se construye a mano. Ver CLAUDE.md.
 *
 * ## El permiso
 *
 * Lo comprueba `billing-service` (`canManageOrganization`). Quien no lo tenga ve
 * la identidad pero no el formulario: un formulario que siempre devuelve 403 es
 * peor que no enseñarlo.
 */
export function OrgIdentityForm({
  organizationId,
  initialName,
  initialIconKey,
  initialColor,
  puedeEditar,
}: {
  organizationId: string;
  initialName: string;
  initialIconKey: string | null;
  initialColor: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useAccion(
    guardarIdentidadOrgAction,
    ORGANIZACION_INITIAL_STATE,
  );

  const [name, setName] = useState(initialName);
  const [seleccion, setSeleccion] = useState<GlyphSelection>({
    iconKey: initialIconKey,
    color: initialColor || GLYPH_COLOR_DEFAULT,
  });

  /* Al confirmar el servidor: refrescar la ruta rehace también el layout, así
     que el monograma del selector de la barra lateral y de todas partes se
     pone al día sin recargar la pestaña entera. */
  useEffect(() => {
    if (state.done) router.refresh();
  }, [state.done, router]);

  const inicial = (name.trim() || initialName.trim() || 'O').charAt(0).toUpperCase();

  const preview = glyphByKey(seleccion.iconKey) ? (
    <Glyph iconKey={seleccion.iconKey} color={seleccion.color} size="md" shape="square" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated font-sans text-base font-semibold text-text-primary">
      {inicial}
    </span>
  );

  if (!puedeEditar) {
    return (
      <div className="flex items-center gap-4">
        {preview}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-base text-text-primary">
            {initialName || 'Sin nombre'}
          </span>
          <span className="font-sans text-xs text-white">
            Solo quien administra la organización puede cambiar su nombre o su icono.
          </span>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const datos = new FormData();
        datos.set('organizationId', organizationId);
        datos.set('name', name.trim());
        /* Cadena vacía = sin icono; la acción la convierte en `null`. */
        datos.set('iconKey', seleccion.iconKey ?? '');
        datos.set('color', seleccion.color ?? '');
        formAction(datos);
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center gap-4">
        {preview}
        <div className="min-w-0 flex-1">
          <FloatingLabelInput
            id="org-name"
            label="Nombre"
            value={name}
            onChange={(evento) => setName(evento.target.value)}
            maxLength={80}
          />
        </div>
      </div>

      <GlyphPicker value={seleccion} onChange={setSeleccion} disabled={pending} />

      {state.error && (
        <p role="alert" className="font-sans text-sm text-error">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="font-sans text-sm text-success">
          Guardado.
        </p>
      )}

      <div>
        <Button type="submit" isLoading={pending} disabled={name.trim().length < 2}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
