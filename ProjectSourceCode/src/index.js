require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcrypt');
const session = require('express-session');
const hbs = require('hbs');
const pgp = require('pg-promise')();
const app = express();

// Database connection
const db = pgp({
    host: process.env.POSTGRES_HOST || 'db',
    port: 5432,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

// View engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.set('view options', { layout: 'layouts/main' });
hbs.registerPartials(path.join(__dirname, 'views/partials'));

// Middleware
app.use(express.static(path.join(__dirname, 'resources')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24 hours
}));

// Make session user available in all HBS templates
app.use((req, res, next) => {
    res.locals.sessionUser = req.session.user || null;
    next();
});

// User authentication: use in any routes which requires a logged-in user
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Redirect routes
app.get('/', (req, res) => res.redirect('/home'));

app.get('/home', (req, res) => {
    res.render('pages/home');
});

// ----------------------------------------------------------------------------------------------
// REGISTER API CALLS:
// GET register
app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/home');
    res.render('pages/register');
});
// POST register (create a new account)
app.post('/register', async (req, res) => {
    const { first_name, last_name, email, password, confirm_password } = req.body;

    // Basic validation
    if (!first_name || !last_name || !email || !password) {
        return res.render('pages/register', { error: 'All fields are required.' });
    }
    if (password !== confirm_password) {
        return res.render('pages/register', { error: 'Passwords do not match.' });
    }
    if (password.length < 6) {
        return res.render('pages/register', { error: 'Password must be at least 6 characters.' });
    }

    try {
        // Check if email already exists
        const existing = await db.oneOrNone(
            'SELECT user_id FROM user_data WHERE email = $1', [email]
        );
        if (existing) {
            return res.render('pages/register', { error: 'That email is already registered.' });
        }

        const hash = await bcrypt.hash(password, 10);
        const newUser = await db.one(
            `INSERT INTO user_data (first_name, last_name, email, password)
             VALUES ($1, $2, $3, $4) RETURNING user_id, first_name, last_name, email`,
            [first_name, last_name, email, hash]
        );

        req.session.user = newUser;
        res.redirect('/home');
    } catch (err) {
        console.error('Register error:', err);
        res.render('pages/register', { error: 'Server error. Please try again.' });
    }
});

// ----------------------------------------------------------------------------------------------
// LOGIN/LOGOUT API CALLS
// GET login
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/home');
    res.render('pages/login');
});
// POST login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('pages/login', { error: 'Email and password are required.' });
    }

    try {
        const user = await db.oneOrNone(
            'SELECT * FROM user_data WHERE email = $1', [email]
        );

        if (!user) {
            return res.render('pages/login', { error: 'Invalid email or password.' });
        }

        // Support both hashed passwords (new accounts) and plain-text legacy passwords
        let valid = false;
        if (user.password.startsWith('$2')) {
            valid = await bcrypt.compare(password, user.password);
        } else {
            valid = password === user.password; // legacy plain-text
        }

        if (!valid) {
            return res.render('pages/login', { error: 'Invalid email or password.' });
        }

        req.session.user = {
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
        };
        res.redirect('/home');
    } catch (err) {
        console.error('Login error:', err);
        res.render('pages/login', { error: 'Server error. Please try again.' });
    }
});
// GET logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ----------------------------------------------------------------------------------------------
// HOMEPAGE/MAIN EVENTS PAGE API CALLS
// GET home (show upcoming events, optionally filtered by search query)
app.get('/home', async (req, res) => {
    const { q, free } = req.query;

    let query = `
        SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost,
               u.first_name || ' ' || u.last_name AS host_name,
               l.street || ' ' || l.building_number AS location_text,
               COUNT(etg.guest_id) AS rsvp_count
        FROM events e
        LEFT JOIN user_data u ON e.event_host = u.user_id
        LEFT JOIN locations l ON e.location_id = l.location_id
        LEFT JOIN events_to_guests etg ON e.event_id = etg.event_id
        WHERE e.event_time >= NOW()
    `;
    const params = [];

    if (q) {
        params.push(`%${q}%`);
        query += ` AND (e.event_name ILIKE $${params.length} OR e.event_details ILIKE $${params.length})`;
    }
    if (free === '1') {
        query += ` AND e.event_cost = 0`;
    }

    query += ` GROUP BY e.event_id, u.first_name, u.last_name, l.street, l.building_number
               ORDER BY e.event_time ASC`;

    try {
        const events = await db.any(query, params);
        res.render('pages/home', {
            events,
            searchQuery: q || '',
            freeOnly: free === '1',
            sessionUser: req.session.user,
        });
    } catch (err) {
        console.error('Home error:', err);
        res.render('pages/home', { events: [], error: 'Could not load events.' });
    }
});

// ----------------------------------------------------------------------------------------------
// EVENT PAGE API CALLS (Implemented RSVPing for an event thats free or paid through Stripe)
// GET events/:id (event detail page by event id)
app.get('/events/:id', async (req, res) => {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) return res.status(400).send('Invalid event ID');

    try {
        const event = await db.oneOrNone(`
            SELECT e.*, 
                   u.first_name || ' ' || u.last_name AS host_name,
                   u.user_id AS host_id,
                   l.street, l.building_number, l.apartment_number, l.zip_code
            FROM events e
            LEFT JOIN user_data u ON e.event_host = u.user_id
            LEFT JOIN locations l ON e.location_id = l.location_id
            WHERE e.event_id = $1`, [eventId]
        );

        if (!event) return res.status(404).send('Event not found');

        const guests = await db.any(`
            SELECT u.user_id, u.first_name, u.last_name
            FROM events_to_guests etg
            JOIN user_data u ON etg.guest_id = u.user_id
            WHERE etg.event_id = $1`, [eventId]
        );

        // Is the logged-in user already RSVP'd?
        const userId = req.session.user?.user_id;
        const alreadyRsvpd = guests.some(g => g.user_id === userId);
        const isHost = event.host_id === userId;

        res.render('pages/event', {
            event,
            guests,
            rsvpCount: guests.length,
            alreadyRsvpd,
            isHost,
            sessionUser: req.session.user,
        });
    } catch (err) {
        console.error('Event detail error:', err);
        res.status(500).send('Server error');
    }
});
// GET events/new (create event form - user auth required)
app.get('/events/new', requireAuth, (req, res) => {
    res.render('pages/event_new');
});
// POST events/new (save a new event - user auth required)
app.post('/events/new', requireAuth, async (req, res) => {
    const { event_name, event_details, event_time, event_cost, street, building_number, apartment_number, zip_code } = req.body;

    if (!event_name || !event_time) {
        return res.render('pages/event_new', { error: 'Event name and time are required.' });
    }

    try {
        const location = await db.one(
            `INSERT INTO locations (street, building_number, apartment_number, zip_code)
             VALUES ($1, $2, $3, $4) RETURNING location_id`,
            [street, parseInt(building_number), apartment_number ? parseInt(apartment_number) : null, parseInt(zip_code)]
        );

        const newEvent = await db.one(
            `INSERT INTO events (event_name, event_details, location_id, event_cost, event_time, event_host)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING event_id`,
            [event_name, event_details, location.location_id, parseFloat(event_cost) || 0, event_time, req.session.user.user_id]
        );

        res.redirect(`/events/${newEvent.event_id}`);
    } catch (err) {
        console.error('Create event error:', err);
        res.render('pages/event_new', { error: 'Could not create event. Check all fields.' });
    }
});
// POST events/:id/rsvp (RSVP to a free event - user auth required)
app.post('/events/:id/rsvp', requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const userId = req.session.user.user_id;

    try {
        const event = await db.oneOrNone('SELECT * FROM events WHERE event_id = $1', [eventId]);
        if (!event) return res.status(404).json({ error: 'Event not found' });

        // If the event costs money, redirect to Stripe instead
        if (parseFloat(event.event_cost) > 0) {
            return res.redirect(`/events/${eventId}/checkout`);
        }

        await db.none(
            `INSERT INTO events_to_guests (event_id, guest_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`, [eventId, userId]
        );

        // Create a notification for the host
        await db.none(
            `INSERT INTO notifications (user_id, type, message, related_event_id)
             VALUES ($1, 'rsvp', $2, $3)`,
            [event.event_host, `${req.session.user.first_name} ${req.session.user.last_name} RSVPd to your event!`, eventId]
        );

        res.redirect(`/events/${eventId}`);
    } catch (err) {
        console.error('RSVP error:', err);
        res.status(500).send('Server error');
    }
});
// POST events/:id/cancel-rsvp (cancel RSVPing for an event - user auth required)
app.post('/events/:id/cancel-rsvp', requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const userId = req.session.user.user_id;

    try {
        await db.none(
            'DELETE FROM events_to_guests WHERE event_id = $1 AND guest_id = $2',
            [eventId, userId]
        );
        res.redirect(`/events/${eventId}`);
    } catch (err) {
        console.error('Cancel RSVP error:', err);
        res.status(500).send('Server error');
    }
});
// GET events/:id/checkout (Stripe checkout for paid events - user auth required)
app.get('/events/:id/checkout', requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.id);

    try {
        const event = await db.oneOrNone('SELECT * FROM events WHERE event_id = $1', [eventId]);
        if (!event) return res.status(404).send('Event not found');

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: event.event_name },
                    unit_amount: Math.round(parseFloat(event.event_cost) * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/events/${eventId}/rsvp-confirm?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/events/${eventId}`,
        });

        res.redirect(303, session.url);
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).send('Payment setup failed');
    }
});
// GET /events/:id/rsvp-confirm (called by Stripe after successful payment - user auth required)
app.get('/events/:id/rsvp-confirm', requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const userId = req.session.user.user_id;

    try {
        await db.none(
            `INSERT INTO events_to_guests (event_id, guest_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`, [eventId, userId]
        );
        res.redirect(`/events/${eventId}`);
    } catch (err) {
        console.error('RSVP confirm error:', err);
        res.status(500).send('Server error');
    }
});

// ----------------------------------------------------------------------------------------------
// USER PAGE API CALLS
// GET user/:id (public user profile page)
app.get('/user/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).send('Invalid user ID');

    try {
        const user = await db.oneOrNone('SELECT * FROM user_data WHERE user_id = $1', [userId]);
        if (!user) return res.status(404).send('User not found');

        const hostRatingResult = await db.oneOrNone(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
             FROM reviews WHERE reviewed_id = $1 AND review_type = 'host'`, [userId]
        );
        const guestRatingResult = await db.oneOrNone(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
             FROM reviews WHERE reviewed_id = $1 AND review_type = 'guest'`, [userId]
        );

        const hostReviews = await db.any(
            `SELECT r.*, u.first_name || ' ' || u.last_name AS reviewer_name
             FROM reviews r
             JOIN user_data u ON r.reviewer_id = u.user_id
             WHERE r.reviewed_id = $1 AND r.review_type = 'host'
             ORDER BY r.review_id DESC`, [userId]
        );
        const guestReviews = await db.any(
            `SELECT r.*, u.first_name || ' ' || u.last_name AS reviewer_name
             FROM reviews r
             JOIN user_data u ON r.reviewer_id = u.user_id
             WHERE r.reviewed_id = $1 AND r.review_type = 'guest'
             ORDER BY r.review_id DESC`, [userId]
        );

        const eventsAttended = await db.any(
            `SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost
             FROM events e
             JOIN events_to_guests etg ON e.event_id = etg.event_id
             WHERE etg.guest_id = $1 ORDER BY e.event_time DESC`, [userId]
        );
        const eventsHosted = await db.any(
            `SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost
             FROM events e WHERE e.event_host = $1 ORDER BY e.event_time DESC`, [userId]
        );

        const isOwnProfile = req.session.user?.user_id === userId;

        res.render('pages/user', {
            user,
            avgHostRating: hostRatingResult?.avg_rating ? parseFloat(hostRatingResult.avg_rating).toFixed(1) : null,
            hostReviewCount: parseInt(hostRatingResult?.review_count) || 0,
            avgGuestRating: guestRatingResult?.avg_rating ? parseFloat(guestRatingResult.avg_rating).toFixed(1) : null,
            guestReviewCount: parseInt(guestRatingResult?.review_count) || 0,
            hostReviews,
            guestReviews,
            eventsAttended,
            eventsHosted,
            attendedCount: eventsAttended.length,
            hostedCount: eventsHosted.length,
            initials: (user.first_name[0] + user.last_name[0]).toUpperCase(),
            isOwnProfile,
            sessionUser: req.session.user,
        });
    } catch (err) {
        console.error('User profile error:', err);
        res.status(500).send('Server error');
    }
});
// GET account (redirect logged-in user to their own profile - user auth required)
app.get('/account', requireAuth, (req, res) => {
    res.redirect(`/user/${req.session.user.user_id}`);
});

// ----------------------------------------------------------------------------------------------
// REVIEW PAGES API CALLS
// POST reviews (submit a review for another user - user auth required)
app.post('/reviews', requireAuth, async (req, res) => {
    const { reviewed_id, review_type, rating, review } = req.body;
    const reviewerId = req.session.user.user_id;
    const reviewedId = parseInt(reviewed_id);

    if (reviewerId === reviewedId) {
        return res.status(400).send('You cannot review yourself.');
    }
    if (!['host', 'guest'].includes(review_type)) {
        return res.status(400).send('Invalid review type.');
    }
    const ratingNum = parseFloat(rating);
    if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 10) {
        return res.status(400).send('Rating must be between 0 and 10.');
    }

    try {
        await db.none(
            `INSERT INTO reviews (rating, review_type, review, reviewer_id, reviewed_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [ratingNum, review_type, review || null, reviewerId, reviewedId]
        );
        res.redirect(`/user/${reviewedId}`);
    } catch (err) {
        console.error('Review error:', err);
        res.status(500).send('Could not submit review.');
    }
});

// ----------------------------------------------------------------------------------------------
// NOTIFICATIONS API CALLS (removed previous API calls and implemented previous functionality in these along with user auth requirement)
// GET notifications (show notifications for the logged-in user - user auth required)
app.get('/notifications', requireAuth, async (req, res) => {
    try {
        const notifications = await db.any(
            `SELECT * FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.session.user.user_id]
        );

        // Count unread
        const unreadCount = notifications.filter(n => !n.is_read).length;

        res.render('pages/notifications', { notifications, unreadCount });
    } catch (err) {
        console.error('Notifications error:', err);
        res.render('pages/notifications', { notifications: [], unreadCount: 0 });
    }
});
// POST notifications/mark-read (mark all notifications as read - user auth required)
app.post('/notifications/mark-read', requireAuth, async (req, res) => {
    try {
        await db.none(
            'UPDATE notifications SET is_read = true WHERE user_id = $1',
            [req.session.user.user_id]
        );
        res.redirect('/notifications');
    } catch (err) {
        console.error('Mark-read error:', err);
        res.redirect('/notifications');
    }
});

// ----------------------------------------------------------------------------------------------
// SEARCH API CALLS
// GET search (search for events and users)
app.get('/search', async (req, res) => {
    const { q } = req.query;

    if (!q || !q.trim()) {
        return res.render('pages/search', { query: '', events: [], users: [] });
    }

    const term = `%${q.trim()}%`;
    try {
        const events = await db.any(
            `SELECT e.event_id, e.event_name, e.event_details, e.event_time, e.event_cost,
                    u.first_name || ' ' || u.last_name AS host_name
             FROM events e
             LEFT JOIN user_data u ON e.event_host = u.user_id
             WHERE e.event_name ILIKE $1 OR e.event_details ILIKE $1
             ORDER BY e.event_time ASC LIMIT 20`, [term]
        );

        const users = await db.any(
            `SELECT user_id, first_name, last_name, email
             FROM user_data
             WHERE first_name ILIKE $1 OR last_name ILIKE $1
             ORDER BY last_name LIMIT 20`, [term]
        );

        res.render('pages/search', { query: q, events, users });
    } catch (err) {
        console.error('Search error:', err);
        res.render('pages/search', { query: q, events: [], users: [], error: 'Search failed.' });
    }
});

// Start server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
