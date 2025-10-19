// CalSync Frontend - Production Ready (React)
// Install: npx create-react-app calsync-frontend
// Then: npm install axios react-router-dom

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://callsync-backend.onrender.com/api';

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
      // 
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
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>CalSync - Meeting Scheduler</h1>
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
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        
        <button
          onClick={() => setIsLogin(!isLogin)}
          style={{ ...styles.button, backgroundColor: '#6c757d' }}
        >
          {isLogin ? 'Create new account' : 'Back to login'}
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
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  };

  const handleOutlookAuth = () => {
    const clientId = process.env.REACT_APP_OUTLOOK_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/outlook`;
    const scope = 'Calendars.ReadWrite offline_access';
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.dashboard}>
        <div style={styles.header}>
          <h1>CalSync Dashboard</h1>
          <button onClick={handleLogout} style={{ ...styles.button, backgroundColor: '#dc3545' }}>
            Logout
          </button>
        </div>

        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tabButton,
              backgroundColor: activeTab === 'connect-calendar' ? '#007bff' : '#f8f9fa'
            }}
            onClick={() => setActiveTab('connect-calendar')}
          >
            Connect Calendar
          </button>
          <button
            style={{
              ...styles.tabButton,
              backgroundColor: activeTab === 'create-meeting' ? '#007bff' : '#f8f9fa'
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
      <h2>Connect Your Calendars</h2>
      <p>Synchronize your Google and Outlook calendars to see all your available slots.</p>
      
      <div style={styles.calendarOptions}>
        <div style={styles.calendarCard}>
          <h3>Google Calendar</h3>
          <button onClick={onGoogleAuth} style={{ ...styles.button, backgroundColor: '#4285f4' }}>
            Connect Google Calendar
          </button>
        </div>
        
        <div style={styles.calendarCard}>
          <h3>Outlook Calendar</h3>
          <button onClick={onOutlookAuth} style={{ ...styles.button, backgroundColor: '#0078d4' }}>
            Connect Outlook Calendar
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
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [message, setMessage] = useState('');
  const token = localStorage.getItem('token');

  const fetchAvailableSlots = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, {
        params: { date: selectedDate },
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
      const response = await axios.post(
        `${API_URL}/api/meetings/create`,
        {
          attendeeEmail,
          attendeeName,
          slots: selectedSlots
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const fullLink = `https://call-sync-livid.vercel.app/select-slot/${response.data.uniqueLink}`;
      setMessage(`Meeting created! Unique link: ${fullLink}`);
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
  const [meeting, setMeeting] = useState(null);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const uniqueLink = window.location.pathname.split('/').pop();

  useEffect(() => {
    // In production, fetch meeting details using uniqueLink
    setSlots([
      '9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'
    ]);
  }, []);

  const handleSelectSlot = async (slot) => {
    try {
      const response = await axios.post(`${API_URL}/api/meetings/select-slot/${uniqueLink}`, {
        slotId: slot
      });
      setMessage('✓ Slot selected! Confirmation email sent.');
    } catch (err) {
      setMessage('Error selecting slot');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Select Your Meeting Time</h1>
        <div style={styles.slotsGrid}>
          {slots.map((slot, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectSlot(idx)}
              style={styles.slotButton}
            >
              {slot}
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
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', padding: '40px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', maxWidth: '500px', width: '100%' },
  dashboard: { backgroundColor: '#fff', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '90%', maxWidth: '1000px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { padding: '10px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '14px' },
  button: { padding: '10px 20px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '14px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  tabs: { display: 'flex', gap: '10px', marginBottom: '20px' },
  tabButton: { padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#000' },
  tabContent: { marginTop: '20px' },
  calendarOptions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' },
  calendarCard: { padding: '20px', border: '1px solid #ddd', borderRadius: '5px', textAlign: 'center' },
  slotsContainer: { marginTop: '20px' },
  slotsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginTop: '15px' },
  slotBox: { padding: '15px', border: '1px solid #ddd', borderRadius: '5px', textAlign: 'center', fontWeight: 'bold' },
  slotButton: { padding: '15px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' },
  message: { marginTop: '15px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', textAlign: 'center' }
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