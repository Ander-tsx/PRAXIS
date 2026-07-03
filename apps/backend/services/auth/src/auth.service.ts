import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { type Repository } from 'typeorm';
import { Credential } from './entities/credential.entity';
import { Logger } from '@praxis/observability';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Credential)
    private readonly credentialRepo: Repository<Credential>,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  async register(data: { email: string; password: string }) {
    this.logger.log(`Attempting to register new credential for email: ${data.email}`);

    const exists = await this.credentialRepo.findOne({
      where: { email: data.email },
    });

    if (exists) {
      this.logger.warn(`Registration failed: Email ${data.email} is already registered`);
      throw new RpcException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const credential = this.credentialRepo.create({
      email: data.email,
      passwordHash,
    });

    await this.credentialRepo.save(credential);
    this.logger.log(`Credential successfully registered for email: ${data.email}`);
    return { userId: credential.id };
  }

  async login(data: { email: string; password: string }) {
    this.logger.log(`Attempting login for email: ${data.email}`);

    const credential = await this.credentialRepo.findOne({
      where: { email: data.email },
    });

    if (!credential) {
      this.logger.warn(`Login failed: No credential found for email ${data.email}`);
      throw new RpcException('Invalid credentials');
    }

    const valid = await bcrypt.compare(data.password, credential.passwordHash);
    if (!valid) {
      this.logger.warn(`Login failed: Invalid password for email ${data.email}`);
      throw new RpcException('Invalid credentials');
    }

    const payload = { sub: credential.id };
    const access_token = this.jwtService.sign(payload);

    this.logger.log(`Login successful for email: ${data.email}`);
    return { access_token };
  }

  verifyToken(token: string) {
    this.logger.log('Attempting to verify token');
    try {
      const result = this.jwtService.verify(token);
      return result;
    } catch (error) {
      this.logger.warn(
        `Token verification failed: ${error instanceof Error ? error.message : 'Invalid or expired token'}`,
      );
      throw new RpcException('Invalid or expired token');
    }
  }
}
