const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppHeader.tsx';
let code = fs.readFileSync(path, 'utf8');

// add anchoCompleto prop
const propsToken = `export interface AppHeaderProps {`;
code = code.replace(propsToken, propsToken + `\n  anchoCompleto?: boolean;`);

const fnToken = `export function AppHeader({ title, headerSlot, lleno = false, children }: AppHeaderProps) {`;
code = code.replace(fnToken, `export function AppHeader({ title, headerSlot, lleno = false, anchoCompleto = false, children }: AppHeaderProps) {`);

const innerDivToken = `className={\`mx-auto w-full p-4 sm:p-6 \${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'} \${`;
const newInnerDivToken = `className={\`mx-auto w-full \${anchoCompleto ? 'p-0 max-w-full' : \`p-4 sm:p-6 \${plegada ? 'max-w-[1584px]' : 'max-w-[1400px]'}\`} \${`;
code = code.replace(innerDivToken, newInnerDivToken);

fs.writeFileSync(path, code);
