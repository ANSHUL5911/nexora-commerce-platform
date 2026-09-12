/**
 * Phase 07.6 — Inventory Constants
 */

export const RESERVATION_TTL_MINUTES = 15;
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

/**
 * Reservation status constants matching PostgreSQL check constraint `chk_inv_res_status`.
 * The database persists: ACTIVE, RELEASED, CONVERTED, EXPIRED.
 * RESERVED is an application semantic alias for ACTIVE.
 */
export const RESERVATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  RESERVED: 'ACTIVE',
  RELEASED: 'RELEASED',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
});

export const MAX_RESERVATION_QUANTITY_PER_ITEM = 10;
