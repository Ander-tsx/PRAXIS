'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Input, Textarea } from '../../atoms';
import { useAccion } from '../../hooks';
import { Dialog } from '../../molecules';
import { alpha, colors } from '../../tokens';
import { PlantillaAsistida } from './PlantillaAsistida';
import {
  type AplicarPlantillaAction,
  type BorradorDePlantillaAction,
  CREATE_PROJECT_INITIAL_STATE,
  type CreateProjectAction,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  validateProject,
} from './project-form';

export interface CreateProjectDialogProps {
  /**
   * Server Action que crea el proyecto. **Se inyecta**: cada zona tiene la
   * suya porque revalidan rutas distintas y traducen los errores del gateway de
   * forma distinta.
   */
  action: CreateProjectAction;
  /**
   * Las dos Server Actions del modo asistido.
   *
   * ⚠️ **Opcionales, y el modo solo aparece con las dos.** Sin una de ellas
   * este diálogo es exactamente el de siempre. Así una zona que aún no las tenga
   * no hereda una pestaña que no sabe atender, y apagar el modo no obliga a
   * tocar el organismo.
   */
  borradorAction?: BorradorDePlantillaAction;
  aplicarAction?: AplicarPlantillaAction;
  /** Texto del disparador. El estado vacío quiere uno más explícito. */
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary';
  /** `md` cabe en la cabecera; `lg` es para el estado vacío, donde es el foco. */
  triggerSize?: 'md' | 'lg';
}

/**
 * Crear proyecto: disparador + formulario dentro del `Dialog` de commons.
 *
 * Aquí solo vive el estado de la interfaz y la validación previa. La escritura
 * la hace la Server Action que llega por `action`.
 *
 * ## Por qué está en commons
 *
 * Lo usan **dos zonas** —el panel y la rejilla de proyectos— y estaba duplicado
 * byte a byte en las dos. La regla del repo es que un organismo sube aquí en
 * cuanto lo usan ≥2 zonas, precisamente para que un campo nuevo o un mensaje
 * corregido no haya que escribirlo dos veces y olvidarlo una.
 */
export function CreateProjectDialog({
  action,
  borradorAction,
  aplicarAction,
  triggerLabel = 'Nuevo proyecto',
  triggerVariant = 'primary',
  triggerSize = 'md',
}: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const asistenteDisponible = Boolean(borradorAction && aplicarAction);
  /**
   * `manual` de entrada, siempre.
   *
   * Quien viene a crear «Sprint 3» no quiere redactarle un briefing a nadie, y
   * ese es el caso más frecuente con diferencia. El modo asistido es para el
   * proyecto que se empieza de cero, que es justo cuando cuesta arrancar — y
   * ahí, un paso más no molesta.
   */
  const [modo, setModo] = useState<'manual' | 'asistido'>('manual');
  const [state, formAction, pending] = useAccion(action, CREATE_PROJECT_INITIAL_STATE);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** Solo enseñamos el error de validación cuando ya intentó enviar. */
  const [touched, setTouched] = useState(false);

  const nameId = useId();
  const descriptionId = useId();

  const clientError = validateProject({ name, description });

  // Cerramos solo cuando la acción confirma que el proyecto existe de verdad.
  useEffect(() => {
    if (state.createdName) {
      setOpen(false);
      setName('');
      setDescription('');
      setTouched(false);
    }
  }, [state]);

  /** Cerrar vuelve al modo manual: reabrir tiene que empezar donde siempre. */
  function cerrar() {
    setOpen(false);
    setModo('manual');
  }

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={cerrar}
        title="Nuevo proyecto"
        description="Nace contigo dentro y con un rol de administrador listo para repartir."
        /**
         * El mismo ancho en los dos modos.
         *
         * Lo pide el árbol del modo asistido, pero cambiarlo al alternar de
         * pestaña hacía saltar el diálogo debajo del cursor: son dos vistas de
         * la misma ventana, y una ventana que se redimensiona al tocar una
         * pestaña se lee como un fallo. El formulario en blanco cabe de sobra y
         * ahora los dos empiezan donde estaban.
         */
        size="xl"
      >
        {asistenteDisponible && (
          <div className="mb-5 flex gap-1 rounded-xl bg-surface p-1">
            <Pestana activa={modo === 'manual'} onClick={() => setModo('manual')}>
              En blanco
            </Pestana>
            <Pestana activa={modo === 'asistido'} onClick={() => setModo('asistido')}>
              Con el asistente
            </Pestana>
          </div>
        )}

        {modo === 'asistido' && borradorAction && aplicarAction ? (
          <PlantillaAsistida
            borradorAction={borradorAction}
            aplicarAction={aplicarAction}
            onCancelar={cerrar}
          />
        ) : (
          <form
            action={formAction}
            /**
             * `noValidate` a propósito: la validación nativa del navegador corta
             * el submit **antes** de este `onSubmit`, y el formulario se quedaba
             * mudo — sin marcar el campo y sin mensaje.
             */
            noValidate
            onSubmit={(event) => {
              setTouched(true);
              if (clientError) event.preventDefault();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              id={nameId}
              name="name"
              label="Nombre"
              placeholder="Rediseño del portal"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={PROJECT_NAME_MAX}
              variant={touched && clientError ? 'error' : 'default'}
              {...(touched && clientError ? { message: clientError } : {})}
              autoComplete="off"
              fullWidth
            />

            <Textarea
              id={descriptionId}
              name="description"
              label="Descripción"
              optional
              placeholder="En qué consiste y qué se espera conseguir."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={PROJECT_DESCRIPTION_MAX}
              showCount
              fullWidth
            />

            {state.error && (
              <p
                role="alert"
                className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
                style={{
                  background: alpha(colors.error, 10),
                  borderColor: alpha(colors.error, 30),
                }}
              >
                {state.error}
              </p>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
                Crear proyecto
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/** Una de las dos formas de empezar un proyecto. */
function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
        activa
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
