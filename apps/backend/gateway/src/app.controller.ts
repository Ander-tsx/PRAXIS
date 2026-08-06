import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

/**
 * Health check del gateway.
 *
 * ⚠️ **Estaba escrito y no estaba registrado.** El controlador existía, con sus
 * anotaciones de Swagger y su `@ApiTags('Health')`, pero `AppModule` no lo
 * declaraba en `controllers`: la ruta salía en el inventario de endpoints al
 * escanear decoradores y en ejecución devolvía **404**. Nadie lo notó porque
 * `dev:cli` comprueba que el **puerto** acepte conexiones, no que responda algo
 * — y un 404 llega por un puerto que acepta conexiones igual de bien.
 *
 * Se registra en vez de borrarse porque el hueco es real: el día que esto se
 * despliegue, quien orquesta necesita preguntar «¿está vivo?» sin tener token, y
 * mirar si el puerto abre no distingue un proceso sano de uno que arrancó y se
 * cayó por dentro.
 *
 * ⚠️ **Cuelga de `/api`, no de `/`**, por el `setGlobalPrefix('api')` de
 * `main.ts`. El inventario lo listaba como `GET /` y esa ruta no existe.
 *
 * ## Lo que no dice, y por qué
 *
 * Ni versión, ni entorno, ni qué módulos hay montados, ni si la base responde.
 * Es una ruta **pública y sin sesión**: todo lo que cuente aquí es inventario
 * gratis para cualquiera que la llame. Lo que hace falta saber desde fuera es si
 * el proceso atiende peticiones, y eso es exactamente un 200.
 *
 * Una comprobación de verdad —que Postgres y Redis contesten— sería otra ruta,
 * y tendría que estar cerrada: un health check que consulta dependencias es
 * también una forma de hacer que el servidor trabaje sin autenticarse.
 */
@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check del gateway: responde si el proceso atiende' })
  @ApiResponse({ status: 200, description: 'El gateway está vivo' })
  health() {
    return this.appService.health();
  }
}
