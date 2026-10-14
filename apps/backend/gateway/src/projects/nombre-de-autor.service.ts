import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

/** Cuánto se recuerda un nombre. Cambiarlo de nombre y verlo igual una hora es aceptable. */
const CADUCIDAD_MS = 60 * 60 * 1000;

/**
 * El nombre de quien escribe un mensaje, para el push (`docs/PLAN-PUSH.md`).
 *
 * projects-service solo conoce el `authorId`: los usuarios viven en
 * credentials-service y los dos no se hablan a propósito. El gateway sí cruza
 * ambos, así que pone el nombre en el mensaje que manda al chat. Nunca lanza ni
 * se queda esperando: sin nombre el push dice «Alguien», que es peor, pero no
 * retrasa un mensaje por cosmética.
 */
@Injectable()
export class NombreDeAutorService {
  private readonly recuerdos = new Map<string, { nombre: string; hasta: number }>();

  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentials: ClientProxy) {}

  async de(userId: string): Promise<string | null> {
    const guardado = this.recuerdos.get(userId);
    if (guardado && guardado.hasta > Date.now()) return guardado.nombre;
    try {
      const perfil = await firstValueFrom(
        this.credentials
          .send<{ firstName?: string | null; lastName?: string | null } | null>(
            { cmd: 'user_find_one' },
            { id: userId },
          )
          .pipe(timeout(1000)),
      );
      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      if (!nombre) return null;
      this.recuerdos.set(userId, { nombre, hasta: Date.now() + CADUCIDAD_MS });
      return nombre;
    } catch {
      return null;
    }
  }
}
