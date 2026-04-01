require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'resources')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/home', (req, res) => {
    res.render('pages/home');
});

app.post('/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Event RSVP' },
                    unit_amount: 500,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://localhost:3000/home',
            cancel_url: 'http://localhost:3000/home',
        });
        res.redirect(303, session.url);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

module.exports = app.listen(3000);

const bcrypt = require('bcrypt');

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || typeof username !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *;';
    
    await db.one(query, [username, hash]);
    
    res.status(200).json({ message: 'Success' });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: 'Invalid input' });
  }
});