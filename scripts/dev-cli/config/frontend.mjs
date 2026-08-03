export const FRONTEND_APPS = [
  { key: "web", pkg: "@praxis/web", dir: "apps/frontend/web", prisma: false, seed: false, color: 96, buildDeps: [] },
];

export const FRONTEND_TURBO_SERVICE = {
  key: "frontend",
  pkg: "frontend (turbo)",
  dir: ".",
  prisma: false,
  seed: false,
  color: 96,
  buildDeps: [],
  startCommand: 'turbo run dev --filter="./apps/frontend/*"',
};
