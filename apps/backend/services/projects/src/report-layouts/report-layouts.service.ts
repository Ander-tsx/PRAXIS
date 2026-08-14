import { Injectable } from '@nestjs/common';
import type {
  GetReportLayoutDto,
  ReportLayoutResponse,
  ReportWidgetDto,
  SaveReportLayoutDto,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * El lienzo de Análisis de una persona en un proyecto.
 *
 * ## Por qué vive aquí y no en `reports-service`
 *
 * Porque `reports-service` **no tiene base de datos, y eso es una decisión, no
 * una carencia** (§25.6): no guarda nada, lee de tasks y projects, hace la
 * matemática y responde. Darle Prisma para una sola tabla de preferencias le
 * añadiría una migración, un `DATABASE_URL` y un esquema propio a un servicio
 * cuya identidad entera es no tener ninguno.
 *
 * Y `projects-service` ya es el sitio natural: es dueño del proyecto y ya guarda
 * estado por persona dentro de un proyecto —`ChatChannelState`, las membresías—.
 * El coste, dicho en voz alta: las rutas de `/projects/:id/reports/*` dejan de
 * ir todas al mismo microservicio. `layout` va a projects y sus hermanas a
 * reports, y quien lea el módulo del gateway tiene que verlo escrito.
 */
@Injectable()
export class ReportLayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El lienzo, o el vacío.
   *
   * **Sin fila no es un 404.** Quien nunca ha tocado la pantalla no tiene un
   * lienzo «que falta»: tiene uno vacío, que es el punto de partida elegido. Un
   * 404 obligaría a la pantalla a distinguir dos casos que se dibujan igual, y
   * es el tipo de detalle que acaba en un error rojo donde iba una invitación.
   */
  async get(dto: GetReportLayoutDto): Promise<ReportLayoutResponse> {
    const fila = await this.prisma.reportLayout.findUnique({
      where: { userId_projectId: { userId: dto.userId, projectId: dto.projectId } },
      select: { widgets: true, updatedAt: true },
    });

    if (!fila) return { widgets: [], actualizadoEn: null };

    return {
      widgets: (fila.widgets ?? []) as unknown as ReportWidgetDto[],
      actualizadoEn: fila.updatedAt.toISOString(),
    };
  }

  /**
   * Guarda el lienzo entero.
   *
   * `upsert` y no `update`: la primera vez que alguien coloca un gráfico no hay
   * fila, y obligar a crearla aparte convertiría el primer guardado en un caso
   * especial que se olvida.
   *
   * ⚠️ **Sin control de concurrencia, y a propósito.** El lienzo es de una sola
   * persona; las dos pestañas que podrían pisarse son las suyas y la última que
   * mueve es la que quiere. Esta es justamente la complicación que se evitó al
   * elegir el lienzo por persona en vez de por proyecto: ahí sí habría hecho
   * falta, porque el que pierde el guardado sería otro.
   */
  async save(dto: SaveReportLayoutDto): Promise<ReportLayoutResponse> {
    /* `unknown` de paso: `widgets` es `Json` en Prisma y el tipo del contrato es
       el que manda sobre su forma. La validación ya la hizo el DTO del gateway. */
    const widgets = dto.widgets as unknown as object[];

    const fila = await this.prisma.reportLayout.upsert({
      where: { userId_projectId: { userId: dto.userId, projectId: dto.projectId } },
      create: { userId: dto.userId, projectId: dto.projectId, widgets },
      update: { widgets },
      select: { widgets: true, updatedAt: true },
    });

    return {
      widgets: (fila.widgets ?? []) as unknown as ReportWidgetDto[],
      actualizadoEn: fila.updatedAt.toISOString(),
    };
  }
}
