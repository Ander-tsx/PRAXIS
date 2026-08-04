import { RpcException } from '@nestjs/microservices';
import { PROJECT_SUSPENDED_CODE } from '@praxis/contracts';

/** Lo mínimo que hace falta de Prisma. Así esto se puede probar sin el cliente. */
interface LectorDeProyectos {
  project: {
    findUnique(args: {
      where: { id: string };
      select: { status: true; suspendedReason: true };
    }): Promise<{ status: string; suspendedReason: string | null } | null>;
  };
}

/**
 * Rechaza la operación si el proyecto no está activo.
 *
 * ## Por qué esto vive en el servicio y no en el gateway
 *
 * La regla general del repo es que **la autorización se comprueba en el gateway**,
 * y sigue siendo cierta. Esto no es autorización: es el estado del propio
 * proyecto, y aquí se aplica a las tres escrituras que **no pasan por
 * `ProjectPermissionGuard`** porque no declaran ningún permiso —aceptar una
 * invitación, rechazarla y salirse del proyecto—.
 *
 * Ponerlo en el gateway habría exigido resolver el proyecto desde el id de la
 * invitación con un salto de red extra y una copia de la resolución que ya vive
 * aquí. Y siendo comandos internos, este sitio no se puede saltar por otra ruta.
 *
 * ## Las tres se bloquean, incluidas rechazar y salir
 *
 * Suspendido significa que el proyecto no cambia, y las tres lo cambian: una
 * añade un miembro y las otras dos escriben en sus tablas. Rechazar y salir son
 * discutibles —su efecto le importa sobre todo a quien las hace, no al proyecto—
 * y abrirlas sería quitar dos líneas de aquí. Se cierran porque la suspensión se
 * definió como «todas las acciones bloqueadas», y porque una invitación que se
 * puede rechazar pero no aceptar es un estado raro de explicar.
 *
 * El mensaje dice el motivo. Es lo que evita que parezca un fallo.
 */
export async function exigirProyectoActivo(
  prisma: LectorDeProyectos,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, suspendedReason: true },
  });

  if (!project) {
    throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
  }

  /* Archivado: no existe para nadie salvo para el panel. Un 403 diría «existe y
     no es tuyo», que además filtra que existe. */
  if (project.status === 'DELETED') {
    throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
  }

  if (project.status === 'SUSPENDED') {
    throw new RpcException({
      statusCode: 403,
      code: PROJECT_SUSPENDED_CODE,
      message: project.suspendedReason
        ? `Este proyecto está suspendido por la administración: ${project.suspendedReason}`
        : 'Este proyecto está suspendido por la administración y solo se puede consultar.',
    });
  }
}
