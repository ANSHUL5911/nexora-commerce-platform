import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

// Precomputed dummy bcrypt hash (cost 12) for nonexistent user timing mitigation
const DUMMY_HASH = '$2b$12$e8m4ZtZ8iW7qQjX4aI7SyeG7xGqOaB4l6o9j/w0K3F7v6E2J.1hKu';

/**
 * Hash plaintext password using bcrypt with cost factor 12.
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} - Bcrypt hash
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify plaintext password against stored bcrypt hash.
 * @param {string} password - Plaintext password to verify
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>} - True if password matches hash
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Perform dummy password verification on nonexistent accounts to
 * execute comparable bcrypt workload and reduce observable timing differences.
 * @param {string} password - Plaintext password provided in request
 * @returns {Promise<boolean>} - Always returns false
 */
export async function verifyDummyPassword(password) {
  if (password) {
    await bcrypt.compare(password, DUMMY_HASH);
  } else {
    await bcrypt.compare('dummy_input', DUMMY_HASH);
  }
  return false;
}

export default {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
};
