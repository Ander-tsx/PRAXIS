import { JwtPayloadDto } from '@praxis/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      };
    }
  }
}