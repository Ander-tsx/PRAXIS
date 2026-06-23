#!/usr/bin/env bash
# =============================================================================
# bootstrap_scaffolding.sh
# Inicializa la estructura completa del monorepo SOFEA
# Uso: bash bootstrap_scaffolding.sh [nombre-del-proyecto]
# Requisitos: node >=20, pnpm, @nestjs/cli, git
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 0. CONFIG
# ---------------------------------------------------------------------------
PROJECT_NAME="${1:-mi-proyecto}"
ROOT="$(pwd)/$PROJECT_NAME"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# 1. VERIFICAR DEPENDENCIAS
# ---------------------------------------------------------------------------
info "Verificando dependencias..."
command -v node  >/dev/null 2>&1 || error "node no encontrado. Instala Node.js >=20"
command -v pnpm  >/dev/null 2>&1 || error "pnpm no encontrado. Instala con: npm i -g pnpm"
command -v git   >/dev/null 2>&1 || error "git no encontrado."

NODE_MAJOR=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
(( NODE_MAJOR >= 20 )) || error "Se requiere Node.js >=20. Versión actual: $(node -v)"

# NestJS CLI (opcional pero recomendado)
if ! command -v nest >/dev/null 2>&1; then
  warn "NestJS CLI no encontrado. Se instalará localmente durante el scaffolding."
  NEST_CMD="pnpm dlx @nestjs/cli"
else
  NEST_CMD="nest"
fi

success "Dependencias verificadas."

# ---------------------------------------------------------------------------
# 2. CREAR RAÍZ E INICIALIZAR GIT
# ---------------------------------------------------------------------------
info "Creando directorio raíz: $ROOT"
mkdir -p "$ROOT"
cd "$ROOT"

git init
success "Git inicializado."

# ---------------------------------------------------------------------------
# 3. ESTRUCTURA DE CARPETAS ESTÁTICAS (mkdir -p)
# ---------------------------------------------------------------------------
info "Creando estructura de carpetas..."

DIRS=(
  # Config y agentes
  ".agents"
  ".claude"
  ".husky"
  ".planning"
  "agents/rules"
  "agents/checklists"
  "agents/prompts/cursor"
  "agents/prompts/chatgpt"
  "agents/prompts/sonar"
  "agents/templates"

  # Addons
  "apps/addons/project-dev-stack"

  # Backend (estructura base; gateway y servicios se generan luego)
  "apps/backend/commons/contracts"
  "apps/backend/commons/observability"
  "apps/backend/commons/security"
  "apps/backend/services"
  "apps/backend/test"

  # Frontend (web-shell se genera luego con Next.js)
  "apps/frontend/commons"

  # Mobile
  "apps/mobile/app-shell"
  "apps/mobile/commons"
  "apps/mobile/plugins"

  # E2E
  "apps/e2e"

  # Docs
  "docs"

  # Infra
  "infra/docker/compose"
  "infra/docker/images"
  "infra/docker/scripts"
  "infra/k8s/base"
  "infra/k8s/overlays"
  "infra/k8s/helm"
  "infra/ci/jenkins"
  "infra/ci/scripts"
  "infra/observability/otel"
  "infra/observability/prometheus"
  "infra/observability/grafana"
  "infra/observability/dashboards"

  # Packages
  "packages/shared-schemas"
  "packages/shared-protos"
  "packages/shared-devtools"

  # Scripts
  "scripts"

  # Stubs
  "stubs/next-ts"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
  # Agrega .gitkeep para versionar carpetas vacías
  touch "$dir/.gitkeep"
done

success "Carpetas creadas."

# ---------------------------------------------------------------------------
# 4. ARCHIVOS DE CONFIGURACIÓN EN LA RAÍZ
# ---------------------------------------------------------------------------
info "Generando archivos de configuración raíz..."

# .nvmrc
echo "20" > .nvmrc

# .editorconfig
cat > .editorconfig << 'EOF'
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
EOF

# .gitignore
cat > .gitignore << 'EOF'
# Dependencias
node_modules/
.pnpm-store/

# Turbo
.turbo/

# Builds
dist/
build/
.next/
out/

# Env
.env
.env.local
.env.*.local

# Logs
*.log
.uat-logs/

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/settings.json
EOF

# .gitattributes
cat > .gitattributes << 'EOF'
* text=auto eol=lf
*.sh text eol=lf
*.bat text eol=crlf
EOF

# .npmrc
cat > .npmrc << 'EOF'
engine-strict=true
auto-install-peers=true
EOF

# .env.example
cat > .env.example << 'EOF'
# ── Base de datos ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# ── Auth / JWT ─────────────────────────────────────────────────────────────
JWT_SECRET=changeme
JWKS_URI=http://localhost:3000/.well-known/jwks.json

# ── Gateway ────────────────────────────────────────────────────────────────
GATEWAY_PORT=3000

# ── Frontend ───────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3000/api
EOF

# README.md
cat > README.md << 'EOF'
# 🏗️ '"$PROJECT_NAME"'

Monorepo SOFEA con microfrontends (Next.js) y microservicios (NestJS).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js + TypeScript (Module Federation) |
| Backend | NestJS + PostgreSQL |
| Monorepo | pnpm workspaces + Turborepo |

## Inicio rápido

```bash
pnpm install
pnpm dev
```

## Estructura

Ver `docs/` para la arquitectura detallada.
EOF

# LICENSE (MIT por defecto — ajusta según tu proyecto)
YEAR=$(date +%Y)
cat > LICENSE << EOF
MIT License

Copyright (c) $YEAR $PROJECT_NAME contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
EOF

# skills-lock.json
echo '{ "skills": [], "version": "1.0.0" }' > skills-lock.json

success "Archivos raíz generados."

# ---------------------------------------------------------------------------
# 5. package.json RAÍZ
# ---------------------------------------------------------------------------
info "Creando package.json raíz..."
cat > package.json << 'EOF'
{
  "name": "root",
  "private": true,
  "scripts": {
    "dev":   "turbo run dev",
    "build": "turbo run build",
    "lint":  "turbo run lint",
    "test":  "turbo run test",
    "format": "biome format --write .",
    "prepare": "husky"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.8.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "husky": "^9.0.0",
    "turbo": "^2.0.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.0.0"
}
EOF

# ---------------------------------------------------------------------------
# 6. pnpm-workspace.yaml
# ---------------------------------------------------------------------------
info "Creando pnpm-workspace.yaml..."
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/**"
  - "packages/**"
  - "stubs/**"
EOF

# ---------------------------------------------------------------------------
# 7. turbo.json
# ---------------------------------------------------------------------------
info "Creando turbo.json..."
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
EOF

# ---------------------------------------------------------------------------
# 8. tsconfig.base.json
# ---------------------------------------------------------------------------
info "Creando tsconfig.base.json..."
cat > tsconfig.base.json << 'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "exclude": ["node_modules", "dist", ".next", "coverage"]
}
EOF

# ---------------------------------------------------------------------------
# 9. biome.json
# ---------------------------------------------------------------------------
info "Creando biome.json..."
cat > biome.json << 'EOF'
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "trailingCommas": "all" }
  },
  "files": {
    "ignore": ["node_modules", "dist", ".next", ".turbo", "coverage"]
  }
}
EOF

# ---------------------------------------------------------------------------
# 10. commitlint.config.cjs
# ---------------------------------------------------------------------------
info "Creando commitlint.config.cjs..."
cat > commitlint.config.cjs << 'EOF'
/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2, 'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'revert', 'infra']
    ],
    'subject-max-length': [2, 'always', 100],
  },
};
EOF

# ---------------------------------------------------------------------------
# 11. HUSKY — Git hooks
# ---------------------------------------------------------------------------
info "Configurando Husky..."

mkdir -p .husky

cat > .husky/pre-commit << 'EOF'
#!/usr/bin/env sh
# Lint staged files antes del commit
pnpm biome check --write --no-errors-on-unmatched --files-ignore-unknown=true $(git diff --cached --name-only --diff-filter=ACMR | sed 's| |\\ |g') || true
EOF

cat > .husky/commit-msg << 'EOF'
#!/usr/bin/env sh
# Valida el mensaje de commit con commitlint
pnpm commitlint --edit "$1"
EOF

chmod +x .husky/pre-commit .husky/commit-msg
success "Husky configurado."

# ---------------------------------------------------------------------------
# 12. GENERAR API GATEWAY CON NESTJS
#     → apps/backend/gateway/
# ---------------------------------------------------------------------------
info "Generando API Gateway con NestJS en apps/backend/gateway/..."

cd "$ROOT/apps/backend"

# Elimina el .gitkeep temporal de gateway si existe
rm -f gateway/.gitkeep 2>/dev/null || true
rmdir gateway 2>/dev/null || true

$NEST_CMD new gateway \
  --package-manager pnpm \
  --language TypeScript \
  --skip-git \
  --skip-install

# package.json del gateway: ajustar name
sed -i 's/"name": "gateway"/"name": "@project\/gateway"/' gateway/package.json

success "API Gateway generado."
cd "$ROOT"

# ---------------------------------------------------------------------------
# 13. GENERAR WEB-SHELL CON NEXT.JS
#     → apps/frontend/web-shell/
# ---------------------------------------------------------------------------
info "Generando web-shell con Next.js en apps/frontend/web-shell/..."

cd "$ROOT/apps/frontend"

rm -f web-shell/.gitkeep 2>/dev/null || true
rmdir web-shell 2>/dev/null || true

pnpm dlx create-next-app@latest web-shell \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git \
  --use-pnpm

# Ajustar name en package.json
sed -i 's/"name": "web-shell"/"name": "@project\/web-shell"/' web-shell/package.json

success "web-shell Next.js generado."
cd "$ROOT"

# ---------------------------------------------------------------------------
# 14. INSTALAR DEPENDENCIAS RAÍZ
# ---------------------------------------------------------------------------
info "Instalando dependencias raíz con pnpm..."
pnpm install
success "Dependencias instaladas."

# ---------------------------------------------------------------------------
# 15. HUSKY INIT
# ---------------------------------------------------------------------------
info "Inicializando Husky..."
pnpm husky || warn "Husky ya inicializado o fallo menor — revisar manualmente."

# ---------------------------------------------------------------------------
# 16. PRIMER COMMIT
# ---------------------------------------------------------------------------
info "Creando commit inicial..."
git add -A
git commit -m "chore: initial monorepo scaffolding" --no-verify
success "Commit inicial creado."

# ---------------------------------------------------------------------------
# 17. RESUMEN FINAL
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  Scaffolding completo: $PROJECT_NAME${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Creado manualmente (mkdir):                                 ║${NC}"
echo -e "${GREEN}║    • Toda la estructura de carpetas estáticas                ║${NC}"
echo -e "${GREEN}║    • Archivos de config raíz (.gitignore, tsconfig, etc.)    ║${NC}"
echo -e "${GREEN}║    • Git hooks (.husky/)                                     ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Generado por CLI:                                           ║${NC}"
echo -e "${GREEN}║    • apps/backend/gateway/    ← nest new                    ║${NC}"
echo -e "${GREEN}║    • apps/frontend/web-shell/ ← create-next-app             ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Próximos pasos manuales:                                    ║${NC}"
echo -e "${GREEN}║    1. Agregar remote: git remote add origin <URL>            ║${NC}"
echo -e "${GREEN}║    2. cp .env.example .env  (y rellenar valores)             ║${NC}"
echo -e "${GREEN}║    3. Crear primer microservicio:                            ║${NC}"
echo -e "${GREEN}║       cd apps/backend && nest new services/<nombre>         ║${NC}"
echo -e "${GREEN}║    4. Crear primer microfrontend:                            ║${NC}"
echo -e "${GREEN}║       cd apps/frontend && pnpm dlx create-next-app <nombre>-front ║${NC}"
echo -e "${GREEN}║    5. pnpm dev  (levanta todo con Turbo)                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"