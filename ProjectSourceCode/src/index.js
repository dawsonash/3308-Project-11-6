require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const hbs = require('hbs');
const pgp = require('pg-promise')();
const app = express();
const bcrypt = require('bcryptjs');
// Database connection
const db = pgp({
    host: process.env.POSTGRES_HOST || 'db',
    port: 5432,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.set('view options', { layout: 'layouts/main' });
hbs.registerPartials(path.join(__dirname, 'views/partials'));
app.use(express.static(path.join(__dirname, 'resources')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/home', (req, res) => {
    res.render('pages/home');
});

app.get('/notifications', (req, res) => {
  res.render('pages/notifications');
});
app.get('/user/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
        return res.status(400).send('Invalid user ID');
    }

    try {
        const user = await db.oneOrNone('SELECT * FROM user_data WHERE user_id = $1', [userId]);
        if (!user) {
            return res.status(404).send('User not found');
        }

        const hostRatingResult = await db.oneOrNone(
            "SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE reviewed_id = $1 AND review_type = 'host'",
            [userId]
        );

        const guestRatingResult = await db.oneOrNone(
            "SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE reviewed_id = $1 AND review_type = 'guest'",
            [userId]
        );

        const eventsAttended = await db.any(
            `SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost
             FROM events e
             JOIN events_to_guests etg ON e.event_id = etg.event_id
             WHERE etg.guest_id = $1
             ORDER BY e.event_time DESC`,
            [userId]
        );

        const eventsHosted = await db.any(
            `SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost
             FROM events e
             WHERE e.event_host = $1
             ORDER BY e.event_time DESC`,
            [userId]
        );

        const avgHostRating = hostRatingResult && hostRatingResult.avg_rating
            ? parseFloat(hostRatingResult.avg_rating).toFixed(1)
            : null;
        const avgGuestRating = guestRatingResult && guestRatingResult.avg_rating
            ? parseFloat(guestRatingResult.avg_rating).toFixed(1)
            : null;

        res.render('pages/user', {
            user,
            avgHostRating,
            hostReviewCount: parseInt(hostRatingResult?.review_count) || 0,
            avgGuestRating,
            guestReviewCount: parseInt(guestRatingResult?.review_count) || 0,
            eventsAttended,
            eventsHosted,
            attendedCount: eventsAttended.length,
            hostedCount: eventsHosted.length,
            initials: (user.first_name[0] + user.last_name[0]).toUpperCase(),
        });
    } catch (err) {
        console.error('Error loading user profile:', err);
        res.status(500).send('Server error');
    }
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

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || typeof username !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO user_data (email, password, first_name, last_name) 
      VALUES ($1, $2, 'Test', 'User') RETURNING *;
    `;
    
    await db.one(query, [username, hash]);
    res.status(200).json({ message: 'Success' });
    
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(400).json({ message: 'Invalid input' });
  }
});

module.exports = app;