import { User } from './User.js';
import { Session } from './Session.js';
import { AuditLog } from './AuditLog.js';

// Define associations
User.hasMany(Session, {
  foreignKey: 'user_id',
  as: 'sessions',
  onDelete: 'CASCADE',
});

Session.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE',
});

User.hasMany(AuditLog, {
  foreignKey: 'actor_id',
  as: 'auditLogs',
  onDelete: 'SET NULL',
});

AuditLog.belongsTo(User, {
  foreignKey: 'actor_id',
  as: 'actor',
  onDelete: 'SET NULL',
});

export { User, Session, AuditLog };
export default { User, Session, AuditLog };
