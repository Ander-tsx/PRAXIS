const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/AccountIdentity/EditProfileModal.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldAvatarHTML = `<Avatar label="Avatar" size="xl" src={avatarPreview} />`;
const newAvatarHTML = `{avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar Preview" className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#161615] flex items-center justify-center text-3xl font-bold text-white">
                    A
                  </div>
                )}`;

code = code.replace(oldAvatarHTML, newAvatarHTML);

// adjust positioning slightly
code = code.replace('absolute -top-16 left-4', 'absolute -top-12 sm:-top-14 left-4');

fs.writeFileSync(path, code);
