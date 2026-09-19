import { describe, it, expect } from 'vitest';
import { getOrderStatusPresentation } from './orderStatus.js';

describe('getOrderStatusPresentation utility', () => {
  it('correctly maps PENDING_PAYMENT to PAYMENT INITIATED with no tracking and no buy again', () => {
    const result = getOrderStatusPresentation('PENDING_PAYMENT');
    expect(result).toEqual({
      normalizedStatus: 'PENDING_PAYMENT',
      headerLabel: 'PAYMENT INITIATED',
      canTrack: false,
      isPaymentPending: true,
      showBuyAgain: false,
      showTrackPackage: false,
      primaryAction: null,
    });
  });

  it('correctly maps PAID to ORDER PLACED with tracking and buy again', () => {
    const result = getOrderStatusPresentation('PAID');
    expect(result).toEqual({
      normalizedStatus: 'PAID',
      headerLabel: 'ORDER PLACED',
      canTrack: true,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: true,
      primaryAction: 'TRACK_PACKAGE',
    });
  });

  it('correctly maps PROCESSING to ORDER PLACED with tracking and buy again', () => {
    const result = getOrderStatusPresentation('PROCESSING');
    expect(result).toEqual({
      normalizedStatus: 'PROCESSING',
      headerLabel: 'ORDER PLACED',
      canTrack: true,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: true,
      primaryAction: 'TRACK_PACKAGE',
    });
  });

  it('correctly maps SHIPPED to ORDER PLACED with tracking and buy again', () => {
    const result = getOrderStatusPresentation('SHIPPED');
    expect(result).toEqual({
      normalizedStatus: 'SHIPPED',
      headerLabel: 'ORDER PLACED',
      canTrack: true,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: true,
      primaryAction: 'TRACK_PACKAGE',
    });
  });

  it('correctly maps DELIVERED to ORDER PLACED with buy again as primary and tracking enabled', () => {
    const result = getOrderStatusPresentation('DELIVERED');
    expect(result).toEqual({
      normalizedStatus: 'DELIVERED',
      headerLabel: 'ORDER PLACED',
      canTrack: true,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: true,
      primaryAction: 'BUY_AGAIN',
    });
  });

  it('correctly maps CANCELLED to ORDER CANCELLED with no tracking but buy again allowed', () => {
    const result = getOrderStatusPresentation('CANCELLED');
    expect(result).toEqual({
      normalizedStatus: 'CANCELLED',
      headerLabel: 'ORDER CANCELLED',
      canTrack: false,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: false,
      primaryAction: 'BUY_AGAIN',
    });
  });

  it('correctly maps EXPIRED to ORDER EXPIRED with no tracking but buy again allowed', () => {
    const result = getOrderStatusPresentation('EXPIRED');
    expect(result).toEqual({
      normalizedStatus: 'EXPIRED',
      headerLabel: 'ORDER EXPIRED',
      canTrack: false,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: false,
      primaryAction: 'BUY_AGAIN',
    });
  });

  it('correctly maps REFUNDED to ORDER REFUNDED with no tracking but buy again allowed', () => {
    const result = getOrderStatusPresentation('REFUNDED');
    expect(result).toEqual({
      normalizedStatus: 'REFUNDED',
      headerLabel: 'ORDER REFUNDED',
      canTrack: false,
      isPaymentPending: false,
      showBuyAgain: true,
      showTrackPackage: false,
      primaryAction: 'BUY_AGAIN',
    });
  });

  it('handles lowercase, mixed-case and whitespace-padded inputs gracefully', () => {
    expect(getOrderStatusPresentation('  pending_payment  ').headerLabel).toBe('PAYMENT INITIATED');
    expect(getOrderStatusPresentation('paid').headerLabel).toBe('ORDER PLACED');
    expect(getOrderStatusPresentation('Processing').canTrack).toBe(true);
    expect(getOrderStatusPresentation('shipped').showTrackPackage).toBe(true);
    expect(getOrderStatusPresentation('Delivered').primaryAction).toBe('BUY_AGAIN');
    expect(getOrderStatusPresentation('cancelled').canTrack).toBe(false);
    expect(getOrderStatusPresentation('expired').canTrack).toBe(false);
    expect(getOrderStatusPresentation('refunded').headerLabel).toBe('ORDER REFUNDED');
  });

  it('handles unknown, null, and undefined statuses safely with neutral fallback without crashing', () => {
    const nullRes = getOrderStatusPresentation(null);
    expect(nullRes.headerLabel).toBe('ORDER STATUS');
    expect(nullRes.canTrack).toBe(false);
    expect(nullRes.showTrackPackage).toBe(false);
    expect(nullRes.showBuyAgain).toBe(false);

    const undefRes = getOrderStatusPresentation(undefined);
    expect(undefRes.headerLabel).toBe('ORDER STATUS');
    expect(undefRes.canTrack).toBe(false);

    const unknownRes = getOrderStatusPresentation('SOMETHING_UNEXPECTED');
    expect(unknownRes.headerLabel).toBe('ORDER STATUS');
    expect(unknownRes.normalizedStatus).toBe('SOMETHING_UNEXPECTED');
    expect(unknownRes.canTrack).toBe(false);
  });
});
