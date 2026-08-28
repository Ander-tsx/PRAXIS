const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "const nombre = [profile.firstName, profile.lastName].filter(Boolean).join(' ');\n\n    <AppHeader title=\"Tu cuenta\">",
  "const nombre = [profile.firstName, profile.lastName].filter(Boolean).join(' ');\n\n  return (\n    <AppHeader title=\"Tu cuenta\">"
);

const splitToken = "function estadoDeCuenta(status: string): { etiqueta: string; activa: boolean } {";
const [keep, rest] = code.split(splitToken);
const switchBlock = rest.substring(0, rest.indexOf('}') + 1 + rest.substring(rest.indexOf('}') + 1).indexOf('}') + 1);
const finalCode = keep + splitToken + switchBlock + '\n';

fs.writeFileSync(path, finalCode);
