const express = require("express");
const path = require("path");
const exphbs = require("express-handlebars");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (CSS, JS, images)
app.use("/resources", express.static(path.join(__dirname, "resources")));

// Multer setup for photo uploads
const upload = multer({ dest: "uploads/" });

// ----------------------------------------------------
// View Engine Setup (Handlebars)
// ----------------------------------------------------
app.engine(
  "hbs",
  exphbs.engine({
    extname: "hbs",
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views/layouts"),
    partialsDir: path.join(__dirname, "views/partials")
  })
);

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// ----------------------------------------------------
// Basic Page Routes
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.render("pages/home");
});

app.get("/login", (req, res) => {
  res.render("pages/login");
});

app.get("/register", (req, res) => {
  res.render("pages/register");
});

// ----------------------------------------------------
// Inline Event Routes (Create + Edit)
// ----------------------------------------------------

// Temporary in-memory event store (replace with DB later)
let events = {};

// Render the event creation page
app.get("/events/new", (req, res) => {
  res.render("pages/event", { event: null, isEditing: false });
});

// Handle event creation
app.post("/events/new", upload.array("photos"), (req, res) => {
  const id = Date.now().toString();

  const newEvent = {
    id,
    title: req.body.title,
    description: req.body.description,
    price: req.body.price,
    date: req.body.date,
    time: req.body.time,
    location: req.body.location,
    maxCapacity: req.body.maxCapacity,
    tags: req.body.tags ? req.body.tags.split(",") : [],
    photos: req.files ? req.files.map(f => f.filename) : []
  };

  events[id] = newEvent;

  res.redirect(`/events/${id}/edit`);
});

// Render the edit page for an existing event
app.get("/events/:id/edit", (req, res) => {
  const event = events[req.params.id];

  if (!event) {
    return res.status(404).send("Event not found");
  }

  res.render("pages/event", { event, isEditing: true });
});

// Handle event edit submission
app.post("/events/:id/edit", upload.array("photos"), (req, res) => {
  const existingEvent = events[req.params.id];

  if (!existingEvent) {
    return res.status(404).send("Event not found");
  }

  const updatedEvent = {
    id: req.params.id,
    title: req.body.title,
    description: req.body.description,
    price: req.body.price,
    date: req.body.date,
    time: req.body.time,
    location: req.body.location,
    maxCapacity: req.body.maxCapacity,
    tags: req.body.tags ? req.body.tags.split(",") : [],
    photos: existingEvent.photos // keep old photos unless new ones uploaded
  };

  if (req.files && req.files.length > 0) {
    updatedEvent.photos = req.files.map(f => f.filename);
  }

  events[req.params.id] = updatedEvent;

  res.redirect(`/events/${req.params.id}/edit`);
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

