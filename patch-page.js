const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/app/(private)/profile/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const newReturn = `  return (
    <AppHeader title="Tu cuenta">
      <AccountIdentity
        nombre={nombre}
        email={profile.credential.email}
        avatarSrc={avatarHref(profile.avatarUrl, '/dashboard/api/gateway')}
        coverSrc={profile.coverUrl ? avatarHref(profile.coverUrl, '/dashboard/api/gateway') : null}
        biography={profile.biography ?? null}
        location={profile.location ?? null}
        presencia={profile.presence ?? 'AVAILABLE'}
        roles={roles}
        estadoDeCuenta={estadoDeCuenta(profile.status)}
        miembroDesde={mesYAno(profile.createdAt)}
        actualizado={fechaLarga(profile.updatedAt)}
        initialFirstName={profile.firstName ?? ''}
        initialLastName={profile.lastName ?? ''}
      >
        <div className="flex flex-col gap-6 pt-6 mt-6 border-t border-white/5">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white">Tu estado</h3>
            <p className="text-sm text-white/50 mb-2">Hazle saber tu disponibilidad a los demás.</p>
            <div className="max-w-md">
              <PresencePicker inicial={profile.presence ?? 'AVAILABLE'} />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <h3 className="text-sm font-semibold text-white">Sesión y cuenta</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-2">
              <div className="flex flex-col gap-2">
                <LogoutButton compacto={false} />
                <p className="text-xs text-white/40">Se cierra en este navegador. Podrás volver a entrar cuando quieras.</p>
              </div>
              <div className="flex flex-col gap-2">
                <DeleteAccount email={profile.credential.email} />
                <p className="text-xs text-white/40">Lo último y lo único que no se deshace.</p>
              </div>
            </div>
          </div>
        </div>
      </AccountIdentity>
    </AppHeader>
  );
}`;

code = code.replace(/return \(\s*<AppHeader title="Tu cuenta">[\s\S]*?  \);\s*}/, newReturn);
code = code.replace("import { PanelCard } from '@/components/molecules/PanelCard';\n", "");

fs.writeFileSync(path, code);
