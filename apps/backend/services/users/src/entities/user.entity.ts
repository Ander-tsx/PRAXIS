import { Column, Entity, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column({ unique: true })
    authId: string;

    @Column({ unique: true })
    email: string;

    @Column({ unique: true })
    first_name: string;

    @Column({ unique: true })
    last_name: string;

    @Column({ unique: true })
    avatar_url: string;

    @CreateDateColumn()
    createdAt: Date;
}