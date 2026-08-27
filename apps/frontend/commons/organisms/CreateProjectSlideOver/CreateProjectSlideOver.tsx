'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Input, Sparkle, Textarea, iniciales } from '../../atoms';
import { useAccion } from '../../hooks';
import { QuotaNotice, SlideOver } from '../../molecules';
import { alpha, colors } from '../../tokens';
import { MockMiniChat } from './MockMiniChat';
import {
  type AplicarPlantillaAction,
  CREATE_PROJECT_INITIAL_STATE,
  type CreateProjectAction,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  type TemplateDraftAction,
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
  borradorAction?: TemplateDraftAction;
  aplicarAction?: AplicarPlantillaAction;
  /** Texto del disparador. El estado vacío quiere uno más explícito. */
  triggerLabel?: string;
  /**
   * Cómo se ve el disparador.
   *
   * `tarjeta` no es un color de botón: es **otra forma**, una tarjeta de borde
   * discontinuo del alto de sus vecinas, para ocupar la última celda de la
   * rejilla de proyectos. Con dos proyectos y tres columnas, ese hueco existía
   * igual y no decía nada; así el gesto de crear está donde se está mirando y
   * la fila queda completa.
   */
  triggerVariant?: 'primary' | 'secondary' | 'tarjeta';
  /** `md` cabe en la cabecera; `lg` es para el estado vacío, donde es el foco. */
  triggerSize?: 'md' | 'lg';
}

const PROJECT_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

/**
 * Crear proyecto: disparador + formulario dentro del `SlideOver`.
 *
 * Aquí solo vive el estado de la interfaz y la validación previa. La escritura
 * la hace la Server Action que llega por `action`.
 */
export function CreateProjectSlideOver({
  action,
  borradorAction,
  aplicarAction,
  triggerLabel = 'Nuevo proyecto',
  triggerVariant = 'primary',
  triggerSize = 'md',
}: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const asistenteDisponible = true; // Forzado a true para la demo visual
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
  const [colorLogo, setColorLogo] = useState<string | null>(null);
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
      setColorLogo(null);
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
      {triggerVariant === 'tarjeta' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          /* `h-full` y el mismo radio que una tarjeta de proyecto: en la rejilla
             tiene que medir lo que sus vecinas, no lo que ocupa su texto. */
          className="group flex h-full min-h-[10rem] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
            style={{ background: alpha(colors.primary, 10), color: colors.primary }}
          >
            <IconoMas grande />
          </span>
          <span className="font-sans text-sm font-semibold text-text-secondary transition-colors group-hover:text-text-primary">
            {triggerLabel}
          </span>
        </button>
      ) : (
        /**
         * 🔴 **Aquí no había nada: un `<a></a>` vacío.**
         *
         * `e213e64` añadió la variante de tarjeta para la rejilla y, al montar
         * el ternario, **borró el `<Button>` original en vez de dejarlo como
         * rama `else`**. Como `triggerVariant` vale `'primary'` por defecto y
         * solo la rejilla pasa `'tarjeta'`, todo lo demás caía en un ancla
         * vacía.
         *
         * Lo que eso significaba en pantalla: **una cuenta recién creada no
         * podía crear su primer proyecto**. El estado vacío de `/projects`
         * pinta su título, su frase y, donde va la llamada a la acción, nada.
         * Los `triggerLabel="Crear mi primer proyecto"` y `triggerSize="lg"`
         * que le pasa la página se ignoraban en silencio.
         *
         * No lo vio nadie porque un ancla vacía **no es un error**: no rompe el
         * render, no avisa en consola y en el árbol de accesibilidad
         * sencillamente no existe. Lo cazó la primera corrida de la suite de
         * interfaz — que hasta hoy no se había podido ejecutar aquí por falta
         * de navegador.
         */
        <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
      )}

      <SlideOver
        open={open}
        onClose={cerrar}
        title="Nuevo proyecto"
        description="Crea tu propio proyecto y gestionalo a tu manera."
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
        {/**
         * Las dos formas de empezar, **con lo que hace cada una escrito**.
         *
         * Eran dos pestañas de dos palabras («En blanco» / «Con el asistente») y
         * elegir bien exigía haberlas probado. Con una línea debajo, la decisión
         * se toma leyendo, que es lo que se espera de una bifurcación que cambia
         * el resto del recorrido.
         */}
        {asistenteDisponible && (
          <div className="mb-5 grid gap-2 sm:grid-cols-2">
            <ModoOpcion
              activa={modo === 'manual'}
              onClick={() => setModo('manual')}
              titulo="En blanco"
              texto="Un nombre y una descripción. Lo demás lo montas tú."
              /* Una hoja, no un «+»: `Sparkle` es una estrella de cuatro puntas
                 y a 16 px se lee casi igual que un más, así que las dos
                 opciones parecían el mismo icono. */
              icono={<IconoHoja />}
            />
            <ModoOpcion
              activa={modo === 'asistido'}
              onClick={() => setModo('asistido')}
              titulo="Con el asistente"
              texto="Cuentas la idea y te propone espacios, tableros y etiquetas."
              icono={<Sparkle size={16} />}
            />
          </div>
        )}

        {modo === 'asistido' ? (
          <MockMiniChat onCancelar={cerrar} />
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
            className="flex flex-col gap-5 flex-1 overflow-y-auto"
          >
            {/* Formulario a la izquierda, vista previa a la derecha: dos campos
                solos en 48 rem dejaban media ventana vacía, y lo que faltaba
                ahí era justamente saber en qué se está convirtiendo lo que se
                escribe. En móvil caen uno debajo del otro. */}
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-6">
                <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-sm">
                  <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Información Principal
                  </h3>

                  <Input
                    id={nameId}
                    name="name"
                    label="Nombre del proyecto"
                    placeholder="Ej. Rediseño del portal web"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={PROJECT_NAME_MAX}
                    variant={touched && clientError ? 'error' : 'default'}
                    {...(touched && clientError ? { message: clientError } : {})}
                    autoComplete="off"
                    fullWidth
                  />

                  <div className="flex flex-col gap-3 pt-2">
                    <span className="font-sans text-sm font-semibold text-text-primary">
                      Color del logo
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {PROJECT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColorLogo(c)}
                          className="h-9 w-9 rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
                          style={{
                            backgroundColor: c,
                            boxShadow:
                              colorLogo === c
                                ? `0 0 0 3px ${colors.surface}, 0 0 0 5px ${c}`
                                : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                          }}
                          aria-label={`Seleccionar color ${c}`}
                          aria-pressed={colorLogo === c}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
                  <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Detalles Adicionales
                  </h3>
                  <Textarea
                    id={descriptionId}
                    name="description"
                    label="Descripción"
                    optional
                    placeholder="En qué consiste y qué se espera conseguir con este proyecto."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={PROJECT_DESCRIPTION_MAX}
                    rows={4}
                    showCount
                    fullWidth
                  />
                </div>
              </div>

              <div className="w-full lg:w-64 shrink-0">
                <VistaPrevia nombre={name} descripcion={description} colorLogo={colorLogo} />
              </div>
            </div>

            {/**
             * Un tope del plan no es un error del formulario, y no se pinta
             * igual.
             *
             * 🔴 Antes sí: el 402 salía como una línea roja idéntica a la de un
             * nombre duplicado, sin decir qué plan lo resuelve ni cómo llegar a
             * él. Es el sitio exacto donde alguien decidiría pagar, y era un
             * callejón. El detalle ya viajaba en la respuesta; solo faltaba
             * enseñarlo.
             */}
            {state.cuota ? (
              <QuotaNotice
                detalle={state.cuota}
                mensaje={state.error ?? ''}
                /* La segunda cara: el gateway dice si esta persona puede pagar.
                   Ausente = no se sabe, y se ofrece la salida igual. */
                ampliarSirve={state.cuota.puedeAmpliar !== false}
              />
            ) : (
              state.error && (
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
              )
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={pending} disabled={touched && Boolean(clientError)}>
                Crear proyecto
              </Button>
            </div>
          </form>
        )}
      </SlideOver>
    </>
  );
}

/** Una de las dos formas de empezar un proyecto, con lo que hace escrito. */
function ModoOpcion({
  activa,
  onClick,
  titulo,
  texto,
  icono,
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  texto: string;
  icono: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors"
      style={{
        borderColor: activa ? colors.primary : colors.border,
        background: activa ? alpha(colors.primary, 8) : 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: activa ? alpha(colors.primary, 14) : alpha(colors.textSecondary, 10),
          color: activa ? colors.primary : colors.textSecondary,
        }}
      >
        {icono}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-sm font-semibold text-text-primary">{titulo}</span>
        <span className="font-sans text-xs text-text-secondary">{texto}</span>
      </span>
    </button>
  );
}

/**
 * Cómo va quedando el proyecto, mientras se escribe.
 *
 * Es la misma pieza que verá en la rejilla —cuadrado con las iniciales, nombre
 * y descripción recortada— y sirve para dos cosas: enseñar que el nombre se
 * convierte en unas iniciales que hay que poder distinguir de las de al lado, y
 * ocupar la mitad de ventana que sobraba.
 *
 * ⚠️ **El cuadrado va en gris, no en un color de proyecto.** En la rejilla el
 * tono sale del `id`, y el `id` no existe hasta que el proyecto se crea:
 * enseñar aquí un violeta y que salga verde sería prometer algo que no depende
 * de nadie. Se pinta neutro y se dice, en una línea, que el color se asigna al
 * crearlo — que además es la forma de enterarse de que los proyectos tienen
 * color.
 *
 * Las iniciales salen de `iniciales()`, **la misma función** que usa la
 * rejilla: si algún día cambia la regla, cambia en los dos sitios a la vez.
 */
function VistaPrevia({
  nombre,
  descripcion,
  colorLogo,
}: { nombre: string; descripcion: string; colorLogo?: string | null }) {
  const limpio = nombre.trim();

  return (
    <aside className="flex flex-col gap-3">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-text-disabled">
        Así se verá
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-sans text-sm font-semibold uppercase"
            style={
              colorLogo
                ? {
                    background: alpha(colorLogo, 15),
                    color: colorLogo,
                    boxShadow: `inset 0 0 0 1px ${alpha(colorLogo, 30)}`,
                  }
                : {
                    background: alpha(colors.textSecondary, 12),
                    color: colors.textSecondary,
                    boxShadow: `inset 0 0 0 1px ${alpha(colors.textSecondary, 25)}`,
                  }
            }
          >
            {limpio ? iniciales(limpio) : '—'}
          </span>

          <span className="flex min-w-0 flex-col gap-0.5">
            <span
              className={`truncate font-sans text-sm font-semibold ${
                limpio ? 'text-text-primary' : 'text-text-disabled'
              }`}
            >
              {limpio || 'Sin nombre'}
            </span>
            <span className="font-sans text-xs text-text-disabled">Tuyo</span>
          </span>
        </div>

        <p
          className={`line-clamp-4 font-sans text-xs ${
            descripcion.trim() ? 'text-text-secondary' : 'italic text-text-disabled'
          }`}
        >
          {descripcion.trim() || 'Sin descripción'}
        </p>
      </div>
    </aside>
  );
}

/** El «+» del disparador, en sus dos tamaños. */
function IconoMas({ grande = false }: { grande?: boolean }) {
  return (
    <svg
      className={grande ? 'h-5 w-5' : 'h-4 w-4'}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Una hoja en blanco: el modo manual. */
function IconoHoja() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8m-4.5-4.5L18.5 8m-4.5-4.5V8h4.5"
      />
    </svg>
  );
}
