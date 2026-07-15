# Backend Context & Architecture Documentation for AI Agents

This document provides architectural context, project structure, communication patterns, and logging guidelines for AI agents working on the backend codebase.

---

## 1. Architecture Overview

The backend is built as a **NestJS monorepo utilizing microservices**. It is structured to decouple the API gateway (which handles client HTTP requests) from the internal microservices (which process core business logic and run on TCP/microservice transport).

```mermaid
graph TD
    Client[HTTP Client] -->|HTTP REST /api| Gateway[API Gateway]
    Gateway -->|TCP: Port 3001| AuthService[Auth Service]
    
    subgraph Commons [Shared Libraries]
        Observability[@praxis/observability]
        Contracts[@praxis/contracts]
    end
    
    Gateway -.-> Observability
    Gateway -.-> Contracts
    AuthService -.-> Observability
    AuthService -.-> Contracts
```

---

## 2. Project Directory Structure

```text
apps/backend/
├── gateway/                 # API Gateway (HTTP Entrypoint)
│   ├── src/
│   │   ├── auth/            # Auth controllers and guards forwarding requests to Auth Service
│   │   ├── common/          # Global filters (RPC Exceptions, Validation pipes)
│   │   └── main.ts          # Starts HTTP server, attaches global filters, validation, & Pino logger
│   └── package.json
│
├── services/                # Internal microservices (TCP transport)
│   └── auth/                # Auth Microservice (database operations, token signing)
│       ├── src/
│       │   ├── entities/    # TypeORM Entities (Credential, database schema)
│       │   ├── main.ts      # Starts MicroserviceOptions (Transport.TCP) and Pino logger
│       │   └── auth.service.ts
│       └── package.json
│
└── commons/                 # Shared workspace packages
    ├── contracts/           # DTOs & Validation schemas (shared types)
    └── observability/       # Pino Logging library module wrapper
```

---

## 3. Microservice Communication

Communication between components uses **TCP transport** via NestJS's `ClientProxy`.

- **Client Setup (Gateway)**:
  The Gateway uses `ClientsModule.registerAsync` to configure `AUTH_SERVICE`.
  Host and port are injected via `ConfigService` (`AUTH_SERVICE_HOST` and `AUTH_SERVICE_PORT`).
- **Command Routing**:
  The Gateway forwards request parameters by calling `firstValueFrom(this.authClient.send({ cmd: '<pattern>' }, payload))`.
- **Microservice listener (Auth Service)**:
  Listens on a TCP port (default `3001`). Route handlers match patterns using the `@MessagePattern({ cmd: '<pattern>' })` decorator.

---

## 4. Logging & Observability Design System

The logging system is encapsulated in the `@praxis/observability` workspace package. It wraps the `nestjs-pino` library and `pino-pretty` for developer console output formatting.

### 4.1 Pino Configuration Rules

- **Pretty-Printing**: Formats logs in human-readable lines with color coding in local development (`NODE_ENV !== 'production'`). Logs are output as structured JSON in production environments.
- **Redaction**: Automatically redacts sensitive fields like `authorization` headers, `cookie`, and `password`.

### 4.2 Logging Level Guidelines

When writing code, align logs using these levels:

1. **INFO (`this.logger.log`)**:
   - Used for major lifecycle events and boundaries.
   - **Gateway level**: Mark incoming requests and indicate which microservice they are forwarded to.
     - *Example:* `Incoming request: POST /auth/login - Forwarding to AUTH_SERVICE`.
   - **Service level**: Mark the start and success of critical workflow operations.
     - *Example:* `Credential successfully registered for email: example@domain.com`.

2. **WARNING (`this.logger.warn`)**:
   - Used for normal, expected business rule validation failures or user error outcomes.
   - *Example:* Email already registered, wrong password, or invalid/expired tokens during verification.
   - *Pino warning format:* `Token verification failed: jwt expired`.

3. **DEBUG (`this.logger.debug`)**:
   - Used for payload inspections, transport content debugs, or database results.
   - **No manual environment checks needed.** Call `this.logger.debug()` directly everywhere. Pino silences debug calls automatically when `LOG_LEVEL` is `'info'` or higher, with near-zero overhead.
     ```typescript
     // ✅ Correct — Pino handles suppression based on LOG_LEVEL
     this.logger.debug(`Request payload: ${JSON.stringify(body)}`);
     this.logger.debug(`Inter-microservice response: ${JSON.stringify(response)}`);

     // ❌ Avoid — redundant, error-prone manual guard
     if (process.env.NODE_ENV === 'development') {
       this.logger.debug(`...`);
     }
     ```
   - **Controlling debug output via environment variables**:
     - Development (`.env`): `LOG_LEVEL=debug` — debug logs are visible.
     - Production: omit `LOG_LEVEL` (defaults to `'info'`) — debug logs are silenced.
   - Debug logs should show the exact payloads passed and the response data received between microservices.

---

## 5. Development & Build Steps

Since dependencies are linked using `pnpm` workspace protocols (`workspace:*`), libraries must be compiled before the services consuming them can build.

### Build Order
1. Build the contracts package:
   ```bash
   pnpm --filter @praxis/contracts build
   ```
2. Build the observability package:
   ```bash
   pnpm --filter @praxis/observability build
   ```
3. Build the gateway/services:
   ```bash
   pnpm --filter @praxis/auth-service build
   pnpm --filter @praxis/gateway build
   ```

### Execution Commands
- Start dev server workspace-wide: `pnpm dev` (Runs Turbo dev tasks).
- Running specific microservice: `pnpm --filter @praxis/auth-service start:dev`.
- Running specific gateway: `pnpm --filter @praxis/gateway start:dev`.
