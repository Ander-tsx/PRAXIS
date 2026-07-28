import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check de la aplicación' })
  @ApiResponse({ status: 200, description: 'Estado del servidor Ok' })
  getHello(): string {
    return this.appService.getHello();
  }
}
