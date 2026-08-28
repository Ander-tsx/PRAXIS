const fs = require('fs');
const path = 'apps/frontend/commons/molecules/GlobalRoleBadges/GlobalRoleBadges.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldComponent = `export function GlobalRoleBadges({ roles }: GlobalRoleBadgesProps) {
  return (
    <>
      {roles.map((role) => (
        <Badge key={role} variant={badgeVariant(role)}>
          {role.toUpperCase()}
        </Badge>
      ))}
    </>
  );
}`;

const newComponent = `import { colors, alpha } from '../../tokens';

export function GlobalRoleBadges({ roles }: GlobalRoleBadgesProps) {
  return (
    <>
      {roles.map((role) => {
        const color = role === 'User' ? colors.primary : colors.accent;
        return (
          <span 
            key={role} 
            className="inline-flex items-center justify-center font-sans font-bold uppercase tracking-widest text-[10px] rounded-full px-3 py-1"
            style={{
              backgroundColor: alpha(color, 20),
              color: color,
              border: \`1px solid \${alpha(color, 30)}\`
            }}
          >
            {role}
          </span>
        );
      })}
    </>
  );
}`;

code = code.replace(oldComponent, newComponent);
fs.writeFileSync(path, code);
