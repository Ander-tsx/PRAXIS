/// <reference types="jest" />

import { Logger } from '@nestjs/common';
import { AdminActionType, AdminTargetType, type RecordAdminActionDto } from '@praxis/contracts';
import { of, throwError } from 'rxjs';
import { AdminActivityRecorder } from './admin-activity.recorder';

/**
 * Lo que se prueba aquí no es que escriba —eso ya se ve contra el stack— sino
 * **qué hace cuando no puede**.
 *
 * En un registro de auditoría, perder una entrada en silencio es el peor
 * resultado posible: el registro sigue pareciendo completo y ya no lo está. Así
 * que la garantía es doble y las dos partes importan: se registra a nivel `error`
 * con el payload íntegro (para poder reconstruir la entrada a mano) y se devuelve
 * `false` (para que quien llama pueda decidir).
 */
describe('AdminActivityRecorder', () => {
  const entrada: RecordAdminActionDto = {
    actorId: '11111111-1111-4111-8111-111111111111',
    actorLabel: 'admin@praxis.dev',
    action: AdminActionType.USER_SUSPENDED,
    targetType: AdminTargetType.USER,
    targetId: '33333333-3333-4333-8333-333333333331',
    targetLabel: 'carlos@praxis.dev',
    reason: 'incumplimiento reiterado',
  };

  function construir(send: jest.Mock) {
    return new AdminActivityRecorder({ send } as never);
  }

  it('anota y confirma cuando el servicio responde', async () => {
    const send = jest.fn().mockReturnValue(of({ id: 'anotada' }));
    const recorder = construir(send);

    await expect(recorder.record(entrada)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith({ cmd: 'admin_activity_record' }, entrada);
  });

  describe('cuando la escritura falla', () => {
    let error: jest.SpyInstance;
    let resultado: boolean;

    beforeEach(async () => {
      error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const send = jest.fn().mockReturnValue(throwError(() => new Error('permissions caído')));
      resultado = await construir(send).record(entrada);
    });

    afterEach(() => error.mockRestore());

    it('no lanza: la acción ya se aplicó y un 500 invitaría a reintentarla', () => {
      expect(resultado).toBe(false);
    });

    it('registra a nivel error, no warn ni debug', () => {
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('deja el payload íntegro en el log, para poder reconstruir la entrada', () => {
      const linea = error.mock.calls[0][0] as string;

      // Los seis campos que hacen falta para volver a escribirla a mano.
      expect(linea).toContain(entrada.actorId);
      expect(linea).toContain(entrada.action);
      expect(linea).toContain(entrada.targetType);
      expect(linea).toContain(entrada.targetId);
      expect(linea).toContain(entrada.targetLabel!);
      expect(linea).toContain(entrada.reason!);

      // Y el motivo del fallo, o no hay por dónde empezar a arreglarlo.
      expect(linea).toContain('permissions caído');
    });

    it('dice que la acción SÍ se aplicó, que es lo que evita el diagnóstico al revés', () => {
      /* Sin esto, quien lea el log puede concluir que la suspensión falló y
         volver a intentarla. */
      expect(error.mock.calls[0][0]).toMatch(/se aplicó/i);
    });
  });
});
