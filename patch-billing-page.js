const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/billing/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldLink = `            return (
              <Link
                href={destino}
                className="font-sans text-sm text-text-primary underline decoration-border underline-offset-4 transition-colors hover:decoration-primary"
              >
                {texto}
              </Link>
            );`;

const newLink = `            const btnClass = plan.tier === 'TEAM' 
              ? "w-full text-center bg-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_-5px_rgba(139,92,246,0.4)]"
              : "w-full text-center bg-white/10 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/20 transition-all";
            
            return (
              <Link href={destino} className={btnClass}>
                {texto}
              </Link>
            );`;

code = code.replace(oldLink, newLink);

const oldContacto = `          return (
            <span className="font-sans text-xs text-text-disabled">
              Se acuerda con nosotros. Escríbenos y lo montamos a la medida del equipo.
            </span>
          );`;

const newContacto = `          return (
            <a href="mailto:ventas@praxis.com" className="w-full text-center border border-white/20 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/5 transition-all">
              Contactar ventas
            </a>
          );`;

code = code.replace(oldContacto, newContacto);

// Also remove AppHeader restriction on width by passing anchoCompleto to it too!
// Actually AppHeader takes max-width inside, but our PlanCatalog uses max-w-[1200px]. 
// We should pass anchoCompleto={true} so the billing page expands beautifully.
code = code.replace(/<AppHeader title="Facturación">/g, '<AppHeader title="Facturación" anchoCompleto={true}>');

fs.writeFileSync(path, code);
