const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/organizations/[organizationId]/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// The Bloque function draws dotted borders in the lists? 
// The lists in historial:
code = code.replace(
  `className="flex items-baseline justify-between gap-4 border-b border-dotted border-border py-3 last:border-b-0"`,
  `className="flex items-baseline justify-between gap-4 border-b border-white/5 py-4 last:border-b-0 hover:bg-white/[0.02] transition-colors -mx-4 px-4 rounded-xl"`
);

// We replace `border-border` with `border-white/10` in Bloque
code = code.replace(
  `className="flex flex-col gap-5 border-t border-border py-9 first:border-t-0 first:pt-0"`,
  `className="flex flex-col gap-5 border-t border-white/10 py-10 first:border-t-0 first:pt-0"`
);

// Modernize `EnlaceDeTexto` to look like a clean minimal button instead of underline
const oldEnlace = `const clase =
    'font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary';`;
const newEnlace = `const clase =
    'inline-flex items-center justify-center border border-white/20 bg-transparent text-white font-bold py-2 px-4 rounded-full hover:bg-white/5 transition-colors text-sm';`;
code = code.replace(oldEnlace, newEnlace);

// Modernize the `<Vacio>` component
code = code.replace(
  `className="max-w-xl border-l-2 border-border py-1 pl-4 font-sans text-sm text-text-secondary"`,
  `className="max-w-xl bg-[#080807] border border-white/10 p-5 rounded-2xl font-sans text-sm text-white/50"`
);

fs.writeFileSync(path, code);
