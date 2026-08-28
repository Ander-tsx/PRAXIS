const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldPresence = `<div className="max-w-md">
              <PresencePicker inicial={profile.presence ?? 'AVAILABLE'} />
            </div>`;
const newPresence = `<div className="w-full">
              <PresencePicker inicial={profile.presence ?? 'AVAILABLE'} />
            </div>`;
code = code.replace(oldPresence, newPresence);

const oldSession = `<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-2">
              <div className="flex flex-col gap-2">
                <LogoutButton compacto={false} />
                <p className="text-xs text-white/40">Se cierra en este navegador. Podrás volver a entrar cuando quieras.</p>
              </div>
              <div className="flex flex-col gap-2">
                <DeleteAccount email={profile.credential.email} />
                <p className="text-xs text-white/40">Lo último y lo único que no se deshace.</p>
              </div>
            </div>`;

const newSession = `<div className="flex flex-wrap items-start gap-8 mt-2">
              <div className="flex flex-col gap-2 max-w-[240px]">
                <div className="w-fit"><LogoutButton compacto={false} /></div>
                <p className="text-xs text-white/40 leading-relaxed">Se cierra en este navegador. Podrás volver a entrar cuando quieras.</p>
              </div>
              <div className="flex flex-col gap-2 max-w-[240px]">
                <div className="w-fit"><DeleteAccount email={profile.credential.email} /></div>
                <p className="text-xs text-white/40 leading-relaxed">Lo último y lo único que no se deshace.</p>
              </div>
            </div>`;
code = code.replace(oldSession, newSession);

fs.writeFileSync(path, code);
