// CalSync Backend - Production Ready - COMPLETE VERSION
// Install: npm install express dotenv pg axios nodemailer cors bcrypt jsonwebtoken
// Run: node index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
// near top of file, after requiring axios
axios.defaults.timeout = 7000; // 7s global timeout to avoid long blocking waits

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection with SSL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Email Configuration
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware: Verify JWT
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Initialize Database
async function initDb() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        google_token TEXT,
        outlook_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        attendee_email VARCHAR(255) NOT NULL,
        attendee_name VARCHAR(255),
        unique_link VARCHAR(255) UNIQUE,
        selected_slot TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS slots (
        id SERIAL PRIMARY KEY,
        meeting_id INT REFERENCES meetings(id),
        slot_time TIMESTAMP NOT NULL,
        google_event_id VARCHAR(255),
        outlook_event_id VARCHAR(255),
        is_selected BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Database initialized successfully');
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
    }
}

// Health Check Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'CalSync backend is running' });
});

app.post('/api/auth/google-callback', (req, res) => {
    console.log('🔍 Google callback received!');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    res.json({ message: 'Route exists' });
});


app.get('/api/meetings/:uniqueLink', async (req, res) => {
    try {
        const { uniqueLink } = req.params;

        const meetingResult = await pool.query(
            'SELECT id, user_id, attendee_email, attendee_name, unique_link, selected_slot, status, created_at FROM meetings WHERE unique_link = $1',
            [uniqueLink]
        );

        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const meeting = meetingResult.rows[0];

        const slotsResult = await pool.query(
            'SELECT id, slot_time, is_selected FROM slots WHERE meeting_id = $1 ORDER BY slot_time',
            [meeting.id]
        );

        res.json({
            meeting: {
                id: meeting.id,
                attendeeEmail: meeting.attendee_email,
                attendeeName: meeting.attendee_name,
                status: meeting.status,
                selectedSlot: meeting.selected_slot
            },
            slots: slotsResult.rows // each row: { id, slot_time, is_selected }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// 
// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2)',
            [email, hashedPassword]
        );

        res.json({ message: 'User registered successfully' });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Email already exists' });
        } else {
            res.status(400).json({ error: err.message });
        }
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, userId: user.id, email: user.email });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Google OAuth Callback
app.post('/api/auth/google-callback', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            code,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code'
        });

        await pool.query(
            'UPDATE users SET google_token = $1 WHERE id = $2',
            [tokenResponse.data.access_token, req.userId]
        );

        res.json({ message: 'Google calendar connected' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Outlook OAuth Callback
app.post('/api/auth/outlook-callback', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code required' });
        }

        const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            client_id: process.env.OUTLOOK_CLIENT_ID,
            client_secret: process.env.OUTLOOK_CLIENT_SECRET,
            code,
            redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
            grant_type: 'authorization_code',
            scope: 'Calendars.ReadWrite offline_access'
        });

        await pool.query(
            'UPDATE users SET outlook_token = $1 WHERE id = $2',
            [tokenResponse.data.access_token, req.userId]
        );

        res.json({ message: 'Outlook calendar connected' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get Available Slots from both calendars
app.get('/api/calendar/available-slots', authMiddleware, async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        const user = userResult.rows[0];

        let googleEvents = [];
        let outlookEvents = [];

        // Fetch Google Calendar events
        if (user.google_token) {
            try {
                const googleResponse = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                    headers: { Authorization: `Bearer ${user.google_token}` },
                    params: { timeMin: new Date(date).toISOString(), singleEvents: true }
                });
                googleEvents = googleResponse.data.items || [];
            } catch (err) {
                console.log('Google fetch error:', err.message);
            }
        }

        // Fetch Outlook Calendar events
        if (user.outlook_token) {
            try {
                const outlookResponse = await axios.get('https://graph.microsoft.com/v1.0/me/calendar/events', {
                    headers: { Authorization: `Bearer ${user.outlook_token}` }
                });
                outlookEvents = outlookResponse.data.value || [];
            } catch (err) {
                console.log('Outlook fetch error:', err.message);
            }
        }

        const allEvents = [...googleEvents, ...outlookEvents];
        res.json({ availableSlots: generateAvailableSlots(allEvents, date) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Create Meeting with Slots
// Create Meeting with Slots
app.post('/api/meetings/create', authMiddleware, async (req, res) => {
  try {
    const { attendeeEmail, attendeeName, slots } = req.body;
    
    if (!attendeeEmail || !attendeeName || !slots || slots.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1️⃣ Generate a unique link for the attendee
    const uniqueLink = Math.random().toString(36).substring(2, 12);

    // 2️⃣ Insert meeting into DB
    const meetingResult = await pool.query(
      'INSERT INTO meetings (user_id, attendee_email, attendee_name, unique_link) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, attendeeEmail, attendeeName, uniqueLink]
    );
    const meetingId = meetingResult.rows[0].id;

    // 3️⃣ Insert slots into DB
    const insertedSlots = [];
    for (const slot of slots) {
      const insert = await pool.query(
        'INSERT INTO slots (meeting_id, slot_time) VALUES ($1, $2) RETURNING id, slot_time',
        [meetingId, slot]
      );
      insertedSlots.push(insert.rows[0]); // { id, slot_time }
    }

    // 4️⃣ Respond immediately to frontend (don't expose uniqueLink if you want security)
    res.json({ 
      message: 'Meeting created. Attendee will receive an email to select a slot.' 
    });

    // 5️⃣ Send email asynchronously
    const userResult = await pool.query('SELECT email, google_token, outlook_token FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    try {
      await transporter.sendMail({
        to: attendeeEmail,
        subject: `Meeting Request from ${user.email}`,
        html: `
          <p>Hi ${attendeeName},</p>
          <p>${user.email} has offered you ${slots.length} time slots for a meeting.</p>
          <p>Please select a slot here: <a href="${process.env.FRONTEND_URL}/select-slot/${uniqueLink}">Pick a slot</a></p>
        `
      });
      console.log('✅ Email sent to attendee');
    } catch (emailErr) {
      console.log('❌ Email sending error:', emailErr.message);
    }

    // 6️⃣ Book slots in calendars asynchronously (non-blocking)
    insertedSlots.forEach(async (s) => {
      try {
        let gId = null, oId = null;
        if (user.google_token) {
          gId = await createGoogleEvent(req.userId, s.slot_time, attendeeEmail);
        }
        if (user.outlook_token) {
          oId = await createOutlookEvent(req.userId, s.slot_time, attendeeEmail);
        }
        await pool.query('UPDATE slots SET google_event_id=$1, outlook_event_id=$2 WHERE id=$3', [gId, oId, s.id]);
      } catch (err) {
        console.log('❌ Slot booking error:', err.response?.data || err.message);
      }
    });

  } catch (err) {
    console.log('❌ Meeting creation error:', err.message);
    res.status(400).json({ error: err.message });
  }
});


// Select Slot (Public endpoint)
// Select Slot (Public endpoint)
app.post('/api/meetings/select-slot/:uniqueLink', async (req, res) => {
    try {
        const { slotId } = req.body;
        const { uniqueLink } = req.params;

        if (slotId === undefined || slotId === null) {
            return res.status(400).json({ error: 'Slot ID required' });
        }

        const numericSlotId = parseInt(slotId, 10);
        if (isNaN(numericSlotId)) return res.status(400).json({ error: 'Invalid Slot ID' });

        // fetch meeting by link
        const meetingResult = await pool.query(
            'SELECT * FROM meetings WHERE unique_link = $1',
            [uniqueLink]
        );

        if (meetingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const meeting = meetingResult.rows[0];

        // verify the slot belongs to this meeting
        const slotCheck = await pool.query('SELECT * FROM slots WHERE id = $1 AND meeting_id = $2', [numericSlotId, meeting.id]);
        if (slotCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Slot not found for this meeting' });
        }

        // Mark selected slot
        await pool.query('UPDATE slots SET is_selected = TRUE WHERE id = $1', [numericSlotId]);

        // Get all slots for this meeting
        const slotsResult = await pool.query('SELECT * FROM slots WHERE meeting_id = $1', [meeting.id]);

        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [meeting.user_id]);
        const user = userResult.rows[0];

        // Delete all non-selected slots from both calendars and DB
        for (const slot of slotsResult.rows) {
            if (slot.id !== numericSlotId) {
                if (slot.google_event_id) {
                    await deleteGoogleEvent(user.google_token, slot.google_event_id);
                }
                if (slot.outlook_event_id) {
                    await deleteOutlookEvent(user.outlook_token, slot.outlook_event_id);
                }
                await pool.query('DELETE FROM slots WHERE id = $1', [slot.id]);
            }
        }

        // Fetch selected slot_time and update meeting
        const selectedSlotResult = await pool.query('SELECT slot_time FROM slots WHERE id = $1', [numericSlotId]);

        await pool.query(
            'UPDATE meetings SET status = $1, selected_slot = $2 WHERE id = $3',
            ['confirmed', selectedSlotResult.rows[0].slot_time, meeting.id]
        );

        // Send confirmation emails (best-effort)
        try {
            await transporter.sendMail({
                to: meeting.attendee_email,
                subject: 'Meeting Confirmed',
                html: `<p>Your meeting has been confirmed for ${selectedSlotResult.rows[0].slot_time}</p>`
            });

            await transporter.sendMail({
                to: user.email,
                subject: 'Meeting Confirmed',
                html: `<p>${meeting.attendee_name} has selected a meeting slot for ${selectedSlotResult.rows[0].slot_time}</p>`
            });
        } catch (emailErr) {
            console.log('Email error:', emailErr.message);
        }

        res.json({ message: 'Slot selected and other slots deleted', selectedSlot: selectedSlotResult.rows[0].slot_time });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});



// Helper Functions
function generateAvailableSlots(events, date) {
    const slots = [];
    const dayStart = new Date(date);
    dayStart.setHours(9, 0, 0, 0);

    for (let i = 0; i < 8; i++) {
        const slotStart = new Date(dayStart.getTime() + i * 60 * 60000);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60000);

        const isBooked = events.some(event => {
            const eventStart = new Date(event.start?.dateTime || event.start?.date);
            const eventEnd = new Date(event.end?.dateTime || event.end?.date);
            return slotStart < eventEnd && slotEnd > eventStart;
        });

        if (!isBooked) {
            slots.push(slotStart.toISOString());
        }
    }

    return slots;
}

async function createGoogleEvent(userId, slotTime, attendeeEmail) {
    try {
        const userResult = await pool.query('SELECT google_token FROM users WHERE id = $1', [userId]);
        const token = userResult.rows[0]?.google_token;
        console.log('Google token:', token);
        if (!token) return null;

        const response = await axios.post(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
                summary: `Meeting with ${attendeeEmail}`,
                start: { dateTime: slotTime },
                end: { dateTime: new Date(new Date(slotTime).getTime() + 60 * 60000).toISOString() },
                attendees: [{ email: attendeeEmail }]
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('Google event created:', response.data);
        return response.data.id;
    } catch (err) {
        console.log('Google event creation error:', err.response?.data || err.message);
        return null;
    }
}


async function createOutlookEvent(userId, slotTime, attendeeEmail) {
    try {
        const userResult = await pool.query('SELECT outlook_token FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0].outlook_token) return null;

        const response = await axios.post(
            'https://graph.microsoft.com/v1.0/me/calendar/events',
            {
                subject: `Meeting with ${attendeeEmail}`,
                start: { dateTime: slotTime, timeZone: 'UTC' },
                end: { dateTime: new Date(new Date(slotTime).getTime() + 60 * 60000).toISOString(), timeZone: 'UTC' },
                attendees: [{ emailAddress: { address: attendeeEmail }, type: 'required' }]
            },
            { headers: { Authorization: `Bearer ${userResult.rows[0].outlook_token}` } }
        );

        return response.data.id;
    } catch (err) {
        console.log('Outlook event creation error:', err.message);
        return null;
    }
}

async function deleteGoogleEvent(token, eventId) {
    try {
        await axios.delete(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
    } catch (err) {
        console.log('Google event deletion error:', err.message);
    }
}

async function deleteOutlookEvent(token, eventId) {
    try {
        await axios.delete(
            `https://graph.microsoft.com/v1.0/me/calendar/events/${eventId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
    } catch (err) {
        console.log('Outlook event deletion error:', err.message);
    }
}




// Initialize and Start
initDb().then(() => {
    app.listen(process.env.PORT || 5000, () => {
        console.log('🚀 CalSync server running on port', process.env.PORT || 5000);
    });
});