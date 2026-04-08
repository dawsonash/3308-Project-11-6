INSERT INTO user_data (first_name, last_name, password, email)
VALUES 
('John', 'Smith', '1234', 'email@email.com'),
('Emma', 'Johnson', 'secure456', 'emma.johnson@email.com'),
('Michael', 'Brown', 'mike789', 'michael.brown@email.com'),
('Olivia', 'Davis', 'olive321', 'olivia.davis@email.com'),
('Liam', 'Wilson', 'liam654', 'liam.wilson@email.com'),
('Sophia', 'Miller', 'sophia987', 'sophia.miller@email.com'),
('Noah', 'Taylor', 'noahpass', 'noah.taylor@email.com'),
('Ava', 'Anderson', 'avaword', 'ava.anderson@email.com'),
('Ethan', 'Thomas', 'ethan111', 'ethan.thomas@email.com'),
('Isabella', 'Moore', 'bella222', 'isabella.moore@email.com');

INSERT INTO locations (street, building_number, apartment_number, zip_code)
VALUES
('Pleasant St', 1610, NULL, 80302);

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