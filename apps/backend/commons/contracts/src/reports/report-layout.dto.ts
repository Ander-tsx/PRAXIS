import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';

import { REPORT_CROSS_DIMENSIONS, type ReportCrossDimension } from './report-bundle.dto';
import {
  MAX_REPORT_WIDGETS,
  REPORT_GRID_COLS,
  ReportChartShape,
  type ReportChartSpec,
  ReportMetric,
  ReportWidgetKind,
  validarGrafico,
} from './report-widget';

/**
 * La parametrización de un gráfico a medida, validada.
 *
 * Los cuatro campos sueltos los comprueba `class-validator`; lo que **ninguna
 * anotación puede comprobar** es la relación entre ellos —que una serie temporal
 * no se pida como dona, que una foto del momento no lleve rango— y eso lo hace
 * `@GraficoCoherente`, que llama a `validarGrafico`.
 */
export class ReportChartSpecDto implements ReportChartSpec {
  @ApiProperty({ enum: ReportChartShape })
  @IsEnum(ReportChartShape)
  forma: ReportChartShape;

  @ApiProperty({ enum: ReportMetric })
  @IsEnum(ReportMetric)
  metrica: ReportMetric;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  dias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soloVencidas?: boolean;

  @ApiPropertyOptional({ minimum: 2, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  topN?: number;

  /**
   * Las dos dimensiones del cruce.
   *
   * 🔴 **Tienen que estar declaradas aquí aunque `validarGrafico` ya las
   * compruebe.** El gateway valida con `forbidNonWhitelisted`: un campo que el
   * DTO no declare no se ignora, responde **400**. Sin estas dos líneas,
   * guardar un cruce en el lienzo fallaría con «property agruparPor should not
   * exist» y el gráfico volvería atrás solo. Es la misma trampa que ya mordió
   * con `days` en las rutas de filtros.
   */
  @ApiPropertyOptional({ enum: REPORT_CROSS_DIMENSIONS })
  @IsOptional()
  @IsIn(REPORT_CROSS_DIMENSIONS as unknown as string[])
  agruparPor?: ReportCrossDimension;

  @ApiPropertyOptional({ enum: REPORT_CROSS_DIMENSIONS })
  @IsOptional()
  @IsIn(REPORT_CROSS_DIMENSIONS as unknown as string[])
  partirPor?: ReportCrossDimension;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  titulo: string;
}

/**
 * Que la combinación tenga sentido, no solo que cada campo sea de su tipo.
 *
 * Se declara como decorador y no como una comprobación suelta en el servicio
 * porque hay **dos** entradas a este objeto —la pantalla al guardar el lienzo y
 * el asistente al proponer un gráfico— y una comprobación que vive en una de
 * las dos es una comprobación que la otra se salta.
 */
function GraficoCoherente(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'graficoCoherente',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          return validarGrafico(value as ReportChartSpec) === null;
        },
        defaultMessage(args: ValidationArguments) {
          return validarGrafico(args.value as ReportChartSpec) ?? 'Gráfico no válido';
        },
      },
    });
  };
}

/**
 * Un widget con su sitio en la cuadrícula.
 *
 * ⚠️ **No se valida que dos widgets no se solapen, y es deliberado.** La
 * cuadrícula compacta y resuelve colisiones en el cliente en cada gesto, así que
 * un solapamiento que llegara aquí se desharía solo al pintarlo. Rechazar el
 * guardado entero por eso convertiría un detalle invisible en un error que la
 * persona no puede arreglar.
 */
export class ReportWidgetDto {
  @ApiProperty({ description: 'Identidad dentro del lienzo' })
  @IsUUID('4')
  id: string;

  @ApiProperty({ enum: ReportWidgetKind })
  @IsEnum(ReportWidgetKind)
  tipo: ReportWidgetKind;

  @ApiProperty({ minimum: 0, maximum: REPORT_GRID_COLS - 1 })
  @IsInt()
  @Min(0)
  @Max(REPORT_GRID_COLS - 1)
  x: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(500)
  y: number;

  @ApiProperty({ minimum: 1, maximum: REPORT_GRID_COLS })
  @IsInt()
  @Min(1)
  @Max(REPORT_GRID_COLS)
  w: number;

  @ApiProperty({ minimum: 1, maximum: 40 })
  @IsInt()
  @Min(1)
  @Max(40)
  h: number;

  @ApiPropertyOptional({
    type: ReportChartSpecDto,
    description: 'Obligatorio si `tipo` es `generado`; sobra en el resto',
  })
  @IsOptional()
  @ValidateNested()
  @GraficoCoherente()
  @Type(() => ReportChartSpecDto)
  grafico?: ReportChartSpecDto;
}

/**
 * El cuerpo de `PUT /projects/:projectId/reports/layout`.
 *
 * Se manda el lienzo **entero**, no un parche. Mover un widget cambia la
 * posición de los que empuja, así que un `PATCH` por widget tendría que
 * reenviar casi todos igualmente y además abriría la puerta a guardar la mitad
 * de un gesto.
 *
 * ⚠️ Va tipado con la clase, no con un `Omit<...>`: un `Omit` en runtime es
 * `Object`, el `ValidationPipe` no encuentra metadatos y la ruta acepta
 * cualquier cosa devolviendo 200 sin guardar lo que dice. Es la trampa que se
 * arrastró en 22 de los 28 endpoints del gateway.
 */
export class SaveReportLayoutBodyDto {
  @ApiProperty({ type: [ReportWidgetDto], maxItems: MAX_REPORT_WIDGETS })
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_WIDGETS, {
    message: `Un lienzo no puede tener más de ${MAX_REPORT_WIDGETS} gráficos`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReportWidgetDto)
  widgets: ReportWidgetDto[];
}

/** Payload al microservicio: el cuerpo más de quién y de qué proyecto es. */
export class SaveReportLayoutDto extends SaveReportLayoutBodyDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;
}

/** Payload de lectura. No hay cuerpo: el lienzo se identifica con estos dos. */
export class GetReportLayoutDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  projectId: string;
}

/**
 * Lo que devuelven las dos rutas.
 *
 * `widgets: []` y `actualizadoEn: null` es la respuesta de quien nunca ha
 * tocado el lienzo, y **no es un 404**: el lienzo vacío es el punto de partida,
 * no la ausencia de algo. Un 404 obligaría a la pantalla a distinguir dos casos
 * que se dibujan igual.
 */
export interface ReportLayoutResponse {
  widgets: ReportWidgetDto[];
  actualizadoEn: string | null;
}
