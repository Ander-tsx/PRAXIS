import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, type Repository } from 'typeorm';
import { Credential } from './entities/credential.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Credential)
    private readonly credentialRepo: Repository<Credential>,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: { email: string; password: string }) {
    const exists = await this.credentialRepo.findOne({
      where: { email: data.email },
    });

    if (exists) {
      throw new RpcException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const credential = this.credentialRepo.create({
      email: data.email,
      passwordHash,
    });

    await this.credentialRepo.save(credential);
    return { success: true };
  }

  async login(data: { email: string; password: string }) {
    const credential = await this.credentialRepo.findOne({
      where: { email: data.email },
    });

    if (!credential) {
      throw new RpcException('Invalid credentials');
    }

    const valid = await bcrypt.compare(data.password, credential.passwordHash);
    if (!valid) {
      throw new RpcException('Invalid credentials');
    }

    const payload = { sub: credential.id };
    const access_token = this.jwtService.sign(payload);

    return { access_token };
  }

  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new RpcException('Invalid or expired token');
    }
  }
}
