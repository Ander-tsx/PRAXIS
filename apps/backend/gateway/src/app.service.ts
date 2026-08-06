import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /**
   * Lo mínimo que distingue «vivo» de «no contesta».
   *
   * Devolvía la cadena `'Hello World!'` del andamio de Nest. Un objeto se lee
   * igual de bien desde una sonda y encaja con el sobre `{success,data}` que
   * envuelve todo lo demás, así que quien consuma la API no encuentra aquí la
   * única respuesta con otra forma.
   */
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
