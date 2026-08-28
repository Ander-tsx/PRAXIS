const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldArrowAndDropdown = `      <div className={\`grid transition-all duration-200 ease-in-out \${abierto ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0'}\`}>
        <div className="overflow-hidden">
          <div className="flex flex-col rounded-lg border border-white/5 bg-black/20 py-1">`;

const newArrowAndDropdown = `      <div className={\`grid transition-all duration-200 ease-in-out \${abierto ? 'grid-rows-[1fr] opacity-100 mt-1.5' : 'grid-rows-[0fr] opacity-0'}\`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-[#0F0F0F] p-1.5 shadow-xl">`;
code = code.replace(oldArrowAndDropdown, newArrowAndDropdown);

const oldOpcionDeOrg = `className={\`flex items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors \${
        activa ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }\`}`;
const newOpcionDeOrg = `className={\`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors \${
        activa ? 'bg-white/10 text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }\`}`;
code = code.replace(oldOpcionDeOrg, newOpcionDeOrg);

fs.writeFileSync(path, code);
