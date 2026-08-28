const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/actions.ts';
let code = fs.readFileSync(path, 'utf8');

const oldDescribir = `function describir(error: unknown, porDefecto: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) return porDefecto;
    return error.message;
  }
  return porDefecto;
}`;

const newDescribir = `function describir(error: unknown, porDefecto: string): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) return porDefecto;
    if (error.message.includes('File too large')) return 'El archivo es demasiado grande (máximo 5MB).';
    if (error.message.includes('Validation failed')) return 'Error de validación en los datos.';
    if (error.message.includes('Expected')) return 'El formato del archivo no es válido.';
    return error.message;
  }
  return porDefecto;
}`;

code = code.replace(oldDescribir, newDescribir);
fs.writeFileSync(path, code);
