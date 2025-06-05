// Vercel API route - receives Stripe webhook and updates Supabase
import Stripe from 'stripe';
import { buffer } from 'micro';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-04-30',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf.toString(),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'customer.subscription.created') {
    const subscription = event.data.object;
    const productId = subscription.items.data[0].price.product;
    const customerId = subscription.customer;

    const customer = await stripe.customers.retrieve(customerId);
    const email = customer.email;

    const tierMap = {
      'prod_GOLD_ID': 'Gold',
      'prod_PLATINUM_ID': 'Platinum',
      'prod_DIAMOND_ID': 'Diamond',
    };

    const tier = tierMap[productId] || 'Gold';

    const { error } = await supabase
      .from('revalidation_email_list')
      .upsert({ email, membership_tier: tier });

    if (error) return res.status(500).send('Supabase insert error');

    return res.status(200).send('Success');
  }

  res.status(200).send('Unhandled event type');
}
