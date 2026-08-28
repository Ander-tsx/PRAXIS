const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/PresencePicker/PresencePicker.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldButton = `            className="flex min-w-0 cursor-pointer items-start gap-3 rounded-sm border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              /* El color del estado tiñe la opción elegida: es lo mismo que
                 distingue su punto, así que no hay que aprenderse un segundo
                 código. Las demás quedan en el borde de siempre. */
              borderColor: puesta ? descripcion.color : colors.border,
              background: puesta ? alpha(descripcion.color, 12) : 'transparent',
            }}`;

const newButton = `            className={\`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none \${puesta ? 'shadow-lg border-transparent' : 'border-white/10 hover:border-white/20'}\`}
            style={{
              background: puesta ? alpha(descripcion.color, 15) : 'rgba(255, 255, 255, 0.02)',
              boxShadow: puesta ? \`0 0 0 1px \${descripcion.color}\` : 'none',
            }}`;

code = code.replace(oldButton, newButton);
fs.writeFileSync(path, code);
