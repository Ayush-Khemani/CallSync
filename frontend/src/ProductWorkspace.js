import React, { useEffect, useState } from 'react';
import TodayView from './TodayView';
import PipelineView from './PipelineView';
import RelationshipsView from './RelationshipsView';
import ActionsView from './ActionsView';
import CreateMeetingView from './CreateMeetingView';
import CalendarsView from './CalendarsView';
import { Brand } from './workspaceShared';
import './ProductWorkspace.css';
import './WorkspaceRefinement.css';

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
    ['today', 'Today'],
    ['pipeline', 'Meetings'],
    ['relationships', 'People'],
    ['actions', 'Tasks'],
  ];

  return (
    <main className="pw-shell">
      <aside className="pw-sidebar">
        <div>
          <Brand />
          <nav className="pw-nav" aria-label="Workspace navigation">
            {navigation.map(([id, label]) => (
              <button type="button" key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <button className="pw-sidebar-create" type="button" onClick={() => setTab('create')}>New meeting</button>
        </div>
        <div className="pw-sidebar-foot">
          <button className={tab === 'calendars' ? 'pw-sidebar-utility active' : 'pw-sidebar-utility'} type="button" onClick={() => setTab('calendars')}>Calendars</button>
          <button className="pw-sidebar-signout" type="button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <section className="pw-main">
        {tab === 'today' && <TodayView onCreate={() => setTab('create')} onPipeline={() => setTab('pipeline')} />}
        {tab === 'pipeline' && <PipelineView onCreate={() => setTab('create')} />}
        {tab === 'relationships' && <RelationshipsView />}
        {tab === 'actions' && <ActionsView />}
        {tab === 'create' && <CreateMeetingView onDone={() => setTab('pipeline')} />}
        {tab === 'calendars' && <CalendarsView />}
      </section>
    </main>
  );
}
