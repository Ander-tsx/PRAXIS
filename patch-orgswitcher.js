const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldCuadro = `  const cuadro = (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-display text-sm"
      style={{ background: colors.primary, color: colors.primaryForeground }}
      aria-hidden="true"
    >
      {inicial}
    </span>
  );`;

const newCuadro = `  const cuadro = (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 font-sans text-[13px] font-semibold text-white"
      aria-hidden="true"
    >
      {inicial}
    </span>
  );`;

code = code.replace(oldCuadro, newCuadro);

const oldArrowAndDropdown = `        {puedeAbrir && (
          <svg
            className="h-4 w-4 shrink-0 text-text-disabled"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          </svg>
        )}
      </button>

      {abierto && (
        <div className="mt-1 flex flex-col overflow-hidden rounded-lg border border-white/5 bg-transparent py-1">
          <OpcionDeOrg
            activa={activaId === null}
            etiqueta="Todas tus organizaciones"
            detalle={\`\${lista.length} en total\`}
            onClick={() => elegir(null)}
          />
          {lista.map((org) => (
            <OpcionDeOrg
              key={org.id}
              activa={org.id === activaId}
              etiqueta={org.name ?? 'Sin nombre'}
              detalle={org.kind === 'PERSONAL' ? 'Tu espacio' : 'Equipo'}
              onClick={() => elegir(org.id)}
            />
          ))}
        </div>
      )}`;

const newArrowAndDropdown = `        {puedeAbrir && (
          <svg
            className={\`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 \${abierto ? '-rotate-180' : ''}\`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      <div className={\`grid transition-all duration-200 ease-in-out \${abierto ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'}\`}>
        <div className="overflow-hidden">
          <div className="flex flex-col rounded-lg border border-white/5 bg-black/20 py-1">
            <OpcionDeOrg
              activa={activaId === null}
              etiqueta="Todas tus organizaciones"
              detalle={\`\${lista.length} en total\`}
              onClick={() => elegir(null)}
            />
            {lista.map((org) => (
              <OpcionDeOrg
                key={org.id}
                activa={org.id === activaId}
                etiqueta={org.name ?? 'Sin nombre'}
                detalle={org.kind === 'PERSONAL' ? 'Tu espacio' : 'Equipo'}
                onClick={() => elegir(org.id)}
              />
            ))}
          </div>
        </div>
      </div>`;

code = code.replace(oldArrowAndDropdown, newArrowAndDropdown);

// Replace hover logic on OpcionDeOrg to match
const oldOpcionDeOrg = `className={\`flex items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors \${
        activa ? 'bg-primary-muted text-primary' : 'text-text-primary hover:bg-white/5'
      }\`}`;

const newOpcionDeOrg = `className={\`flex items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors \${
        activa ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }\`}`;

code = code.replace(oldOpcionDeOrg, newOpcionDeOrg);

fs.writeFileSync(path, code);
