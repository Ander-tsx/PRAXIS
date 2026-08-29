const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /function SidebarChatList\(\{ zonePath, plegada \}: \{ zonePath: string; plegada: boolean \}\) \{/g,
  `function SidebarChatList({ zonePath, plegada }: { zonePath: string; plegada: boolean }) {
  const pathname = usePathname();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);`
);

fs.writeFileSync(path, code);
