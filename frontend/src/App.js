// CallSync Frontend - Production Ready (React)
// Install: npx create-react-app calsync-frontend
// Then: npm install axios react-router-dom

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.onrender.com').replace(/\/$/, '');

// Login Page
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { email, password });
      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userId', response.data.userId);
        navigate('/dashboard');
      } else {
        setMessage('Registration successful! Please login.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
      }
    } catch (err) {
      setMessage(err.response?.data?.error || 'Error occurred');
    }
  };

  return (
    <div style={styles.authPage}>
      <div style={styles.authCard}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark}>CS</div>
          <div>
            <h1 style={styles.title}>CallSync</h1>
            <p style={styles.subtitle}>Calendar-first scheduling</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />
          <button type="submit" style={styles.button}>
            {isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => setIsLogin(!isLogin)}
          style={styles.secondaryButton}
        >
          {isLogin ? 'Create new account' : 'Back to sign in'}
        </button>

        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}

// Dashboard
function Dashboard() {
  const [activeTab, setActiveTab] = useState('connect-calendar');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/');
  };

  const handleGoogleAuth = () => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/google`;
    const scope = 'https://www.googleapis.com/auth/calendar';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleOutlookAuth = () => {
    const clientId = process.env.REACT_APP_OUTLOOK_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/outlook`;
    const scope = 'Calendars.ReadWrite offline_access';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
    });
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  };

  return (
    <div style={styles.appPage}>
      <div style={styles.dashboard}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>CallSync</h1>
            <p style={styles.subtitle}>Availability, links, and confirmations in one workflow</p>
          </div>
          <button onClick={handleLogout} style={styles.dangerButton}>
            Sign out
          </button>
        </div>

        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === 'connect-calendar' ? styles.activeTabButton : {})
            }}
            onClick={() => setActiveTab('connect-calendar')}
          >
            Connect Calendar
          </button>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === 'create-meeting' ? styles.activeTabButton : {})
            }}
            onClick={() => setActiveTab('create-meeting')}
          >
            Create Meeting
          </button>
        </div>

        {activeTab === 'connect-calendar' && (
          <ConnectCalendarTab onGoogleAuth={handleGoogleAuth} onOutlookAuth={handleOutlookAuth} />
        )}
        {activeTab === 'create-meeting' && <CreateMeetingTab />}
      </div>
    </div>
  );
}

// Connect Calendar Tab
function ConnectCalendarTab({ onGoogleAuth, onOutlookAuth }) {
  return (
    <div style={styles.tabContent}>
      <h2 style={styles.sectionTitle}>Calendar Connections</h2>

      <div style={styles.calendarOptions}>
        <div style={styles.calendarCard}>
          <h3 style={styles.cardTitle}>Google Calendar</h3>
          <p style={styles.mutedText}>Primary availability source for Gmail and Workspace users.</p>
          <button onClick={onGoogleAuth} style={{ ...styles.button, backgroundColor: '#4285f4' }}>
            Connect Google
          </button>
        </div>

        <div style={styles.calendarCard}>
          <h3 style={styles.cardTitle}>Outlook Calendar</h3>
          <p style={styles.mutedText}>Microsoft 365 calendar sync for work accounts.</p>
          <button onClick={onOutlookAuth} style={{ ...styles.button, backgroundColor: '#0078d4' }}>
            Connect Outlook
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Meeting Tab
function CreateMeetingTab() {
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [attendeeName, setAttendeeName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [workStartHour, setWorkStartHour] = useState(9);
  const [workEndHour, setWorkEndHour] = useState(17);
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [message, setMessage] = useState('');
  const token = localStorage.getItem('token');

  const fetchAvailableSlots = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, {
        params: {
          date: selectedDate,
          durationMinutes,
          bufferMinutes,
          slotIntervalMinutes,
          workStartHour,
          workEndHour,
          timeZone,
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableSlots(response.data.availableSlots);
    } catch (err) {
      setMessage('Error fetching available slots');
    }
  };

  const toggleSlot = (slot) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter(s => s !== slot));
    } else {
      setSelectedSlots([...selectedSlots, slot]);
    }
  };

  const handleCreateMeeting = async () => {
    if (!attendeeEmail || !attendeeName || selectedSlots.length === 0) {
      setMessage('Please fill all fields and select at least one slot');
      return;
    }

    try {
      await axios.post(
        `${API_URL}/api/meetings/create`,
        {
          attendeeEmail,
          attendeeName,
          slots: selectedSlots
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

    
      setMessage(`Meeting created! and Email sent to the attendee`);
      setAttendeeEmail('');
      setAttendeeName('');
      setSelectedDate('');
      setSelectedSlots([]);
      setAvailableSlots([]);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Error creating meeting');
    }
  };

  return (
    <div style={styles.tabContent}>
      <h2>Create Meeting Request</h2>

      <div style={styles.form}>
        <input
          type="email"
          placeholder="Attendee Email"
          value={attendeeEmail}
          onChange={(e) => setAttendeeEmail(e.target.value)}
          style={styles.input}
        />

        <input
          type="text"
          placeholder="Attendee Name"
          value={attendeeName}
          onChange={(e) => setAttendeeName(e.target.value)}
          style={styles.input}
        />

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={styles.input}
        />

        <div style={styles.preferencesGrid}>
          <label style={styles.fieldLabel}>
            Duration
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} style={styles.input}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>

          <label style={styles.fieldLabel}>
            Buffer
            <select value={bufferMinutes} onChange={(e) => setBufferMinutes(Number(e.target.value))} style={styles.input}>
              <option value={0}>None</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>

          <label style={styles.fieldLabel}>
            Interval
            <select value={slotIntervalMinutes} onChange={(e) => setSlotIntervalMinutes(Number(e.target.value))} style={styles.input}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </label>

          <label style={styles.fieldLabel}>
            Start
            <input type="number" min="0" max="23" value={workStartHour} onChange={(e) => setWorkStartHour(Number(e.target.value))} style={styles.input} />
          </label>

          <label style={styles.fieldLabel}>
            End
            <input type="number" min="1" max="24" value={workEndHour} onChange={(e) => setWorkEndHour(Number(e.target.value))} style={styles.input} />
          </label>

          <label style={styles.fieldLabel}>
            Timezone
            <input type="text" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} style={styles.input} />
          </label>
        </div>

        <button onClick={fetchAvailableSlots} style={styles.button}>
          Fetch Available Slots
        </button>
      </div>

      {availableSlots.length > 0 && (
        <div style={styles.slotsContainer}>
          <h3>Select Slots (Click to toggle):</h3>
          <div style={styles.slotsGrid}>
            {availableSlots.map((slot) => (
              <div
                key={slot}
                onClick={() => toggleSlot(slot)}
                style={{
                  ...styles.slotBox,
                  backgroundColor: selectedSlots.includes(slot) ? '#28a745' : '#e9ecef',
                  cursor: 'pointer'
                }}
              >
                {new Date(slot).toLocaleTimeString()}
              </div>
            ))}
          </div>

          <p>Selected: {selectedSlots.length} slots</p>
          <button onClick={handleCreateMeeting} style={{ ...styles.button, backgroundColor: '#28a745' }}>
            Create Meeting with {selectedSlots.length} Slots
          </button>
        </div>
      )}

      {message && <p style={styles.message}>{message}</p>}
    </div>
  );
}

// Select Slot Page (Public)
function SelectSlotPage() {
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const uniqueLink = window.location.pathname.split('/').pop();

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/meetings/${uniqueLink}`);
        setSlots(res.data.slots);
      } catch (err) {
        setMessage('Error loading meeting slots');
      }
    };
    fetchSlots();
  }, [uniqueLink]);

  const handleSelectSlot = async (slot) => {
    try {
      await axios.post(
        `${API_URL}/api/meetings/select-slot/${uniqueLink}`,
        { slotId: slot.id } // send actual numeric id
      );
      setMessage('Slot selected. Confirmation email sent.');
    } catch (err) {
      setMessage('Error selecting slot');
    }
  };
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Select Your Meeting Time</h1>
        <div style={styles.slotsGrid}>
          {slots.map((slot) => (
            <button
              key={slot.id} // use actual slot id
              onClick={() => handleSelectSlot(slot)} // pass the full slot object
              style={styles.slotButton}
            >
              {new Date(slot.slot_time).toLocaleString()}
            </button>
          ))}


        </div>
        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}


// Google Auth Callback Handler
function GoogleAuthCallback() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && token) {
      axios.post(`${API_URL}/api/auth/google-callback`, { code }, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(() => {
          navigate('/dashboard');
          alert('Google Calendar connected successfully!');
        })
        .catch(err => {
          alert('Error connecting Google Calendar: ' + err.message);
          navigate('/dashboard');
        });
    }
  }, [token, navigate]);

  return <div>Connecting Google Calendar...</div>;
}

// Outlook Auth Callback Handler
function OutlookAuthCallback() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && token) {
      axios.post(`${API_URL}/api/auth/outlook-callback`, { code }, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(() => {
          navigate('/dashboard');
          alert('Outlook Calendar connected successfully!');
        })
        .catch(err => {
          alert('Error connecting Outlook Calendar: ' + err.message);
          navigate('/dashboard');
        });
    }
  }, [token, navigate]);

  return <div>Connecting Outlook Calendar...</div>;
}

// Styles
const styles = {
  authPage: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '24px', backgroundColor: '#eef2f6' },
  appPage: { minHeight: '100vh', padding: '32px', backgroundColor: '#eef2f6' },
  authCard: { backgroundColor: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 18px 60px rgba(15, 23, 42, 0.12)', maxWidth: '440px', width: '100%', border: '1px solid #dde5ee' },
  dashboard: { backgroundColor: '#fff', padding: '28px', borderRadius: '8px', boxShadow: '0 18px 60px rgba(15, 23, 42, 0.10)', width: '100%', maxWidth: '1120px', margin: '0 auto', border: '1px solid #dde5ee' },
  brandRow: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' },
  brandMark: { width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#0f766e', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: '700' },
  title: { margin: 0, fontSize: '30px', color: '#102033' },
  pageTitle: { margin: 0, fontSize: '28px', color: '#102033' },
  sectionTitle: { margin: '0 0 18px', fontSize: '22px', color: '#102033' },
  cardTitle: { margin: '0 0 8px', fontSize: '18px', color: '#102033' },
  subtitle: { margin: '4px 0 0', color: '#5b6777', fontSize: '14px' },
  mutedText: { color: '#5b6777', fontSize: '14px', lineHeight: 1.5, margin: '0 0 18px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: { padding: '11px 12px', border: '1px solid #cfd8e3', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', color: '#102033' },
  preferencesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: '700', color: '#334155' },
  button: { padding: '11px 18px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' },
  secondaryButton: { marginTop: '12px', padding: '11px 18px', backgroundColor: '#f1f5f9', color: '#102033', border: '1px solid #cfd8e3', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', width: '100%' },
  dangerButton: { padding: '10px 16px', backgroundColor: '#b42318', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '26px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #dde5ee', paddingBottom: '8px' },
  tabButton: { padding: '10px 14px', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', color: '#334155', backgroundColor: '#fff', fontWeight: '700' },
  activeTabButton: { color: '#0f766e', backgroundColor: '#ecfdf5', borderColor: '#99f6e4' },
  tabContent: { marginTop: '8px' },
  calendarOptions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '8px' },
  calendarCard: { padding: '20px', border: '1px solid #dde5ee', borderRadius: '8px', backgroundColor: '#fbfdff' },
  slotsContainer: { marginTop: '22px' },
  slotsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '10px', marginTop: '14px' },
  slotBox: { padding: '14px', border: '1px solid #cfd8e3', borderRadius: '6px', textAlign: 'center', fontWeight: '700', color: '#102033' },
  slotButton: { padding: '14px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' },
  message: { marginTop: '15px', padding: '11px', backgroundColor: '#ecfdf5', color: '#065f46', borderRadius: '6px', textAlign: 'center', border: '1px solid #99f6e4' }
};

// App Router
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/select-slot/:uniqueLink" element={<SelectSlotPage />} />
        <Route path="/auth/google" element={<GoogleAuthCallback />} />
        <Route path="/auth/outlook" element={<OutlookAuthCallback />} />
      </Routes>
    </Router>
  );
}
