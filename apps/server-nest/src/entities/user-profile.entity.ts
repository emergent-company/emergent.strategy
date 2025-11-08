import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEmail } from './user-email.entity';

@Entity({ schema: 'core', name: 'user_profiles' })
@Index(['zitadelUserId'], { unique: true })
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'zitadel_user_id', type: 'text' })
  zitadelUserId: string;

  @Column({ name: 'first_name', type: 'text', nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'text', nullable: true })
  lastName: string | null;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName: string | null;

  @Column({ name: 'phone_e164', type: 'text', nullable: true })
  phoneE164: string | null;

  @Column({ name: 'avatar_object_key', type: 'text', nullable: true })
  avatarObjectKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => UserEmail, (email) => email.user)
  emails: UserEmail[];
}
