export function formatMoney(amountCents) {
    const sign = amountCents < 0 ? '-' : '';
    const absoluteCents = Math.abs(amountCents);
    return `${sign}$${(absoluteCents / 100).toFixed(2)}`;
}