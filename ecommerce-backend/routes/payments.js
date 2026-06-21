import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
  const { cardNumber, cardholderName, expiryDate, cvv } = req.body;

  if (!cardNumber || !cardholderName || !expiryDate || !cvv) {
    return res.status(400).json({ error: 'All payment fields are required' });
  }

  const cardDigits = cardNumber.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(cardDigits)) {
    return res.status(400).json({ error: 'Invalid card number' });
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    return res.status(400).json({ error: 'Invalid CVV' });
  }

  if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
    return res.status(400).json({ error: 'Invalid expiry date format' });
  }

  const [month, year] = expiryDate.split('/').map(Number);
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid expiry month' });
  }

  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return res.status(400).json({ error: 'Card has expired' });
  }

  const lastFour = cardDigits.slice(-4);
  const transactionId = 'TXN' + Date.now() + Math.random().toString(36).slice(2, 8).toUpperCase();

  res.json({
    success: true,
    transactionId,
    message: `Payment approved for card ending in ${lastFour}`
  });
});

export default router;
