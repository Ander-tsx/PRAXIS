import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resuelve **en qué canal** se está hablando, y quién tiene derecho a estar ahí.
 *
 * Se separa de `ChatService` porque son dos preguntas distintas: esto responde
 * «cuál es el canal y puedes entrar»; aquello, «qué se ha dicho en él». Mezclarlas
 * fue lo que hizo que la primera versión atara los mensajes al proyecto.
 */
@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El canal del chat de un proyecto. Se crea la primera vez que hace falta.
   *
   * ⚠️ **Aquí no se comprueba ningún permiso**, y no es un descuido: quién entra
   * al chat de un proyecto lo decide `ProjectPermissionGuard` en el gateway, que
   * es quien conoce el token. Repetirlo aquí sería una segunda verdad que puede
   * desviarse de la primera.
   *
   * El `upsert` va contra `projectId`, que es único: dos peticiones simultáneas
   * no pueden crear dos canales para el mismo proyecto.
   */
  async deProyecto(projectId: string): Promise<{ id: string }> {
    const proyecto = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!proyecto) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });

    return this.prisma.chatChannel.upsert({
      where: { projectId },
      create: { kind: 'PROJECT', projectId },
      update: {},
      select: { id: true },
    });
  }

  /**
   * El canal privado entre dos personas.
   *
   * ⚠️ **Los ids se ordenan antes de tocar nada.** Sin eso, que Ana escriba a
   * Juan y Juan escriba a Ana crearía dos conversaciones distintas y cada uno
   * vería la mitad de lo hablado. El índice único del par es lo que lo garantiza,
   * pero solo funciona si siempre se guarda en el mismo orden.
   *
   * ⚠️ **Solo se puede abrir con quien comparta algún proyecto contigo.** Sin
   * esa comprobación, el chat privado sería un directorio de mensajería abierto
   * a toda la plataforma: cualquiera con un `userId` podría escribir a cualquiera.
   */
  async directo(unUsuario: string, otroUsuario: string): Promise<{ id: string }> {
    if (unUsuario === otroUsuario) {
      throw new RpcException({ statusCode: 400, message: 'No puedes escribirte a ti mismo.' });
    }

    if (!(await this.compartenProyecto(unUsuario, otroUsuario))) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes escribir a quien comparta algún proyecto contigo.',
      });
    }

    const [directUserA, directUserB] = [unUsuario, otroUsuario].sort();

    return this.prisma.chatChannel.upsert({
      where: { directUserA_directUserB: { directUserA, directUserB } },
      create: { kind: 'DIRECT', directUserA, directUserB },
      update: {},
      select: { id: true },
    });
  }

  /**
   * ¿Comparten estas dos personas algún proyecto?
   *
   * Cuenta la membresía, **no la propiedad**: el dueño de un proyecto entra
   * siempre en `project_members` al crearlo (lo garantiza `ProjectsService`), así
   * que mirar `ownerId` aparte sería comprobar dos veces lo mismo.
   *
   * Un proyecto `DELETED` no cuenta: para todo el mundo es como si no existiera.
   */
  async compartenProyecto(unUsuario: string, otroUsuario: string): Promise<boolean> {
    const coincidencia = await this.prisma.projectMember.findFirst({
      where: {
        userId: unUsuario,
        project: {
          status: { not: 'DELETED' },
          members: { some: { userId: otroUsuario } },
        },
      },
      select: { id: true },
    });

    return coincidencia !== null;
  }

  /**
   * Comprueba que alguien puede estar en un canal, y devuelve cuál es.
   *
   * Lo usan las operaciones que llegan con un `channelId` ya resuelto —reaccionar,
   * borrar— donde no hay proyecto en la ruta contra el que el guard pueda
   * comprobar nada.
   *
   * - **DIRECT**: participas si eres uno de los dos. Es estructural.
   * - **PROJECT**: se mira la membresía del proyecto. Es el mínimo —ver el
   *   proyecto—; los permisos más finos los aplica el gateway antes de llegar aquí.
   */
  async exigirAcceso(channelId: string, userId: string) {
    const canal = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { id: true, kind: true, projectId: true, directUserA: true, directUserB: true },
    });
    if (!canal) throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });

    if (canal.kind === 'DIRECT') {
      if (canal.directUserA !== userId && canal.directUserB !== userId) {
        throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
      }
      return canal;
    }

    const miembro = await this.prisma.projectMember.findFirst({
      where: { projectId: canal.projectId as string, userId },
      select: { id: true },
    });
    if (!miembro) {
      /* 404 y no 403: confirmar que el canal existe ya diría que ese proyecto
         existe, que es justo lo que no debe filtrarse. */
      throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
    }

    return canal;
  }

  /**
   * Qué se puede mencionar y referenciar desde un canal.
   *
   * ## Esto es el control de verdad, y no una validación al enviar
   *
   * ⚠️ La primera intención fue revalidar cada referencia al recibir un mensaje.
   * **No protege de nada**: el nombre de la etiqueta lo escribe quien envía, no
   * el servidor, así que fabricar una a mano no le enseña a nadie nada que no
   * supiera ya — solo escribe un texto que él mismo eligió. Y al pulsarla, quien
   * la recibe pasa por los permisos de siempre.
   *
   * Lo que sí importa es **qué se puede descubrir**, y eso es exactamente esta
   * lista: solo sale lo que quien pregunta ya puede ver.
   *
   * ⚠️ Por eso mismo, el día que una mención genere un aviso habrá que validarla
   * al enviar: entonces sí serviría para hacer sonar el teléfono de cualquiera.
   * Hoy no lo genera.
   *
   * Las tareas **no salen de aquí**: viven en tasks-service. Las añade el
   * gateway, que ya habla con los dos.
   */
  async mencionables(channelId: string, userId: string) {
    const canal = await this.exigirAcceso(channelId, userId);

    /* El alcance: en un canal de proyecto, ese proyecto; en uno privado, los que
       compartís. Nunca «todos los tuyos»: en un privado con Juan no tiene
       sentido ofrecerle un tablero que él no puede abrir. */
    const projectIds =
      canal.kind === 'PROJECT'
        ? [canal.projectId as string]
        : await this.proyectosEnComun(canal.directUserA as string, canal.directUserB as string);

    if (projectIds.length === 0) return { people: [], tableros: [] };

    const [proyectos, miembros] = await Promise.all([
      this.prisma.project.findMany({
        where: { id: { in: projectIds }, status: { not: 'DELETED' } },
        select: {
          id: true,
          name: true,
          slug: true,
          workspaces: {
            select: { id: true, name: true, boards: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    /**
     * ⚠️ **Solo se devuelven tableros, y no para ofrecerlos: para que el gateway
     * sepa de dónde pedir las tareas.**
     *
     * La primera versión ofrecía también proyectos, espacios y tableros. Era
     * ruido: en un desplegable de siete huecos, tres los ocupaban cosas que
     * nadie nombra en una frase, y empujaban fuera a las tareas —que es lo único
     * de lo que se habla de verdad en un chat de trabajo—.
     */
    const tableros: { id: string; nombre: string; proyecto: string; slug: string }[] = [];
    for (const proyecto of proyectos) {
      for (const espacio of proyecto.workspaces) {
        for (const tablero of espacio.boards) {
          tableros.push({
            id: tablero.id,
            nombre: tablero.name,
            proyecto: proyecto.name,
            slug: proyecto.slug,
          });
        }
      }
    }

    return {
      /**
       * ⚠️ **En privado no se menciona a nadie.** Sois dos: escribir `@Juan`
       * cuando le estás escribiendo a Juan no aporta nada, y el desplegable
       * saltando con cada correo que se teclea sí molesta.
       */
      people: canal.kind === 'PROJECT' ? miembros.map((miembro) => miembro.userId) : [],
      tableros,
    };
  }

  /** Los proyectos vivos en los que están las dos personas. */
  private async proyectosEnComun(unUsuario: string, otroUsuario: string): Promise<string[]> {
    const filas = await this.prisma.projectMember.findMany({
      where: {
        userId: unUsuario,
        project: { status: { not: 'DELETED' }, members: { some: { userId: otroUsuario } } },
      },
      select: { projectId: true },
    });
    return filas.map((fila) => fila.projectId);
  }

  /**
   * A quién puede escribir esta persona: todo el que comparta proyecto con ella.
   *
   * Devuelve, por cada contacto, **en qué proyectos coincidís y con qué rol está
   * allí**. Es lo que convierte una lista de nombres sueltos en algo que se
   * entiende: «Juan, Administrador en Rediseño» dice mucho más que «Juan».
   *
   * Se resuelve con dos consultas y un cruce en memoria, no con una por persona:
   * el coste va con el tamaño de tus proyectos, no con el de la plataforma.
   */
  async contactos(userId: string) {
    const mios = await this.prisma.projectMember.findMany({
      where: { userId, project: { status: { not: 'DELETED' } } },
      select: { projectId: true },
    });
    const projectIds = mios.map((fila) => fila.projectId);
    if (projectIds.length === 0) return [];

    const companeros = await this.prisma.projectMember.findMany({
      where: { projectId: { in: projectIds }, userId: { not: userId } },
      select: {
        userId: true,
        projectId: true,
        project: { select: { id: true, name: true, slug: true } },
        projectRole: { select: { id: true, name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const porPersona = new Map<
      string,
      { userId: string; proyectos: { id: string; name: string; slug: string; rol: string }[] }
    >();

    for (const fila of companeros) {
      const entrada = porPersona.get(fila.userId) ?? { userId: fila.userId, proyectos: [] };
      entrada.proyectos.push({
        id: fila.project.id,
        name: fila.project.name,
        slug: fila.project.slug,
        rol: fila.projectRole.name,
      });
      porPersona.set(fila.userId, entrada);
    }

    return [...porPersona.values()];
  }
}
