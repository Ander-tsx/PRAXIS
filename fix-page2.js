const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const splitToken = "function estadoDeCuenta(status: string): { etiqueta: string; activa: boolean } {";
const [keep] = code.split(splitToken);

const cleanEnd = `function estadoDeCuenta(status: string): { etiqueta: string; activa: boolean } {
  switch (status) {
    case 'ACTIVE':
      return { etiqueta: 'Activa', activa: true };
    case 'INACTIVE':
      return { etiqueta: 'Inactiva', activa: false };
    case 'SUSPENDED':
      return { etiqueta: 'Suspendida', activa: false };
    default:
      return { etiqueta: status, activa: false };
  }
}
`;

fs.writeFileSync(path, keep + cleanEnd);
