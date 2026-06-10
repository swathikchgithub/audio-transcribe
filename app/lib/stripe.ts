import Stripe from 'stripe';

export const FREE_MAX_BYTES = 25 * 1024 * 1024;  // 25 MB
export const FREE_MONTHLY_SECONDS = 30 * 60;      // 30 minutes
export const PRO_PRICE_MONTHLY = 12_00;            // $12.00 in cents (display only)

// Lazy singleton — only instantiated when a Stripe route is actually called,
// so the app starts cleanly even before STRIPE_SECRET_KEY is configured.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
