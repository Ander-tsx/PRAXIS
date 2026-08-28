const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/Billing/PlanCatalog.tsx';
let code = fs.readFileSync(path, 'utf8');

// Remove 'use client';
code = code.replace(/'use client';\n/, '');
code = code.replace(/import \{ useState \} from 'react';\n/, '');

// We need to extract the interactive compare table to a separate component in the same file or a new file.
// Wait, a file can't have both Server and Client components if it has 'use client' at the top.
// So we must create a new file: CompareTable.tsx
// I will just replace the comparison section in PlanCatalog with <CompareTable planes={planes} />
const compareSectionOld = `{/* Sección Comparativa */}
      <div className="mt-20">
        <div className="flex justify-center mb-8">
          <button 
            onClick={() => setShowCompare(!showCompare)}
            className="flex items-center gap-2 text-sm font-semibold text-white/50 hover:text-white transition-colors"
          >
            {showCompare ? 'Ocultar comparación detallada' : 'Comparar características al detalle'}
            <svg className={\`w-4 h-4 transition-transform \${showCompare ? 'rotate-180' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showCompare && (
          <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0F0F0F] shadow-2xl">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-6 px-8 text-sm font-bold text-white/40 uppercase tracking-widest w-1/3">Características</th>
                  {planes.map(p => (
                    <th key={p.tier} className="py-6 px-8 text-sm font-bold text-white uppercase tracking-widest text-center">
                      {p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { label: 'Asientos', key: 'asientos', format: tope },
                  { label: 'Proyectos', key: 'proyectos', format: tope },
                  { label: 'Consultas PRAX (IA)', key: 'iaMensualPorPersona', format: tope },
                  { label: 'Almacenamiento total', key: 'almacenamientoOrgMb', format: almacenamiento },
                ].map((feature, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-5 px-8 text-sm text-white/70 font-medium">{feature.label}</td>
                    {planes.map(p => (
                      <td key={p.tier} className="py-5 px-8 text-sm text-white/50 text-center font-mono">
                        {feature.format(p.quotas[feature.key as keyof typeof p.quotas])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>`;

const compareSectionNew = `<CompareTable planes={planes} />`;
code = code.replace(compareSectionOld, compareSectionNew);

// Also remove `const [showCompare, setShowCompare] = useState(false);`
code = code.replace(/  const \[showCompare, setShowCompare\] = useState\(false\);\n/, '');

// Add import CompareTable
code = `import { CompareTable } from './CompareTable';\n` + code;

// Also we need to export tope and almacenamiento so CompareTable can use them
code = code.replace(/function tope/, 'export function tope');
code = code.replace(/function almacenamiento/, 'export function almacenamiento');

fs.writeFileSync(path, code);
