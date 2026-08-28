const fs = require('fs');
const path = 'apps/frontend/commons/molecules/GlobalRoleBadges/GlobalRoleBadges.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/import \{ Badge, type BadgeVariant \} from '\.\.\/\.\.\/atoms\/Badge';\n/, '');
code = code.replace(/\/\*\*\n \* Cualquier nivel de administración destaca[\s\S]*?function badgeVariant[\s\S]*?\}\n/, '');

fs.writeFileSync(path, code);
