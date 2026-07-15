 # Ejemplos de Endpoints — `credentials-service` (Puerto TCP: 3001)

Este servicio gestiona la identidad del usuario, las credenciales de acceso, los perfiles de usuario y las sesiones.

---

## 1. Registro de Usuario (`auth_register`)

* **MessagePattern (TCP)**: `{ cmd: 'auth_register' }`
* **Descripción**: Crea una nueva credencial (con contraseña cifrada mediante bcrypt) y un perfil de usuario vacío asociado, iniciando la sesión en Redis y retornando tokens de autenticación.
* **DTO de Entrada**: `RegisterDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "email": "cesar@utez.edu.mx",
    "password": "miSuperPasswordSeguro123"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Inserta en la tabla `credentials` y `users` mediante una transacción.
* **Comportamiento en Caché (Redis)**:
  - Establece la sesión activa: `auth:session:<userId>` con el token de refresco y un TTL de 7 días (604800 segundos).

---

## 2. Inicio de Sesión (`auth_login`)

* **MessagePattern (TCP)**: `{ cmd: 'auth_login' }`
* **Descripción**: Valida el correo y la contraseña. Si son correctos y el usuario está `ACTIVE`, genera nuevos tokens e inicia sesión en Redis.
* **DTO de Entrada**: `LoginDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "email": "cesar@utez.edu.mx",
    "password": "miSuperPasswordSeguro123"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Consulta `Credential` incluyendo la relación `User` filtrando por el correo.
* **Comportamiento en Caché (Redis)**:
  - Sobrescribe/Establece la sesión activa en `auth:session:<userId>` con el nuevo refresh token y TTL de 7 días.

---

## 3. Verificación de Access Token (`auth_verify_token`)

* **MessagePattern (TCP)**: `{ cmd: 'auth_verify_token' }`
* **Descripción**: Verifica la validez de un JWT. Primero consulta si está en caché de Redis para evitar descifrar/validar de forma repetitiva. Valida además que exista una sesión activa.
* **DTO de Entrada**: `VerifyTokenDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Información Devuelta (Response)**: `JwtPayloadDto`
  ```json
  {
    "sub": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "iat": 1783928172,
    "exp": 1783929072
  }
  ```
* **Comportamiento en Caché (Redis)**:
  - Clave de token en caché: `auth:token:<sha256HashOfToken>` (TTL 5 minutos).
  - Consulta existencia de `auth:session:<userId>`.

---

## 4. Renovar Token de Acceso (`auth_refresh`)

* **MessagePattern (TCP)**: `{ cmd: 'auth_refresh' }`
* **Descripción**: Valida un `refreshToken` y emite un nuevo `accessToken` si el refresh token coincide con el guardado en la sesión del usuario en Redis.
* **Información Recibida (Payload)**:
  ```json
  {
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Comportamiento en Caché (Redis)**:
  - Consulta y valida la clave `auth:session:<userId>`.

---

## 5. Cerrar Sesión (`auth_logout`)

* **MessagePattern (TCP)**: `{ cmd: 'auth_logout' }`
* **Descripción**: Invalida y elimina la sesión activa del usuario.
* **Información Recibida (Payload)**:
  ```json
  {
    "userId": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "success": true
  }
  ```
* **Comportamiento en Caché (Redis)**:
  - Elimina `auth:session:<userId>`.

---

## 6. Listar Usuarios Paginado (`user_find_all`)

* **MessagePattern (TCP)**: `{ cmd: 'user_find_all' }`
* **Descripción**: Devuelve una lista paginada y filtrable de usuarios.
* **DTO de Entrada**: `FindUsersDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "query": {
      "page": 1,
      "limit": 10,
      "sortOrder": "DESC",
      "sortBy": "createdAt"
    },
    "filters": {
      "search": "Cesar",
      "createdFrom": "2026-07-01T00:00:00.000Z",
      "createdTo": "2026-07-15T23:59:59.999Z"
    }
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "items": [
      {
        "id": "e81e9f45-0d29-45ff-81fb-992257d09618",
        "credentialId": "4a7b69c4-a1db-4fa5-91db-761abedbf521",
        "firstName": "Cesar",
        "lastName": "Utez",
        "avatarUrl": "https://example.com/avatar.jpg",
        "status": "ACTIVE",
        "createdAt": "2026-07-14T21:38:24.000Z",
        "updatedAt": "2026-07-14T21:38:24.000Z",
        "credential": {
          "email": "cesar@utez.edu.mx"
        }
      }
    ],
    "total": 1
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Hace un `findMany` y `count` sobre el modelo `User` con filtros de búsqueda insensibles a mayúsculas/minúsculas en nombre, apellido o correo de credencial.

---

## 7. Consultar un Usuario (`user_find_one`)

* **MessagePattern (TCP)**: `{ cmd: 'user_find_one' }`
* **Descripción**: Obtiene los detalles de perfil de un usuario específico usando caché para optimizar consultas repetitivas.
* **DTO de Entrada**: `FindOneUserDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "credentialId": "4a7b69c4-a1db-4fa5-91db-761abedbf521",
    "firstName": "Cesar",
    "lastName": "Utez",
    "avatarUrl": "https://example.com/avatar.jpg",
    "status": "ACTIVE",
    "createdAt": "2026-07-14T21:38:24.000Z",
    "updatedAt": "2026-07-14T21:38:24.000Z",
    "credential": {
      "email": "cesar@utez.edu.mx"
    }
  }
  ```
* **Comportamiento en Caché (Redis)**:
  - Intenta obtener la clave `user:<userId>`. Si no existe, consulta la BD y escribe en la caché con TTL de 5 minutos (300 segundos).

---

## 8. Actualizar Perfil de Usuario (`user_update`)

* **MessagePattern (TCP)**: `{ cmd: 'user_update' }`
* **Descripción**: Modifica el perfil (nombre y apellido) de un usuario existente e invalida su caché.
* **DTO de Entrada**: `UpdateUserDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "first_name": "Cesar Julio",
    "last_name": "Utez Gomez"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618",
    "credentialId": "4a7b69c4-a1db-4fa5-91db-761abedbf521",
    "firstName": "Cesar Julio",
    "lastName": "Utez Gomez",
    "avatarUrl": "https://example.com/avatar.jpg",
    "status": "ACTIVE",
    "createdAt": "2026-07-14T21:38:24.000Z",
    "updatedAt": "2026-07-15T03:30:00.000Z",
    "credential": {
      "email": "cesar@utez.edu.mx"
    }
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Actualiza el registro en el modelo `User`.
* **Comportamiento en Caché (Redis)**:
  - Elimina la clave `user:<userId>` para forzar la actualización en la siguiente petición.

---

## 9. Eliminar un Usuario (`user_delete`)

* **MessagePattern (TCP)**: `{ cmd: 'user_delete' }`
* **Descripción**: Elimina a un usuario y su credencial del sistema de forma permanente, limpiando sus cachés y sesiones.
* **DTO de Entrada**: `DeleteUserDto` (de `@praxis/contracts`)
* **Información Recibida (Payload)**:
  ```json
  {
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Información Devuelta (Response)**:
  ```json
  {
    "success": true,
    "id": "e81e9f45-0d29-45ff-81fb-992257d09618"
  }
  ```
* **Comportamiento en BD (Prisma)**:
  - Ejecuta una transacción para eliminar la fila de `User` y su respectiva `Credential`.
* **Comportamiento en Caché (Redis)**:
  - Elimina las claves `user:<userId>` y `auth:session:<userId>`.
