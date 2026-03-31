CREATE TABLE user_data (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name varchar(63) NOT NULL,
    last_name varchar(63) NOT NULL,
    password varchar(255),
    email varchar(255) NOT NULL UNIQUE
);

CREATE TABLE reviews(
    review_ID INT PRIMARY KEY AUTO_INCREMENT,
    rating DECIMAL(1,1) NOT NULL CHECK(rating BETWEEN 0 AND 10),
    review varchar(255),
    reviewer_ID INT,
    reviewed_ID INT,
    CONSTRAINT fk_reviewerID FOREIGN KEY (reviewer_ID) REFERENCES user_data(user_id), 
    CONSTRAINT fk_reviewedID FOREIGN KEY (reviewed_ID) REFERENCES user_data(user_id)
);

CREATE TABLE locations(
    location_ID INT PRIMARY KEY AUTO_INCREMENT,
    street varchar(255) NOT NULL,
    building_number SMALLINT NOT NULL,
    apartment_number SMALLINT
); --Create City/state/zip as needed

CREATE TABLE events(
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    event_name varchar(63) NOT NULL,
    event_details varchar(255),
    location_ID INT,
    event_cost DECIMAL(10,2) DEFAULT 0.00,
    event_time DATETIME NOT NULL,
    event_host INT,
    CONSTRAINT fk_host FOREIGN KEY (event_host) REFERENCES user_data(user_id),  
    CONSTRAINT fk_event_location FOREIGN KEY (location_id) REFERENCES locations(location_ID)
);

CREATE TABLE events_to_guests(
    event_id INT NOT NULL,
    guest_id INT NOT NULL,
    PRIMARY KEY (event_id, guest_id),
    CONSTRAINT fk_event_guest FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT fk_guest FOREIGN KEY (guest_id) REFERENCES user_data(user_id)
);
