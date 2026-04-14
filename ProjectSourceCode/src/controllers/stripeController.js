const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.createCheckoutSession = async (req, res) => {
  try {
    const { eventId, eventName, price } = req.body;

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `RSVP: ${eventName}`,
              metadata: { eventId },
            },
            unit_amount: price * 100, // Price in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/events/${eventId}`,
      // Optionally attach user ID if req.user exists from your auth middleware
      client_reference_id: req.user ? req.user.id : null, 
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};