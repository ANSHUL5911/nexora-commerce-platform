/**
 * Explicit Safe User DTO Serializer
 * Ensures password hashes, internal secrets, and session data are never exposed in API responses.
 *
 * @param {import('../../models/User.js').User | Record<string, unknown>} user
 * @returns {{ id: string, email: string, full_name: string, role: string, is_active: boolean, created_at: Date | string, updated_at: Date | string }}
 */
export function toSafeUserDTO(user) {
  if (!user) return null;

  const raw = typeof user.toJSON === 'function' ? user.toJSON() : user;

  return {
    id: raw.id,
    email: raw.email,
    full_name: raw.full_name,
    role: raw.role,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export default {
  toSafeUserDTO,
};
