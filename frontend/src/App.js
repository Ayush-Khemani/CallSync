import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateTime(value) {
  if (!value) return 'Not selected';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { email, password });

      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userId', response.data.userId);
        navigate('/dashboard');
      } else {
        setMessage('Registration successful. Please sign in.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error occurred');
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
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} style={styles.input} required />
          <button type="submit" style={styles.button}>{isLogin ? 'Sign in' : 'Create account'}</button>
        </form>

        <button onClick={() => setIsLogin(!isLogin)} style={styles.secondaryButton}>
          {isLogin ? 'Create new account' : 'Back to sign in'}
        </button>
        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState('meetings');
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/');
  };

  const handleGoogleAuth = () => {
    const params = new URLSearchParams({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/google`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      prompt: 'consent',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleOutlookAuth = () => {
    const params = new URLSearchParams({
      client_id: process.env.REACT_APP_OUTLOOK_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/outlook`,
      response_type: 'code',
      scope: 'Calendars.ReadWrite offline_access',
    });
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  };

  return (
    <div style={styles.appPage}>
      <main style={styles.dashboard}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>CallSync</h1>
            <p style={styles.subtitle}>Availability, links, and confirmations in one workflow</p>
          </div>
          <button onClick={handleLogout} style={styles.dangerButton}>Sign out</button>
        </header>

        <nav style={styles.tabs}>
          {[
            ['meetings', 'Meetings'],
            ['connect-calendar', 'Connect Calendar'],
            ['create-meeting', 'Create Meeting'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{ ...styles.tabButton, ...(activeTab === id ? styles.activeTabButton : {}) }}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'meetings' && <MeetingManagementTab />}
        {activeTab === 'connect-calendar' && <ConnectCalendarTab onGoogleAuth={handleGoogleAuth} onOutlookAuth={handleOutlookAuth} />}
        {activeTab === 'create-meeting' && <CreateMeetingTab />}
      </main>
    </div>
  );
}

function MeetingManagementTab() {
  const [meetings, setMeetings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchMeetings = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() });
      setMeetings(response.data.meetings || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error loading meetings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const getMeetingUrl = (uniqueLink) => `${window.location.origin}/select-slot/${uniqueLink}`;

  const copyMeetingLink = async (uniqueLink) => {
    const link = getMeetingUrl(uniqueLink);
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Meeting link copied');
    } catch (error) {
      setMessage(link);
    }
  };

  const cancelMeeting = async (uniqueLink) => {
    try {
      await axios.post(`${API_URL}/api/meetings/cancel/${uniqueLink}`, {}, { headers: authHeaders() });
      setMessage('Meeting cancelled');
      await fetchMeetings();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error cancelling meeting');
    }
  };

  return (
    <section style={styles.tabContent}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Meetings</h2>
          <p style={styles.mutedText}>Track requests, confirmations, links, and cancelled meetings.</p>
        </div>
        <button onClick={fetchMeetings} style={styles.secondaryActionButton}>Refresh</button>
      </div>

      {isLoading && <p style={styles.mutedText}>Loading meetings...</p>}
      {!isLoading && meetings.length === 0 && (
        <div style={styles.emptyState}>
          <h3 style={styles.cardTitle}>No meetings yet</h3>
          <p style={styles.mutedText}>Created meeting requests will appear here with their booking status and share link.</p>
        </div>
      )}

      {!isLoading && meetings.length > 0 && (
        <div style={styles.meetingList}>
          {meetings.map((meeting) => (
            <article key={meeting.id} style={styles.meetingRow}>
              <div style={styles.meetingMain}>
                <div style={styles.meetingTopLine}>
                  <h3 style={styles.cardTitle}>{meeting.attendeeName}</h3>
                  <span style={{ ...styles.statusBadge, ...(meeting.status === 'confirmed' ? styles.confirmedBadge : {}), ...(meeting.status === 'cancelled' ? styles.cancelledBadge : {}) }}>
                    {meeting.status}
                  </span>
                </div>
                <p style={styles.mutedText}>{meeting.attendeeEmail}</p>
                <div style={styles.meetingMetaGrid}>
                  <div><span style={styles.metaLabel}>Selected</span><strong style={styles.metaValue}>{formatDateTime(meeting.selectedSlot)}</strong></div>
                  <div><span style={styles.metaLabel}>Window</span><strong style={styles.metaValue}>{formatDateTime(meeting.firstSlot)} - {formatDateTime(meeting.lastSlot)}</strong></div>
                  <div><span style={styles.metaLabel}>Slots</span><strong style={styles.metaValue}>{meeting.slotCount}</strong></div>
                </div>
              </div>
              <div style={styles.meetingActions}>
                <a href={getMeetingUrl(meeting.uniqueLink)} target="_blank" rel="noreferrer" style={styles.linkButton}>Open</a>
                <button onClick={() => copyMeetingLink(meeting.uniqueLink)} style={styles.secondaryActionButton}>Copy</button>
                <button onClick={() => cancelMeeting(meeting.uniqueLink)} disabled={meeting.status === 'cancelled'} style={{ ...styles.dangerButton, ...(meeting.status === 'cancelled' ? styles.disabledButton : {}) }}>Cancel</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {message && <p style={styles.message}>{message}</p>}
    </section>
  );
}

function ConnectCalendarTab({ onGoogleAuth, onOutlookAuth }) {
  return (
    <section style={styles.tabContent}>
      <h2 style={styles.sectionTitle}>Calendar Connections</h2>
      <div style={styles.calendarOptions}>
        <div style={styles.calendarCard}>
          <h3 style={styles.cardTitle}>Google Calendar</h3>
          <p style={styles.mutedText}>Primary availability source for Gmail and Workspace users.</p>
          <button onClick={onGoogleAuth} style={{ ...styles.button, backgroundColor: '#4285f4' }}>Connect Google</button>
        </div>
        <div style={styles.calendarCard}>
          <h3 style={styles.cardTitle}>Outlook Calendar</h3>
          <p style={styles.mutedText}>Microsoft 365 calendar sync for work accounts.</p>
          <button onClick={onOutlookAuth} style={{ ...styles.button, backgroundColor: '#0078d4' }}>Connect Outlook</button>
        </div>
      </div>
    </section>
  );
}

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

  const fetchAvailableSlots = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, {
        params: { date: selectedDate, durationMinutes, bufferMinutes, slotIntervalMinutes, workStartHour, workEndHour, timeZone },
        headers: authHeaders(),
      });
      setAvailableSlots(response.data.availableSlots || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error fetching available slots');
    }
  };

  const toggleSlot = (slot) => {
    setSelectedSlots((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  };

  const handleCreateMeeting = async () => {
    if (!attendeeEmail || !attendeeName || selectedSlots.length === 0) {
      setMessage('Please fill all fields and select at least one slot');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/meetings/create`, { attendeeEmail, attendeeName, slots: selectedSlots }, { headers: authHeaders() });
      setMessage('Meeting created and email sent to the attendee');
      setAttendeeEmail('');
      setAttendeeName('');
      setSelectedDate('');
      setSelectedSlots([]);
      setAvailableSlots([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating meeting');
    }
  };

  return (
    <section style={styles.tabContent}>
      <h2 style={styles.sectionTitle}>Create Meeting Request</h2>
      <div style={styles.form}>
        <input type="email" placeholder="Attendee Email" value={attendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} style={styles.input} />
        <input type="text" placeholder="Attendee Name" value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} style={styles.input} />
        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={styles.input} />

        <div style={styles.preferencesGrid}>
          <label style={styles.fieldLabel}>Duration<select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} style={styles.input}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></label>
          <label style={styles.fieldLabel}>Buffer<select value={bufferMinutes} onChange={(event) => setBufferMinutes(Number(event.target.value))} style={styles.input}><option value={0}>None</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option><option value={30}>30 min</option></select></label>
          <label style={styles.fieldLabel}>Interval<select value={slotIntervalMinutes} onChange={(event) => setSlotIntervalMinutes(Number(event.target.value))} style={styles.input}><option value={15}>15 min</option><option value={30}>30 min</option><option value={60}>60 min</option></select></label>
          <label style={styles.fieldLabel}>Start<input type="number" min="0" max="23" value={workStartHour} onChange={(event) => setWorkStartHour(Number(event.target.value))} style={styles.input} /></label>
          <label style={styles.fieldLabel}>End<input type="number" min="1" max="24" value={workEndHour} onChange={(event) => setWorkEndHour(Number(event.target.value))} style={styles.input} /></label>
          <label style={styles.fieldLabel}>Timezone<input type="text" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} style={styles.input} /></label>
        </div>

        <button onClick={fetchAvailableSlots} style={styles.button}>Fetch Available Slots</button>
      </div>

      {availableSlots.length > 0 && (
        <div style={styles.slotsContainer}>
          <h3>Select Slots</h3>
          <div style={styles.slotsGrid}>
            {availableSlots.map((slot) => (
              <button key={slot} onClick={() => toggleSlot(slot)} style={{ ...styles.slotBox, ...(selectedSlots.includes(slot) ? styles.selectedSlotBox : {}) }}>
                {new Date(slot).toLocaleTimeString()}
              </button>
            ))}
          </div>
          <p>Selected: {selectedSlots.length} slots</p>
          <button onClick={handleCreateMeeting} style={{ ...styles.button, backgroundColor: '#28a745' }}>Create Meeting with {selectedSlots.length} Slots</button>
        </div>
      )}
      {message && <p style={styles.message}>{message}</p>}
    </section>
  );
}

function SelectSlotPage() {
  const [meeting, setMeeting] = useState(null);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const uniqueLink = window.location.pathname.split('/').pop();

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/meetings/${uniqueLink}`);
        setMeeting(response.data.meeting);
        setSlots(response.data.slots || []);
      } catch (error) {
        setMessage('Error loading meeting slots');
      }
    };
    fetchSlots();
  }, [uniqueLink]);

  const handleSelectSlot = async (slot) => {
    try {
      await axios.post(`${API_URL}/api/meetings/select-slot/${uniqueLink}`, { slotId: slot.id });
      setMessage('Slot selected. Confirmation email sent.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error selecting slot');
    }
  };

  return (
    <div style={styles.authPage}>
      <div style={styles.authCard}>
        <h1 style={styles.pageTitle}>Select Your Meeting Time</h1>
        {meeting?.status && <p style={{ ...styles.statusNotice, ...(meeting.status === 'confirmed' ? styles.confirmedNotice : {}), ...(meeting.status === 'cancelled' ? styles.cancelledNotice : {}) }}>Status: {meeting.status}{meeting.selectedSlot ? ` for ${formatDateTime(meeting.selectedSlot)}` : ''}</p>}
        {meeting?.status === 'cancelled' && <p style={styles.mutedText}>This meeting request is no longer available.</p>}
        <div style={styles.slotsGrid}>
          {meeting?.status !== 'cancelled' && slots.map((slot) => (
            <button key={slot.id} onClick={() => handleSelectSlot(slot)} disabled={meeting?.status === 'confirmed'} style={styles.slotButton}>
              {new Date(slot.slot_time).toLocaleString()}
            </button>
          ))}
        </div>
        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}

function GoogleAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      axios.post(`${API_URL}/api/auth/google-callback`, { code }, { headers: authHeaders() })
        .then(() => navigate('/dashboard'))
        .catch(() => navigate('/dashboard'));
    }
  }, [navigate]);

  return <div>Connecting Google Calendar...</div>;
}

function OutlookAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      axios.post(`${API_URL}/api/auth/outlook-callback`, { code }, { headers: authHeaders() })
        .then(() => navigate('/dashboard'))
        .catch(() => navigate('/dashboard'));
    }
  }, [navigate]);

  return <div>Connecting Outlook Calendar...</div>;
}

const styles = {
  authPage: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '24px', backgroundColor: '#eef2f6' },
  appPage: { minHeight: '100vh', padding: '32px', backgroundColor: '#eef2f6' },
  authCard: { backgroundColor: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 18px 60px rgba(15, 23, 42, 0.12)', maxWidth: '520px', width: '100%', border: '1px solid #dde5ee' },
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
  secondaryActionButton: { padding: '10px 14px', backgroundColor: '#f8fafc', color: '#102033', border: '1px solid #cfd8e3', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' },
  dangerButton: { padding: '10px 16px', backgroundColor: '#b42318', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' },
  disabledButton: { opacity: 0.5, cursor: 'not-allowed' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '26px', flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #dde5ee', paddingBottom: '8px', flexWrap: 'wrap' },
  tabButton: { padding: '10px 14px', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', color: '#334155', backgroundColor: '#fff', fontWeight: '700' },
  activeTabButton: { color: '#0f766e', backgroundColor: '#ecfdf5', borderColor: '#99f6e4' },
  tabContent: { marginTop: '8px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' },
  calendarOptions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '8px' },
  calendarCard: { padding: '20px', border: '1px solid #dde5ee', borderRadius: '8px', backgroundColor: '#fbfdff' },
  emptyState: { padding: '24px', border: '1px dashed #cfd8e3', borderRadius: '8px', backgroundColor: '#fbfdff' },
  meetingList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  meetingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '18px', padding: '18px', border: '1px solid #dde5ee', borderRadius: '8px', backgroundColor: '#fbfdff', flexWrap: 'wrap' },
  meetingMain: { flex: 1, minWidth: 0 },
  meetingTopLine: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' },
  meetingMetaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '14px' },
  metaLabel: { display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' },
  metaValue: { display: 'block', color: '#102033', fontSize: '14px', lineHeight: 1.4, overflowWrap: 'anywhere' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', minHeight: '24px', padding: '3px 9px', borderRadius: '999px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: '800', textTransform: 'capitalize' },
  confirmedBadge: { backgroundColor: '#dcfce7', color: '#166534' },
  cancelledBadge: { backgroundColor: '#fee2e2', color: '#991b1b' },
  statusNotice: { padding: '11px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '6px', border: '1px solid #fde68a', fontWeight: '700' },
  confirmedNotice: { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  cancelledNotice: { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' },
  meetingActions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' },
  linkButton: { padding: '10px 14px', backgroundColor: '#0f766e', color: '#fff', border: '1px solid #0f766e', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', textDecoration: 'none' },
  slotsContainer: { marginTop: '22px' },
  slotsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '10px', marginTop: '14px' },
  slotBox: { padding: '14px', border: '1px solid #cfd8e3', borderRadius: '6px', textAlign: 'center', fontWeight: '700', color: '#102033', backgroundColor: '#e9ecef', cursor: 'pointer' },
  selectedSlotBox: { backgroundColor: '#28a745', color: '#fff' },
  slotButton: { padding: '14px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' },
  message: { marginTop: '15px', padding: '11px', backgroundColor: '#ecfdf5', color: '#065f46', borderRadius: '6px', textAlign: 'center', border: '1px solid #99f6e4' },
};

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
