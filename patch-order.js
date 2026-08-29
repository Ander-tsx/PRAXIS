const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

// Remove pathname and browserPath from where they are
code = code.replace(/  const pathname = usePathname\(\);\n  const browserPath = zonePath \+ \(pathname === '\/' \? '' : pathname\);\n/g, '');

// Re-insert them right after function ArmazonInterno definition
code = code.replace(/function ArmazonInterno\(\{[\s\S]*?\}\: AppShellProps\) \{/, (match) => {
  return match + "\n  const pathname = usePathname();\n  const browserPath = zonePath + (pathname === '/' ? '' : pathname);\n";
});

fs.writeFileSync(path, code);
