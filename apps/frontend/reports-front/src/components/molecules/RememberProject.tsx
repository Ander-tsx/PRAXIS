'use client';

import { useEffect } from 'react';

export function RememberProject({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `last_reports_project_slug=${encodeURIComponent(slug)}; path=/; max-age=31536000`;
  }, [slug]);
  return null;
}
