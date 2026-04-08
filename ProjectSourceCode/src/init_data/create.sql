CREATE TABLE IF NOT EXISTS user_data (
    user_id SERIAL PRIMARY KEY,
    first_name VARCHAR(63) NOT NULL,
    last_name VARCHAR(63) NOT NULL,
    password VARCHAR(255),
    email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id SERIAL PRIMARY KEY,
    rating DECIMAL(3,1) NOT NULL CHECK (rating BETWEEN 0 AND 10),
    review_type VARCHAR(5) NOT NULL CHECK (review_type IN ('host', 'guest')),
    review VARCHAR(255),
    reviewer_id INT,
    reviewed_id INT,
    CONSTRAINT fk_reviewerID FOREIGN KEY (reviewer_id) REFERENCES user_data(user_id),
    CONSTRAINT fk_reviewedID FOREIGN KEY (reviewed_id) REFERENCES user_data(user_id)
);

CREATE TABLE IF NOT EXISTS locations (
    location_id SERIAL PRIMARY KEY,
    street VARCHAR(255) NOT NULL,
    building_number SMALLINT NOT NULL,
    apartment_number SMALLINT,
    zip_code INT
); --Create City/state as needed

CREATE TABLE IF NOT EXISTS events (
    event_id SERIAL PRIMARY KEY,
    event_name VARCHAR(63) NOT NULL,
    event_details VARCHAR(255),
    location_id INT,
    event_cost DECIMAL(10,2) DEFAULT 0.00,
    event_time TIMESTAMP NOT NULL,
    event_host INT,
    CONSTRAINT fk_host FOREIGN KEY (event_host) REFERENCES user_data(user_id),
    CONSTRAINT fk_event_location FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE IF NOT EXISTS events_to_guests (
    event_id INT NOT NULL,
    guest_id INT NOT NULL,
    PRIMARY KEY (event_id, guest_id),
    CONSTRAINT fk_event_guest FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT fk_guest FOREIGN KEY (guest_id) REFERENCES user_data(user_id)
);

-- Seed data
INSERT INTO user_data (first_name, last_name, password, email) VALUES
    ('Dawson', 'Ash', 'pass123', 'dawson@example.com'),
    ('Jane', 'Smith', 'pass123', 'jane@example.com');

INSERT INTO locations (street, building_number, apartment_number, zip_code) VALUES
    ('University Ave', 1234, NULL, 80302),
    ('Pearl St', 500, 12, 80302);

INSERT INTO events (event_name, event_details, location_id, event_cost, event_time, event_host) VALUES
    ('Study Session', 'CSCI 3308 group study', 1, 0.00, '2026-04-10 18:00:00', 1),
    ('Game Night', 'Board games and pizza', 2, 5.00, '2026-04-12 20:00:00', 1),
    ('Hiking Trip', 'Flatirons hike meetup', 1, 0.00, '2026-04-15 09:00:00', 2);

INSERT INTO events_to_guests (event_id, guest_id) VALUES
    (1, 2),
    (2, 2),
    (3, 1);

INSERT INTO reviews (rating, review_type, review, reviewer_id, reviewed_id) VALUES
    (8.5, 'host', 'Great host!', 2, 1),
    (9.0, 'host', 'Super organized', 2, 1),
    (7.0, 'guest', 'Fun to hang with', 1, 2),
    (8.0, 'guest', 'Always on time', 1, 2);

-- Notifications data table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,              -- recipient
    type VARCHAR(32)  NOT NULL DEFAULT 'general', -- 'rsvp', 'review', 'invite', etc.
    message TEXT NOT NULL,
    related_event_id INT,                                -- optional link to an event
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_notif_user  FOREIGN KEY (user_id) REFERENCES user_data(user_id),
    CONSTRAINT fk_notif_event FOREIGN KEY (related_event_id) REFERENCES events(event_id)
);