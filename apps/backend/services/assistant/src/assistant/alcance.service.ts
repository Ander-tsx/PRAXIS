import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * «Recursos»: qué proyectos puede consultar PRAX (D5 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Aquí solo se **guarda** la elección. Qué proyectos existen, de qué
 * organización son y si la persona puede verlos lo sabe el gateway, que es
 * quien valida al guardar y quien vuelve a filtrar en cada turno: este servicio
 * no habla con projects-service y no va a empezar a hacerlo por esto.
 */
export interface Alcance {
  modo: 'ALL' | 'SELECTED';
  projectIds: string[];
}

@Injectable()
export class AlcanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sin fila, todo: es lo que PRAX hacía antes de que existiera «Recursos». */
  async leer(userId: string, organizationId: string): Promise<Alcance> {
    const fila = await this.prisma.assistantScope.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return fila
      ? { modo: fila.mode, projectIds: fila.projectIds }
      : { modo: 'ALL', projectIds: [] };
  }

  async guardar(userId: string, organizationId: string, alcance: Alcance): Promise<Alcance> {
    /* Con `ALL` la lista no significa nada, y guardarla haría que al volver a
       «elegir» apareciera marcada una selección vieja que nadie recuerda. */
    const projectIds = alcance.modo === 'SELECTED' ? [...new Set(alcance.projectIds)] : [];
    const fila = await this.prisma.assistantScope.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId, mode: alcance.modo, projectIds },
      update: { mode: alcance.modo, projectIds },
    });
    return { modo: fila.mode, projectIds: fila.projectIds };
  }
}
