const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/AccountIdentity/EditProfileModal.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldHandleSave = `  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (avatarFile) {
        const data = new FormData();
        data.append('file', avatarFile);
        await uploadAvatarAction(data);
      }
      if (coverFile) {
        const data = new FormData();
        data.append('file', coverFile);
        await uploadCoverAction(data);
      }
      
      const res = await updateProfileAction({
        firstName: formData.firstName,
        lastName: formData.lastName,
        biography: formData.biography,
        location: formData.location,
      });

      if (res.error) setError(res.error);
      else onClose();
    } catch {
      setError('Error al guardar el perfil');
    } finally {
      setSaving(false);
    }
  }`;

const newHandleSave = `  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (avatarFile) {
        const data = new FormData();
        data.append('file', avatarFile);
        const res = await uploadAvatarAction(data);
        if (res.error) {
          setError(res.error);
          setSaving(false);
          return;
        }
      }
      if (coverFile) {
        const data = new FormData();
        data.append('file', coverFile);
        const res = await uploadCoverAction(data);
        if (res.error) {
          setError(res.error);
          setSaving(false);
          return;
        }
      }
      
      const res = await updateProfileAction({
        firstName: formData.firstName,
        lastName: formData.lastName,
        biography: formData.biography,
        location: formData.location,
      });

      if (res.error) setError(res.error);
      else onClose();
    } catch {
      setError('Error al guardar el perfil');
    } finally {
      setSaving(false);
    }
  }`;

code = code.replace(oldHandleSave, newHandleSave);

// Add a text note about size limit
const oldCoverHTML = `<div className="relative h-48 w-full bg-white/5">`;
const newCoverHTML = `<div className="relative h-48 w-full bg-white/5">
            <div className="absolute top-2 right-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white/80">Max 5MB</div>`;

code = code.replace(oldCoverHTML, newCoverHTML);

fs.writeFileSync(path, code);
