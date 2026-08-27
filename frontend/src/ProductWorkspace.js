import React, { useEffect, useState } from 'react';
import TodayView from './TodayView';
import PipelineView from './PipelineView';
import CreateMeetingView from './CreateMeetingView';
import CalendarsView from './CalendarsView';
import { Brand } from './workspaceShared';
import './ProductWorkspace.css';

export default function ProductWorkspace() {
  const [tab, setTab] = useState('today');

  useEffect(() => {
    if (!localStorage.getItem('token')) window.location.replace('/login');
  }, []);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    window.location.assign('/');
  }

  const navigation = [
    ['today', 'Today', '●'],
    ['pipeline', 'Pipeline', '▦'],
    ['create', 'New meeting', '+'],
    ['calendars', 'Calendars', '◫'],
  ];

  return (
    <main className="pw-shell">
      <aside className="pw-sidebar">
        <div>
          <Brand />
          <nav className="pw-nav" aria-label="Workspace navigation">
            {navigation.map(([id, label, icon]) => (
              <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>
            ))}
          </nav>
        </div>
        <div className="pw-sidebar-foot">
          <div className="pw-sidebar-note"><span>Workspace</span><strong>Meeting OS</strong><small>Create → book → prepare → remember</small></div>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="pw-main">
        {tab === 'today' && <TodayView onCreate={() => setTab('create')} onPipeline={() => setTab('pipeline')} />}
        {tab === 'pipeline' && <PipelineView onCreate={() => setTab('create')} />}
        {tab === 'create' && <CreateMeetingView onDone={() => setTab('pipeline')} />}
        {tab === 'calendars' && <CalendarsView />}
      </section>
    </main>
  );
}
