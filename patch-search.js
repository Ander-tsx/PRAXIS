const fs = require('fs');
const path = 'apps/frontend/chat-front/src/components/organisms/ChatSearch/ChatSearch.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /const profile = directorio\[contacto.userId\];/g,
  'const profile = directorio.perfiles.get(contacto.userId);'
);

code = code.replace(
  /<AvatarRow userId=\{contacto.userId\} profile=\{profile\} zonePath=\{zonePath\} \/>/g,
  '<AvatarRow userId={contacto.userId} profile={profile} zonePath={zonePath} name={name} />'
);

code = code.replace(
  /function AvatarRow\(\{ userId, profile, zonePath \}: \{ userId: string, profile: any, zonePath: string \}\) \{/g,
  'function AvatarRow({ userId, profile, zonePath, name }: { userId: string, profile: any, zonePath: string, name: string }) {'
);

code = code.replace(
  /presence=\{presencia\}/g,
  'presence={presencia}\n      label={name}'
);

fs.writeFileSync(path, code);
