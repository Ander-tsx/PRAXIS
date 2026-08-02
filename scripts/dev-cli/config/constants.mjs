export const ROOT = process.cwd();
export const DOCKER_COMPOSE_FILE = "infra/docker/compose/docker-compose.yml";
export const CONTRACTS_PKG = "@praxis/contracts";
export const SENSITIVE_KEY_RE = /(URL|URI|HOST|PORT|KEY|SECRET|TOKEN|PASSWORD|DSN|CLIENT_ID)/i;
export const label = (svc) => svc.pkg.replace(/^@[^/]+\//, "");
