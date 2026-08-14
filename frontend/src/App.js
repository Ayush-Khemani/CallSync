import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

const API_URL = (process.env.REACT_APP_API_URL || 'https://callsync-backend.vercel.app').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Brand() {
  return <span className="brand"><span>CS</span><strong>CallSync</strong></span>;
}

function formatDateTime(value) {
  if (!value) return 'Not selected';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function LandingPage() {
  const hasToken = Boolean(localStorage.getItem('token'));
  return (
    <main className="landing">
      <nav className="topbar">
        <Brand />
        <div>
          <a href="#workflow">Workflow</a>
          <a href="#teams">Teams</a>
          <Link to="/login">Sign in</Link>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-art" aria-hidden="true">
          <div className="calendar-glass">
            <header><span>Today</span><b>12 open windows</b></header>
            {['09:00', '10:30', '12:00', '14:00', '15:30'].map((time, index) => (
              <p className={`bar b${index + 1}`} key={time}><span>{time}</span><i /></p>
            ))}
          </div>
          <div className="floating-note"><b>Priya selected 2:30 PM</b><span>Confirmed with calendar hold</span></div>
          <div className="flow-note"><span>Google</span><i /><span>Outlook</span><i /><span>Email sent</span></div>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Calendar-first scheduling for modern teams</p>
          <h1>CallSync turns scattered availability into confirmed meetings.</h1>
          <p>Create polished booking requests, share curated time windows, and let guests pick a slot without the back-and-forth.</p>
          <div className="hero-actions">
            <Link className="btn primary" to={hasToken ? '/dashboard' : '/login'}>{hasToken ? 'Open dashboard' : 'Start scheduling'}</Link>
            <a className="btn light" href="#workflow">See workflow</a>
          </div>
        </div>
      </section>
      <section className="proof">
        <article><b>3-step flow</b><span>Create, share, confirm</span></article>
        <article><b>Calendar aware</b><span>Google and Outlook ready</span></article>
        <article><b>Host control</b><span>Status, links, cancellations</span></article>
      </section>
      <section className="section" id="workflow">
        <p className="eyebrow">Built for real coordination</p>
        <h2>Every invite moves through a clear operating system.</h2>
        <div className="features">
          {[
            ['01', 'Design the meeting window', 'Pick date, duration, buffer, interval, timezone, and working hours before sharing anything.'],
            ['02', 'Send one clean link', 'Guests choose from approved slots, so hosts stay in control without managing reply threads.'],
            ['03', 'Track the outcome', 'See pending, confirmed, and cancelled meetings in one dashboard with copyable booking links.'],
          ].map(([num, title, text]) => <article key={num}><span>{num}</span><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>
      <section className="section split" id="teams">
        <div><p className="eyebrow">Why it matters</p><h2>Scheduling should feel like infrastructure, not admin work.</h2></div>
        <div className="mini-grid">
          <article><b>Less friction</b><span>Remove the back-and-forth before calls begin.</span></article>
          <article><b>More trust</b><span>Give every invitee a fast, intentional booking experience.</span></article>
        </div>
      </section>
    </main>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { email, password });
      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userId', response.data.userId);
        navigate('/dashboard');
      } else {
        setMessage('Account created. Sign in to open your workspace.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <Link to="/"><Brand /></Link>
        <div><p className="eyebrow">Welcome to CallSync</p><h1>{isLogin ? 'Sign in to your scheduling command center.' : 'Create your CallSync workspace.'}</h1><p>Manage availability, booking links, and meeting confirmations from one focused workspace.</p></div>
        <aside><span>Next best action</span><b>Review 4 pending invite links</b><small>Dashboard ready after sign-in</small></aside>
      </section>
      <section className="panel auth-panel">
        <p className="eyebrow">{isLogin ? 'Existing workspace' : 'New workspace'}</p>
        <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
        <p>{isLogin ? 'Use your CallSync credentials to continue.' : 'Start with an email and secure password.'}</p>
        <form className="form" onSubmit={submit}>
          <label>Email<input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Working...' : isLogin ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link-button" onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Create a new account' : 'Back to sign in'}</button>
        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

function Dashboard() {
  const [tab, setTab] = useState('meetings');
  const navigate = useNavigate();
  const tabs = [['meetings', 'Meetings'], ['create', 'Create'], ['calendars', 'Calendars']];

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/');
  }

  function oauth(provider) {
    const isGoogle = provider === 'google';
    const params = new URLSearchParams({
      client_id: process.env[isGoogle ? 'REACT_APP_GOOGLE_CLIENT_ID' : 'REACT_APP_OUTLOOK_CLIENT_ID'],
      redirect_uri: `${window.location.origin}/auth/${provider}`,
      response_type: 'code',
      scope: isGoogle ? 'https://www.googleapis.com/auth/calendar' : 'Calendars.ReadWrite offline_access',
      ...(isGoogle ? { access_type: 'offline', prompt: 'consent' } : {}),
    });
    window.location.href = isGoogle
      ? `https://accounts.google.com/o/oauth2/v2/auth?${params}`
      : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <Brand />
        <nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <button className="logout" onClick={logout}>Sign out</button>
      </aside>
      <section className="main">
        <header className="main-head"><div><p className="eyebrow">Host workspace</p><h1>Run meeting coordination from one desk.</h1></div><button className="btn primary" onClick={() => setTab('create')}>New request</button></header>
        {tab === 'meetings' && <Meetings />}
        {tab === 'create' && <CreateMeeting />}
        {tab === 'calendars' && <Calendars onGoogle={() => oauth('google')} onOutlook={() => oauth('outlook')} />}
      </section>
    </main>
  );
}

function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const stats = useMemo(() => ({
    total: meetings.length,
    confirmed: meetings.filter((m) => m.status === 'confirmed').length,
    pending: meetings.filter((m) => m.status === 'pending').length,
  }), [meetings]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/meetings`, { headers: authHeaders() });
      setMeetings(response.data.meetings || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error loading meetings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const url = (link) => `${window.location.origin}/select-slot/${link}`;
  async function copy(link) {
    try {
      await navigator.clipboard.writeText(url(link));
      setMessage('Meeting link copied.');
    } catch {
      setMessage(url(link));
    }
  }
  async function cancel(link) {
    try {
      await axios.post(`${API_URL}/api/meetings/cancel/${link}`, {}, { headers: authHeaders() });
      setMessage('Meeting cancelled.');
      load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error cancelling meeting');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Meetings</h2><p>Track requests, confirmations, links, and cancelled meetings.</p></div><button className="btn light" onClick={load}>Refresh</button></div>
      <div className="stats">{Object.entries(stats).map(([label, value]) => <article key={label}><span>{label}</span><b>{value}</b></article>)}</div>
      {loading && <div className="empty">Loading meetings...</div>}
      {!loading && !meetings.length && <div className="empty"><h3>No meetings yet</h3><p>Created meeting requests will appear here with status and share links.</p></div>}
      {!!meetings.length && <div className="meeting-list">{meetings.map((meeting) => (
        <article className="meeting" key={meeting.id}>
          <div><header><h3>{meeting.attendeeName}</h3><span className={`badge ${meeting.status}`}>{meeting.status}</span></header><p>{meeting.attendeeEmail}</p>
            <div className="meta"><span>Selected <b>{formatDateTime(meeting.selectedSlot)}</b></span><span>Window <b>{formatDateTime(meeting.firstSlot)} - {formatDateTime(meeting.lastSlot)}</b></span><span>Slots <b>{meeting.slotCount}</b></span></div>
          </div>
          <aside><a className="btn primary small" href={url(meeting.uniqueLink)} target="_blank" rel="noreferrer">Open</a><button className="btn light small" onClick={() => copy(meeting.uniqueLink)}>Copy</button><button className="btn danger small" disabled={meeting.status === 'cancelled'} onClick={() => cancel(meeting.uniqueLink)}>Cancel</button></aside>
        </article>
      ))}</div>}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function Calendars({ onGoogle, onOutlook }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Calendar Connections</h2><p>Connect calendar sources so generated slots reflect real availability.</p></div></div>
      <div className="integrations">
        <article className="google"><span>Google Calendar</span><h3>Sync Gmail and Workspace availability.</h3><p>Use your primary Google calendar as the source of truth for open slots.</p><button className="btn primary" onClick={onGoogle}>Connect Google</button></article>
        <article className="outlook"><span>Outlook Calendar</span><h3>Bring Microsoft 365 into the same flow.</h3><p>Coordinate with work calendars while keeping the host workflow unchanged.</p><button className="btn primary" onClick={onOutlook}>Connect Outlook</button></article>
      </div>
    </section>
  );
}

function CreateMeeting() {
  const [form, setForm] = useState({ attendeeEmail: '', attendeeName: '', selectedDate: '', durationMinutes: 60, bufferMinutes: 0, slotIntervalMinutes: 30, workStartHour: 9, workEndHour: 17, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [slots, setSlots] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function fetchSlots() {
    setMessage('');
    try {
      const response = await axios.get(`${API_URL}/api/calendar/available-slots`, { params: { date: form.selectedDate, ...form }, headers: authHeaders() });
      setSlots(response.data.availableSlots || []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error fetching available slots');
    }
  }
  async function create() {
    if (!form.attendeeEmail || !form.attendeeName || selected.length === 0) {
      setMessage('Please fill all fields and select at least one slot.');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/meetings/create`, { attendeeEmail: form.attendeeEmail, attendeeName: form.attendeeName, slots: selected }, { headers: authHeaders() });
      setMessage('Meeting created and email sent to the attendee.');
      setForm({ ...form, attendeeEmail: '', attendeeName: '', selectedDate: '' });
      setSlots([]);
      setSelected([]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error creating meeting');
    }
  }
  function toggle(slot) {
    setSelected((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);
  }

  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Create Meeting Request</h2><p>Shape the invite before it leaves your workspace.</p></div></div>
      <div className="create-grid">
        <form className="form">
          <label>Attendee email<input type="email" placeholder="guest@company.com" value={form.attendeeEmail} onChange={(e) => set('attendeeEmail', e.target.value)} /></label>
          <label>Attendee name<input type="text" placeholder="Guest name" value={form.attendeeName} onChange={(e) => set('attendeeName', e.target.value)} /></label>
          <label>Meeting date<input type="date" value={form.selectedDate} onChange={(e) => set('selectedDate', e.target.value)} /></label>
          <div className="prefs">
            <label>Duration<select value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))}>{[15, 30, 45, 60].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
            <label>Buffer<select value={form.bufferMinutes} onChange={(e) => set('bufferMinutes', Number(e.target.value))}>{[0, 5, 10, 15, 30].map((v) => <option key={v} value={v}>{v ? `${v} min` : 'None'}</option>)}</select></label>
            <label>Interval<select value={form.slotIntervalMinutes} onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}>{[15, 30, 60].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
            <label>Start<input type="number" min="0" max="23" value={form.workStartHour} onChange={(e) => set('workStartHour', Number(e.target.value))} /></label>
            <label>End<input type="number" min="1" max="24" value={form.workEndHour} onChange={(e) => set('workEndHour', Number(e.target.value))} /></label>
            <label>Timezone<input value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)} /></label>
          </div>
          <button type="button" className="btn primary" onClick={fetchSlots}>Find available slots</button>
        </form>
        <aside className="slot-panel"><p className="eyebrow">Selected slots</p><h3>{selected.length} ready to share</h3><p>Choose the moments your guest can book from.</p>{slots.length ? <div className="slot-grid">{slots.map((slot) => <button className={selected.includes(slot) ? 'slot selected' : 'slot'} key={slot} onClick={() => toggle(slot)}>{new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div> : <div className="empty dark">Available slots will appear here.</div>} {!!slots.length && <button className="btn success" onClick={create}>Create request with {selected.length} slots</button>}</aside>
      </div>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

function SelectSlotPage() {
  const [meeting, setMeeting] = useState(null);
  const [slots, setSlots] = useState([]);
  const [message, setMessage] = useState('');
  const uniqueLink = window.location.pathname.split('/').pop();
  useEffect(() => {
    axios.get(`${API_URL}/api/meetings/${uniqueLink}`).then((response) => {
      setMeeting(response.data.meeting);
      setSlots(response.data.slots || []);
    }).catch(() => setMessage('Error loading meeting slots'));
  }, [uniqueLink]);
  async function choose(slot) {
    try {
      await axios.post(`${API_URL}/api/meetings/select-slot/${uniqueLink}`, { slotId: slot.id });
      setMessage('Slot selected. Confirmation email sent.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error selecting slot');
    }
  }
  return (
    <main className="booking-screen">
      <section className="panel booking"><Brand /><p className="eyebrow">Meeting invite</p><h1>Select your meeting time</h1><p>Choose the time that works best from the host-approved options.</p>{meeting?.status && <p className={`notice ${meeting.status}`}>Status: {meeting.status}{meeting.selectedSlot ? ` for ${formatDateTime(meeting.selectedSlot)}` : ''}</p>}{meeting?.status === 'cancelled' && <p>This meeting request is no longer available.</p>}<div className="slot-grid">{meeting?.status !== 'cancelled' && slots.map((slot) => <button className="slot" disabled={meeting?.status === 'confirmed'} key={slot.id} onClick={() => choose(slot)}>{new Date(slot.slot_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</button>)}</div>{message && <p className="message">{message}</p>}</section>
    </main>
  );
}

function CalendarCallback({ provider }) {
  const navigate = useNavigate();
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) axios.post(`${API_URL}/api/auth/${provider}-callback`, { code }, { headers: authHeaders() }).finally(() => navigate('/dashboard'));
  }, [navigate, provider]);
  return <main className="callback">Connecting {provider === 'google' ? 'Google' : 'Outlook'} Calendar...</main>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/select-slot/:uniqueLink" element={<SelectSlotPage />} />
        <Route path="/auth/google" element={<CalendarCallback provider="google" />} />
        <Route path="/auth/outlook" element={<CalendarCallback provider="outlook" />} />
      </Routes>
    </Router>
  );
}
