import {
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';
import { PROJECT_PERMISSIONS } from './project-permission.enum';

/**
 * Valida el mapa de permisos de un rol de proyecto.
 *
 * Existe porque un **array** se aceptaba y producía un rol vacío en silencio:
 * el evaluador hace `permisos[clave]`, que sobre un array es `undefined`. El
 * rol se creaba con 201, aparecía en la lista con sus permisos y no concedía
 * nada — sin error en ningún punto de la cadena.
 *
 * Exige, por tanto:
 *  - un objeto plano, **nunca** un array;
 *  - claves del enum `ProjectPermission`;
 *  - valores booleanos.
 */
export function IsPermissionMap(options?: ValidationOptions) {
    return (object: object, propertyName: string) => {
        registerDecorator({
            name: 'isPermissionMap',
            target: object.constructor,
            propertyName,
            options,
            validator: {
                validate(value: unknown) {
                    return describeProblem(value) === null;
                },
                defaultMessage(args: ValidationArguments) {
                    return describeProblem(args.value) ?? 'permissions no es válido';
                },
            },
        });
    };
}

function describeProblem(value: unknown): string | null {
    if (Array.isArray(value)) {
        return (
            'permissions debe ser un objeto de booleanos, no un array. ' +
            'Ejemplo: {"canEditBoard": true}'
        );
    }

    if (value === null || typeof value !== 'object') {
        return 'permissions debe ser un objeto de booleanos';
    }

    const entries = Object.entries(value as Record<string, unknown>);

    const desconocidas = entries
        .map(([key]) => key)
        .filter((key) => !PROJECT_PERMISSIONS.includes(key));

    if (desconocidas.length > 0) {
        return (
            `permisos desconocidos: ${desconocidas.join(', ')}. ` +
            `Válidos: ${PROJECT_PERMISSIONS.join(', ')}`
        );
    }

    const noBooleanas = entries
        .filter(([, val]) => typeof val !== 'boolean')
        .map(([key]) => key);

    if (noBooleanas.length > 0) {
        return `estos permisos deben ser booleanos: ${noBooleanas.join(', ')}`;
    }

    return null;
}
