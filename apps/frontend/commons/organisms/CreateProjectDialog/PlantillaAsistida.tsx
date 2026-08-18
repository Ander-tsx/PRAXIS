'use client';

import { useState } from 'react';
import { TEMPLATE_BRIEF_MAX, TEMPLATE_BRIEF_MIN, TEMPLATE_TWEAK_MAX, projectHref } from '../../api';
import type {
  ProjectPermission,
  ProjectTemplate,
  TemplateColumn,
  TemplateQuota,
  TemplateResult,
} from '../../api/domain';
import { PERMISSION_LABELS, PROJECT_PERMISSIONS } from '../../api/domain';
import { Button, Input, Textarea } from '../../atoms';
import { alpha, colors } from '../../tokens';
import type { AplicarPlantillaAction, BorradorDePlantillaAction } from './project-form';
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX } from './project-form';

/**
 * Crear un proyecto contándoselo al asistente.
 *
 * ## Tres pasos, y el de en medio es el que importa
 *
 * `contar` → `revisar` → `hecho`. El del medio no es una cortesía: es **la
 * regla de §26.1 puesta en pantalla**. La IA propone y no ejecuta; lo que crea
 * el proyecto son N llamadas a los endpoints de siempre, y esas no salen hasta
 * que alguien ha visto lo que se va a crear y ha quitado lo que no quiere.
 *
 * Un botón que dijera «crear con IA» y montara veinte cosas de golpe sería la
 * misma capacidad con la revisión quitada, que es justo lo que este producto
 * decidió no hacer.
 *
 * ## Qué se puede editar, y qué no
 *
 * El nombre y la descripción se escriben; **todo lo demás se incluye o se
 * quita**. Un editor completo de cada columna y cada permiso sería rehacer aquí
 * las cuatro pantallas que ya existen para eso — y existen: en cuanto el
 * proyecto está creado, cada cosa se edita donde vive. Lo que hace falta antes
 * de crear es poder decir «esto no», que es lo que se ofrece.
 *
 * ⚠️ **Quitar un espacio se lleva sus tableros, y un tablero sus columnas.** No
 * se marcan uno a uno: al aplicar se poda el subárbol. Enseñar los hijos
 * tachados de un padre excluido solo sirve para que alguien crea que se van a
 * crear igual.
 */

type Paso = 'contar' | 'revisar' | 'hecho';

export interface PlantillaAsistidaProps {
  borradorAction: BorradorDePlantillaAction;
  aplicarAction: AplicarPlantillaAction;
  /** Para volver al modo manual desde el estado inicial. */
  onCancelar: () => void;
}

export function PlantillaAsistida({
  borradorAction,
  aplicarAction,
  onCancelar,
}: PlantillaAsistidaProps) {
  const [paso, setPaso] = useState<Paso>('contar');
  const [brief, setBrief] = useState('');
  const [plantilla, setPlantilla] = useState<ProjectTemplate | null>(null);
  const [cuota, setCuota] = useState<TemplateQuota | null>(null);
  const [resultado, setResultado] = useState<TemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinCuota, setSinCuota] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  /** Lo que se ha quitado del plan, por clave. Ver el aviso de arriba. */
  const [excluido, setExcluido] = useState<Set<string>>(new Set());

  function alternar(clave: string) {
    setExcluido((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(clave)) ahora.delete(clave);
      else ahora.add(clave);
      return ahora;
    });
  }

  /**
   * Pide un plan, o retoca el que ya hay.
   *
   * Con `ajuste` se le manda al modelo el plan anterior **y** lo que hay que
   * cambiar, así que es un segundo turno de la misma conversación. Sin él
   * genera de cero. Cuesta una consulta de cuota en los dos casos: es una
   * llamada a Gemini igual.
   */
  async function pedir(ajuste?: string) {
    setTrabajando(true);
    setError(null);
    setSinCuota(false);

    const respuesta =
      ajuste && plantilla
        ? await borradorAction(brief, { texto: ajuste, previa: plantilla })
        : await borradorAction(brief);

    setTrabajando(false);

    if (!respuesta.resultado) {
      setError(respuesta.error);
      setSinCuota(respuesta.sinCuota);
      return;
    }

    setPlantilla(respuesta.resultado.plantilla);
    setCuota(respuesta.resultado.cuota);
    /**
     * ⚠️ **Las exclusiones se reinician con cada plan nuevo, y tiene que ser
     * así.** Son posiciones (`w1b0c2`), no identidades: conservarlas sobre una
     * estructura recién generada quitaría lo que hubiera caído en esa posición,
     * que casi nunca es lo mismo. Perder dos clics es infinitamente mejor que
     * crear un proyecto al que le falta algo que nadie quitó.
     */
    setExcluido(new Set());
    setPaso('revisar');
  }

  async function crear() {
    if (!plantilla) return;

    setTrabajando(true);
    setError(null);

    const respuesta = await aplicarAction(podar(plantilla, excluido));

    setTrabajando(false);
    setResultado(respuesta);

    /* Con proyecto se pasa al resumen aunque haya fallos: el proyecto existe y
       esconderlo detrás de un error sería mentir sobre lo que hay creado. */
    if (respuesta.proyecto) setPaso('hecho');
    else setError(respuesta.error);
  }

  const restantes = cuota ? Math.max(0, cuota.limite - cuota.usados) : null;

  if (paso === 'hecho' && resultado?.proyecto) {
    return <Resumen resultado={resultado} />;
  }

  if (paso === 'revisar' && plantilla) {
    return (
      <div className="flex flex-col gap-4">
        <Revision
          plantilla={plantilla}
          excluido={excluido}
          onAlternar={alternar}
          onCambiarNombre={(nombre) => setPlantilla({ ...plantilla, nombre })}
          onCambiarDescripcion={(descripcion) => setPlantilla({ ...plantilla, descripcion })}
        />

        <Ajuste onPedir={pedir} trabajando={trabajando} restantes={restantes} />

        {error && <Aviso texto={error} />}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="mr-auto font-sans text-xs text-text-secondary">
            Nada de esto existe todavía.
          </span>
          <Button type="button" variant="ghost" onClick={() => setPaso('contar')}>
            Volver
          </Button>
          <Button type="button" onClick={crear} isLoading={trabajando}>
            Crear proyecto
          </Button>
        </div>
      </div>
    );
  }

  const largo = brief.trim().length;
  const listo = largo >= TEMPLATE_BRIEF_MIN && !trabajando;

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        label="Cuéntale de qué va tu proyecto"
        placeholder={
          'A qué se dedica tu equipo, cuántos sois y quién hace qué, cómo trabajáis hoy ' +
          'y qué necesitas tener organizado desde el primer día. Cuanto más concreto, ' +
          'mejor sale la plantilla.'
        }
        value={brief}
        onChange={(evento) => setBrief(evento.target.value)}
        maxLength={TEMPLATE_BRIEF_MAX}
        rows={7}
        showCount
        fullWidth
      />

      <p className="font-sans text-xs text-text-secondary">
        El asistente <strong>propone</strong>: verás la estructura completa y podrás quitar lo que
        no quieras antes de que se cree nada.
      </p>

      {error && <Aviso texto={error} accion={sinCuota ? null : 'Vuelve a intentarlo.'} />}

      <div className="mt-2 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        {/* `() => pedir()` y no `pedir`: como `ajuste` es opcional, pasarlo
            directo le colaba el `MouseEvent` como texto del ajuste. */}
        <Button type="button" onClick={() => pedir()} isLoading={trabajando} disabled={!listo}>
          Proponer plantilla
        </Button>
      </div>
    </div>
  );
}

/**
 * Quita del plan lo que se haya desmarcado.
 *
 * Se poda **aquí y no al pintar**: lo que viaja a la Server Action tiene que ser
 * exactamente lo que se va a crear. Filtrar solo en la vista dejaría la
 * diferencia entre lo que se ve y lo que se manda en manos de acordarse.
 *
 * ⚠️ **Se transforma antes de filtrar, y ese orden es el arreglo de un bug.**
 * Las claves de exclusión (`w1b0c2`) son posiciones del plan **original**, que
 * es contra el que se pintó. Encadenando `.filter().map()` el índice que recibe
 * el `map` es el de la lista ya recortada, así que quitar el primer espacio
 * corría todos los demás una posición y la poda de sus tableros pasaba a
 * aplicarse al espacio equivocado — en silencio, y solo cuando además se
 * quitaba algo de dentro. Mapeando primero, cada `i`, `j` y `k` es el de la
 * lista tal y como se enseñó.
 */
function podar(plantilla: ProjectTemplate, excluido: Set<string>): ProjectTemplate {
  return {
    ...plantilla,
    etiquetas: plantilla.etiquetas.filter((_, i) => !excluido.has(`e${i}`)),
    roles: plantilla.roles.filter((_, i) => !excluido.has(`r${i}`)),
    espacios: plantilla.espacios
      .map((espacio, i) => ({
        espacio,
        fuera: excluido.has(`w${i}`),
        tableros: espacio.tableros
          .map((tablero, j) => ({
            tablero,
            fuera: excluido.has(`w${i}b${j}`),
            columnas: tablero.columnas.filter((_, k) => !excluido.has(`w${i}b${j}c${k}`)),
          }))
          .filter((entrada) => !entrada.fuera && entrada.columnas.length > 0)
          .map((entrada) => ({ ...entrada.tablero, columnas: entrada.columnas })),
      }))
      .filter((entrada) => !entrada.fuera && entrada.tableros.length > 0)
      .map((entrada) => ({ ...entrada.espacio, tableros: entrada.tableros })),
  };
}

/**
 * La revisión del plan, en tres bloques: el proyecto, quién trabaja y dónde.
 *
 * ## El árbol se pinta como un EDT, no como una lista con sangría
 *
 * La primera versión apilaba espacio → tablero → columnas con un borde a la
 * izquierda, y no se entendía **qué era cada cosa**: tres niveles de nombres
 * propios sin nada que dijera cuál era un espacio y cuál un tablero. Ahora cada
 * nivel lleva su etiqueta —«Espacio», «Tablero», «Columnas»—, su icono y su
 * color, y las guías en L dibujan la descendencia como un organigrama.
 *
 * Es la pantalla donde alguien decide si acepta veinte objetos que no ha creado.
 * Si no entiende la jerarquía, no está revisando: está confiando.
 */
function Revision({
  plantilla,
  excluido,
  onAlternar,
  onCambiarNombre,
  onCambiarDescripcion,
}: {
  plantilla: ProjectTemplate;
  excluido: Set<string>;
  onAlternar: (clave: string) => void;
  onCambiarNombre: (valor: string) => void;
  onCambiarDescripcion: (valor: string) => void;
}) {
  return (
    <div className="flex max-h-[58vh] flex-col gap-6 overflow-y-auto pr-1">
      {plantilla.porQue && (
        <p
          className="rounded-xl border px-4 py-3 font-sans text-sm leading-relaxed text-text-secondary"
          style={{ background: alpha(colors.info, 8), borderColor: alpha(colors.info, 25) }}
        >
          <strong className="text-text-primary">Por qué esta estructura: </strong>
          {plantilla.porQue}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <Input
          label="Nombre del proyecto"
          value={plantilla.nombre}
          onChange={(evento) => onCambiarNombre(evento.target.value)}
          maxLength={PROJECT_NAME_MAX}
          fullWidth
        />

        {/* Seis filas y no dos: la descripción que propone el modelo son dos o
            tres frases, y con `rows={2}` había que hacer scroll dentro del
            campo para leer lo que se iba a guardar. */}
        <Textarea
          label="Descripción"
          optional
          value={plantilla.descripcion}
          onChange={(evento) => onCambiarDescripcion(evento.target.value)}
          maxLength={PROJECT_DESCRIPTION_MAX}
          rows={6}
          showCount
          fullWidth
        />
      </div>

      {plantilla.etiquetas.length > 0 && (
        <Seccion
          titulo="Etiquetas"
          ayuda="Vocabulario para clasificar tareas. Sirven en todos los tableros del proyecto."
        >
          <div className="flex flex-wrap gap-2">
            {plantilla.etiquetas.map((etiqueta, i) => (
              <Chip
                key={`${etiqueta.nombre}-${etiqueta.color}`}
                texto={etiqueta.nombre}
                tono={colors[etiqueta.color]}
                fuera={excluido.has(`e${i}`)}
                onAlternar={() => onAlternar(`e${i}`)}
              />
            ))}
          </div>
        </Seccion>
      )}

      {plantilla.roles.length > 0 && (
        <Seccion
          titulo="Roles"
          ayuda="Qué puede hacer cada perfil. Tú entras como administrador, así que ninguno de estos te limita."
        >
          <ul className="flex flex-col gap-2">
            {plantilla.roles.map((rol, i) => (
              <li key={rol.nombre}>
                <Tarjeta
                  fuera={excluido.has(`r${i}`)}
                  onAlternar={() => onAlternar(`r${i}`)}
                  titulo={rol.nombre}
                  etiqueta="Rol"
                  tono={colors.accent}
                >
                  {/**
                   * Los permisos **por su nombre**, no contados.
                   *
                   * Decía «3 permisos», y eso obligaba a crear el proyecto para
                   * enterarse de qué se estaba repartiendo — justo lo que esta
                   * pantalla existe para evitar. Son como mucho dieciocho y
                   * caben.
                   */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {permisosDe(rol.permisos).map((permiso) => (
                      <span
                        key={permiso}
                        className="rounded-md px-1.5 py-0.5 font-sans text-[11px] leading-tight"
                        style={{
                          background: alpha(colors.accent, 12),
                          color: colors.textSecondary,
                        }}
                      >
                        {PERMISSION_LABELS[permiso]}
                      </span>
                    ))}
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion
        titulo="Estructura de trabajo"
        ayuda="Un espacio agrupa tableros; cada tablero es un flujo con sus columnas, de izquierda a derecha."
      >
        <ul className="flex flex-col gap-3">
          {plantilla.espacios.map((espacio, i) => {
            const espacioFuera = excluido.has(`w${i}`);

            return (
              <li key={espacio.nombre}>
                <Tarjeta
                  fuera={espacioFuera}
                  onAlternar={() => onAlternar(`w${i}`)}
                  titulo={espacio.nombre}
                  etiqueta="Espacio"
                  tono={colors.primary}
                />

                {!espacioFuera && (
                  <ul className="mt-2 flex flex-col gap-2 pl-3">
                    {espacio.tableros.map((tablero, j) => {
                      const tableroFuera = excluido.has(`w${i}b${j}`);
                      const ultimoTablero = j === espacio.tableros.length - 1;

                      return (
                        <li key={tablero.nombre} className="relative pl-5">
                          <Guia ultimo={ultimoTablero} />

                          <Tarjeta
                            fuera={tableroFuera}
                            onAlternar={() => onAlternar(`w${i}b${j}`)}
                            titulo={tablero.nombre}
                            etiqueta="Tablero"
                            tono={colors.info}
                          />

                          {!tableroFuera && (
                            <div
                              className="relative mt-2 pl-5"
                              /* La guía vertical de las columnas muere aquí: si
                                 el tablero es el último, el trazo de su padre ya
                                 se ha cortado y este no debe continuarlo. */
                            >
                              <Guia ultimo columnas />
                              <div className="flex flex-wrap items-center gap-1.5">
                                {tablero.columnas.map((columna, k) => (
                                  <ColumnaChip
                                    key={columna.nombre}
                                    columna={columna}
                                    fuera={excluido.has(`w${i}b${j}c${k}`)}
                                    onAlternar={() => onAlternar(`w${i}b${j}c${k}`)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Seccion>
    </div>
  );
}

/**
 * La guía en L que cuelga de la fila de arriba.
 *
 * Es lo que convierte tres listas con sangría en un árbol: sin el trazo, la
 * distancia a la izquierda es la única pista de la jerarquía, y con nombres
 * largos que envuelven deja de leerse.
 *
 * `ultimo` corta el trazo vertical a la altura del codo, que es lo que hace que
 * el último hermano se vea como el último y no como uno del que aún cuelga algo.
 */
function Guia({ ultimo, columnas }: { ultimo: boolean; columnas?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute left-0 w-px ${ultimo ? 'h-[18px]' : 'h-full'}`}
        style={{ top: 0, background: colors.border }}
      />
      <span
        aria-hidden="true"
        className="absolute left-0 h-px"
        style={{ top: 18, width: columnas ? 12 : 16, background: colors.border }}
      />
    </>
  );
}

/**
 * Una fila del árbol: qué es, cómo se llama, y se quita al pulsarla.
 *
 * La etiqueta de tipo va **antes** del nombre y con el color del nivel. Sin
 * ella, «Obras» y «Obra Chamberí» eran dos nombres propios uno debajo del otro
 * y nada decía que el segundo viviera dentro del primero.
 */
function Tarjeta({
  fuera,
  onAlternar,
  titulo,
  etiqueta,
  tono,
  children,
}: {
  fuera: boolean;
  onAlternar: () => void;
  titulo: string;
  etiqueta: string;
  tono: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={!fuera}
      title={fuera ? `Volver a incluir «${titulo}»` : `Quitar «${titulo}»`}
      className={`flex w-full cursor-pointer flex-col items-start rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-elevated ${
        fuera ? 'opacity-40' : ''
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: alpha(tono, 15), color: tono }}
        >
          {etiqueta}
        </span>
        <span
          className={`font-sans text-sm font-medium text-text-primary ${
            fuera ? 'line-through' : ''
          }`}
        >
          {titulo}
        </span>
      </span>
      {children}
    </button>
  );
}

/**
 * Una columna del tablero.
 *
 * La de cierre se marca **con palabra, no solo con el verde**: el color dice
 * que una tarea que entra ahí se da por terminada, y eso no se deduce de que sea
 * verde si nadie te lo ha contado. Es la comprobación más importante que se
 * puede hacer en esta pantalla.
 */
function ColumnaChip({
  columna,
  fuera,
  onAlternar,
}: {
  columna: TemplateColumn;
  fuera: boolean;
  onAlternar: () => void;
}) {
  const cierra = columna.color === 'success';
  const tono = columna.color ? colors[columna.color] : colors.textSecondary;

  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={!fuera}
      title={fuera ? `Volver a incluir «${columna.nombre}»` : `Quitar «${columna.nombre}»`}
      className={`cursor-pointer rounded-md px-2 py-1 font-sans text-xs font-medium transition-opacity ${
        fuera ? 'line-through opacity-40' : ''
      }`}
      style={{ background: alpha(tono, 15), color: tono }}
    >
      {columna.nombre}
      {cierra && <span className="ml-1 opacity-70">· cierra tareas</span>}
    </button>
  );
}

/**
 * El resumen de lo creado.
 *
 * Enseña **los fallos uno a uno**, no un contador. Si tres etiquetas no
 * entraron, quien acaba de crear el proyecto necesita saber cuáles para
 * ponerlas a mano; «hubo 3 errores» le obliga a compararlo todo.
 */
function Resumen({ resultado }: { resultado: TemplateResult }) {
  const { creado, fallos, proyecto } = resultado;
  if (!proyecto) return null;

  const partes = [
    contar(creado.espacios, 'espacio', 'espacios'),
    contar(creado.tableros, 'tablero', 'tableros'),
    contar(creado.columnas, 'columna', 'columnas'),
    contar(creado.etiquetas, 'etiqueta', 'etiquetas'),
    contar(creado.roles, 'rol', 'roles'),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-xl text-text-primary">«{proyecto.name}» está listo</p>
        {partes.length > 0 && (
          <p className="mt-1 font-sans text-sm text-text-secondary">
            Se han creado {lista(partes)}.
          </p>
        )}
      </div>

      {fallos.length > 0 && (
        <div
          className="flex flex-col gap-1 rounded-xl border px-3 py-2"
          style={{
            background: alpha(colors.warning, 8),
            borderColor: alpha(colors.warning, 30),
          }}
        >
          <p className="font-sans text-sm font-medium" style={{ color: colors.warning }}>
            Esto se quedó fuera, y puedes crearlo a mano:
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {fallos.map((fallo) => (
              <li key={fallo} className="font-sans text-xs text-text-secondary">
                {fallo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        {/* `<a>` y no `next/link`: el diálogo se monta en el panel y en la
            rejilla de proyectos, que son zonas distintas, y entre zonas la
            navegación tiene que ser dura (ESTADO-ACTUAL §16). */}
        <a
          href={projectHref(proyecto)}
          className="inline-flex h-10 items-center rounded-lg px-4 font-sans text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          style={{ background: colors.primary }}
        >
          Abrir el proyecto
        </a>
      </div>
    </div>
  );
}

/* ─── Piezas ──────────────────────────────────────────────────────────── */

function Seccion({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  /**
   * Qué es esto, en una línea.
   *
   * No es relleno: «espacio», «tablero» y «columna» son vocabulario de la
   * herramienta, y quien crea su primer proyecto no lo tiene. Sin esta línea la
   * sección enseñaba una jerarquía de tres niveles sin decir qué era ninguno.
   */
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {titulo}
        </h4>
        {ayuda && <p className="font-sans text-xs text-text-secondary">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Un elemento del plan que se puede quitar.
 *
 * Lo excluido **se queda en pantalla, tachado**, en vez de desaparecer: poder
 * volver a meterlo sin repetir la consulta es medio sentido de esta pantalla, y
 * cada consulta cuesta cuota.
 */
function Chip({
  texto,
  tono,
  fuera,
  onAlternar,
}: {
  texto: string;
  tono: string;
  fuera: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={!fuera}
      title={fuera ? `Volver a incluir «${texto}»` : `Quitar «${texto}»`}
      className={`cursor-pointer rounded-full px-2.5 py-1 font-sans text-xs font-medium transition-opacity ${
        fuera ? 'line-through opacity-40' : ''
      }`}
      style={{ background: alpha(tono, 15), color: tono }}
    >
      {texto}
    </button>
  );
}

/**
 * Seguir hablando con el asistente sobre el plan que ya propuso.
 *
 * ## Por qué es una caja de texto y no un chat con burbujas
 *
 * Lo que se está revisando **es** la respuesta: el árbol de arriba se
 * reemplaza entero con cada ajuste. Un hilo de mensajes obligaría a leer la
 * conversación para saber qué versión estás mirando, cuando la versión la
 * tienes delante. Aquí solo hace falta el turno siguiente.
 *
 * ⚠️ **Gasta una consulta de cuota**, igual que la primera: es una llamada a
 * Gemini como cualquier otra. Se dice al lado del botón, y no después de
 * pulsarlo.
 */
function Ajuste({
  onPedir,
  trabajando,
  restantes,
}: {
  onPedir: (ajuste: string) => void;
  trabajando: boolean;
  restantes: number | null;
}) {
  const [texto, setTexto] = useState('');

  const listo = texto.trim().length > 0 && !trabajando && restantes !== 0;

  function enviar() {
    if (!listo) return;
    onPedir(texto.trim());
    setTexto('');
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <label className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
        ¿Le cambiarías algo?
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <span className="min-w-56 flex-1">
          <Input
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Añade un tablero para el equipo de diseño, y quita el rol de becario"
            maxLength={TEMPLATE_TWEAK_MAX}
            fullWidth
            onKeyDown={(evento) => {
              if (evento.key !== 'Enter') return;
              evento.preventDefault();
              enviar();
            }}
          />
        </span>

        <Button type="button" variant="secondary" onClick={enviar} disabled={!listo}>
          Ajustar
        </Button>
      </div>

      <p className="font-sans text-xs text-text-secondary">
        {restantes === 0
          ? 'Se te han acabado las consultas de este mes. Puedes crear el proyecto tal y como está.'
          : `Rehace la propuesta con tu cambio. Gasta una consulta${
              restantes === null ? '' : `; te quedan ${restantes}`
            }.`}
      </p>
    </div>
  );
}

function Aviso({ texto, accion }: { texto: string; accion?: string | null }) {
  return (
    <p
      role="alert"
      className="rounded-lg border px-3 py-2 font-sans text-sm text-error"
      style={{ background: alpha(colors.error, 10), borderColor: alpha(colors.error, 30) }}
    >
      {texto}
      {accion ? ` ${accion}` : ''}
    </p>
  );
}

/**
 * Los permisos concedidos, en el orden en que los piensa quien reparte roles.
 *
 * Se ordenan contra `PROJECT_PERMISSIONS` y no por como venga el objeto: el
 * modelo los devuelve en el orden que le apetece, y dos roles del mismo plan
 * salían con los mismos permisos en distinto orden, que se lee como si fueran
 * distintos.
 */
function permisosDe(permisos: Partial<Record<ProjectPermission, boolean>>): ProjectPermission[] {
  return PROJECT_PERMISSIONS.filter((permiso) => permisos[permiso] === true);
}

function contar(cuantos: number, singular: string, plural: string): string {
  if (cuantos === 0) return '';
  return `${cuantos} ${cuantos === 1 ? singular : plural}`;
}

function lista(partes: string[]): string {
  if (partes.length === 1) return partes[0] as string;
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}
