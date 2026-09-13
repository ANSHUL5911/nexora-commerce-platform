export function formatMoney(amountPaise = 0) {
    const paise = Number(amountPaise) || 0;
    const sign = paise < 0 ? '-' : '';
    const absolutePaise = Math.abs(paise);
    return `${sign}₹${(absolutePaise / 100).toFixed(2)}`;
}