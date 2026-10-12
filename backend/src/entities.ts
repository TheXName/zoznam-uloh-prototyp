import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

// Tabuľky v databáze. TypeORM ich pri štarte vytvorí automaticky (synchronize: true).

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ unique: true }) email: string;
  @Column({ name: 'password_hash', select: false }) passwordHash: string;
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false }) @JoinColumn({ name: 'user_id' }) user: User;
  @Column() title: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true }) dueAt: Date | null;
  /** ID udalosti v Google kalendári (ak bola úloha zapísaná do kalendára) */
  @Column({ name: 'google_event_id', type: 'varchar', nullable: true }) googleEventId: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/** Tokeny, ktoré nám Google vydal po súhlase používateľa (OAuth 2.0) */
@Entity('google_accounts')
export class GoogleAccount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false }) @JoinColumn({ name: 'user_id' }) user: User;
  @Column({ name: 'access_token', type: 'text' }) accessToken: string;
  @Column({ name: 'refresh_token', type: 'text', nullable: true }) refreshToken: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
}
