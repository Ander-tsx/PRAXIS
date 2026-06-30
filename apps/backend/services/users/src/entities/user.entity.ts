import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    authId: string;

    @Column({ unique: true })
    email: string;

    @Column({ nullable: false })
    firstName: string;

    @Column({ nullable: false })
    lastLame: string;

    @Column({ nullable: false })
    avatarUrl: string;

    @CreateDateColumn()
    createdAt: Date;
}
