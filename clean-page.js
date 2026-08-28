const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Delete everything after the estadoDeCuenta function block
const splitToken = `function estadoDeCuenta(status: string): { etiqueta: string; activa: boolean } {`;
const [keep, rest] = code.split(splitToken);
const endOfEstado = rest.indexOf('}');
const afterEstado = rest.indexOf('}', endOfEstado + 1);
const finalCode = keep + splitToken + rest.slice(0, rest.indexOf('}', rest.indexOf('}', rest.indexOf('}') + 1) + 1) + 1) + '\n';
// wait, estadoDeCuenta has a switch statement inside.
