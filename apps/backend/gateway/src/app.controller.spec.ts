import { Test, type TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * El health check.
 *
 * Esta prueba no vale gran cosa por sí sola —comprueba que una función devuelve
 * lo que devuelve— y por eso importa saber qué **no** cubre: que el controlador
 * esté declarado en `AppModule`. Precisamente no lo estaba, y esta prueba pasaba
 * igual porque monta su propio módulo de test con el controlador dentro.
 *
 * Quien fija que la ruta existe de verdad es `14-roles-globales`, que la llama
 * por HTTP contra el gateway levantado. Las dos hacen falta y ninguna sustituye a
 * la otra.
 */
describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('responde que está vivo', () => {
      expect(appController.health()).toEqual({ status: 'ok' });
    });

    it('y no cuenta nada más', () => {
      /* Es una ruta pública y sin sesión: cualquier campo que se añada aquí es
         inventario gratis. Si esta prueba estorba, la pregunta es por qué se
         está añadiendo el campo, no cómo quitarla. */
      expect(Object.keys(appController.health())).toEqual(['status']);
    });
  });
});
