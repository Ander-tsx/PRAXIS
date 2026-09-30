import type { ClaseDePaso, PasoDePensamiento } from '@praxis/contracts';
import type { Intencion } from './router';

/**
 * Cómo se cuenta lo que hace PRAX mientras piensa.
 *
 * Cada paso es algo que **ha ocurrido**: se emite en el momento en que pasa y
 * se guarda con la respuesta, así que al releer una conversación se despliega
 * lo mismo que se vio en vivo. Nada aquí es decorado ni se inventa: si un turno
 * no consultó nada, su pensamiento no dice que lo hizo.
 *
 * ⚠️ **No nombra a Jev ni al router.** Lo que se enseña es la decisión —«es una
 * charla, respondo sin cargar las tareas»—, no quién la tomó: el enrutado es un
 * detalle de implementación que puede cambiar de proveedor mañana.
 */

export function paso(clase: ClaseDePaso, texto: string, detalle?: string): PasoDePensamiento {
  return detalle ? { clase, texto, detalle } : { clase, texto };
}

const CHARLA =
  /^\s*(hola|buenas|hey|gracias|muchas gracias|ok|vale|genial|perfecto|adi[oó]s|buen[oa]s? (d[ií]as|tardes|noches))\b[\s!.,¡¿?]*$/i;
const CAMBIO =
  /\b(crea|cr[eé]ame|a[ñn]ade|a[ñn]ádeme|mueve|asigna|reasigna|borra|elimina|cambia|edita|renombra|planifica|reparte|programa|prepara|monta|escribe|manda|env[ií]a|marca|arranca|inicia|cierra)\w*\b/i;

/**
 * La intención del mensaje sin preguntarle a nadie: una lectura rápida por
 * palabras para contar el paso de «ruta» cuando el router heurístico no
 * clasifica. **Solo describe**: no cambia qué contexto viaja.
 */
export function intencionPorPalabras(mensaje: string): Intencion {
  if (CHARLA.test(mensaje)) return 'charla';
  if (CAMBIO.test(mensaje)) return 'cambio';
  return 'pregunta';
}

export function pasoDeRuta(intencion: Intencion, conInventario: boolean): PasoDePensamiento {
  if (intencion === 'charla') {
    return paso(
      'ruta',
      'Es una charla',
      conInventario ? 'contesto directamente' : 'contesto sin cargar las tareas',
    );
  }
  if (intencion === 'cambio') return paso('ruta', 'Piden un cambio', 'preparo una propuesta');
  return paso('ruta', 'Es una pregunta', 'busco la respuesta en los datos');
}

/** «12 tareas», «3 sprints»: lo que devolvió una consulta, en corto. */
export function resumenDeConsulta(nombre: string, resultado: Record<string, unknown>): string {
  if (typeof resultado.error === 'string') return 'sin acceso';
  const unidad: Record<string, [string, string]> = {
    consultar_tareas: ['tarea', 'tareas'],
    consultar_documentos: ['documento', 'documentos'],
    consultar_automatizaciones: ['regla', 'reglas'],
    consultar_sprints: ['sprint', 'sprints'],
  };
  const lista = Object.values(resultado).find(Array.isArray) as unknown[] | undefined;
  const nombres = unidad[nombre];
  if (lista && nombres) {
    return `${lista.length} ${lista.length === 1 ? nombres[0] : nombres[1]}`;
  }
  if (nombre === 'consultar_documento' && resultado.recortado) return 'leído en parte';
  return 'hecho';
}

const PROPUESTAS: Record<string, string> = {
  proponer_tarea: 'Crear tarea',
  proponer_asignacion: 'Asignar',
  proponer_edicion: 'Editar tarea',
  proponer_movimiento: 'Mover tarea',
  proponer_checklist: 'Checklist',
  proponer_comentario: 'Comentario',
  proponer_mensaje: 'Mensaje al chat',
  proponer_mensaje_privado: 'Mensaje privado',
  proponer_marcar_pasos: 'Marcar pasos',
  proponer_borrado: 'Borrar',
  proponer_sprint: 'Crear sprint',
  proponer_iniciar_sprint: 'Iniciar sprint',
  proponer_planificacion: 'Planificar sprint',
  proponer_documento: 'Crear documento',
  proponer_revision_documento: 'Revisar documento',
  proponer_automatizacion: 'Crear regla',
  proponer_estado_automatizacion: 'Pausar o activar regla',
  proponer_tablero: 'Crear tablero',
  proponer_pregunta: 'Preguntarte',
  proponer_abrir_proyecto: 'Abrir proyecto',
  proponer_plantilla: 'Montar proyecto',
};

/** «Crear tarea · Revisar login»: la propuesta preparada, en una línea. */
export function pasoDePropuesta(tool: string, args: Record<string, unknown>): PasoDePensamiento {
  const titulo = [args.titulo, args.title, args.nombre, args.name].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return paso(
    'propuesta',
    `Propuesta: ${PROPUESTAS[tool] ?? 'acción'}`,
    titulo ? titulo.slice(0, 60) : undefined,
  );
}
