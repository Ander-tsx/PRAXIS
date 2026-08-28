const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/AccountIdentity/EditProfileModal.tsx';
let code = fs.readFileSync(path, 'utf8');

// We need to import useEffect
if (!code.includes('useEffect')) {
  code = code.replace('import { useState', 'import { useState, useEffect');
}

const oldState = `  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData.avatarSrc);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialData.coverSrc);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  if (!isOpen) return null;`;

const newState = `  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData.avatarSrc);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialData.coverSrc);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        biography: initialData.biography,
        location: initialData.location,
      });
      setAvatarPreview(initialData.avatarSrc);
      setCoverPreview(initialData.coverSrc);
      setAvatarFile(null);
      setCoverFile(null);
      setError(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;`;

code = code.replace(oldState, newState);
fs.writeFileSync(path, code);
