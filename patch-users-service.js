const fs = require('fs');
const path = 'apps/backend/services/credentials/src/users/users.service.ts';
let code = fs.readFileSync(path, 'utf8');

const oldUpdateBlock = `        ...(dto.lastName === undefined &&
          dto.last_name !== undefined && { lastName: dto.last_name }),
        /* La presencia la elige su dueño. \`status\` **no** entra por aquí: es el
           estado administrativo de la cuenta y lo pone la plataforma. */
        ...(dto.presence !== undefined && { presence: dto.presence }),
      },`;

const newUpdateBlock = `        ...(dto.lastName === undefined &&
          dto.last_name !== undefined && { lastName: dto.last_name }),
        ...(dto.biography !== undefined && { biography: dto.biography }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.professionalInfo !== undefined && { professionalInfo: dto.professionalInfo }),
        /* La presencia la elige su dueño. \`status\` **no** entra por aquí: es el
           estado administrativo de la cuenta y lo pone la plataforma. */
        ...(dto.presence !== undefined && { presence: dto.presence }),
      },`;

code = code.replace(oldUpdateBlock, newUpdateBlock);
fs.writeFileSync(path, code);
