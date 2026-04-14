import { useMemo, useState } from 'react';
import { WeightChart } from './components/WeightChart';
import { EntryPanel, EntryPayload } from './components/EntryPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { GoalSetter } from './components/GoalSetter';
import { HistoryPanel } from './components/HistoryPanel';
import { DataVault } from './components/DataVault';
import { MetabolismPanel } from './components/MetabolismPanel';
import { MomentumPanel } from './components/MomentumPanel';
import { usePersistentState } from './hooks/usePersistentState';
import { DEFAULT_GOAL_WEIGHT, DEFAULT_METABOLIC_PROFILE, SEED_ENTRIES, STORAGE_KEYS } from './constants';
import { generatePredictions, summarizeProjection } from './utils/gaussianProcess';
import { MetabolicProfile, WeightEntry } from './types';

type ViewId = 'dashboard' | 'log' | 'history' | 'goal' | 'settings';

const views: Array<{ id: ViewId; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'log', label: 'Log Entry' },
  { id: 'history', label: 'History' },
  { id: 'goal', label: 'Goal' },
  { id: 'settings', label: 'Settings' },
];

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEntry = (payload: EntryPayload): WeightEntry => ({
  id: makeId(),
  timestamp: payload.timestamp,
  weight: payload.weight,
  workout: payload.workout,
});

function App() {
  const [entries, setEntries] = usePersistentState<WeightEntry[]>(STORAGE_KEYS.entries, SEED_ENTRIES);
  const [profile, setProfile] = usePersistentState<MetabolicProfile>(
    STORAGE_KEYS.profile,
    DEFAULT_METABOLIC_PROFILE,
  );
  const [goalWeight, setGoalWeight] = usePersistentState<number>(STORAGE_KEYS.goal, DEFAULT_GOAL_WEIGHT);
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  const predictions = useMemo(() => generatePredictions(entries, profile), [entries, profile]);
  const summary = useMemo(
    () => summarizeProjection(entries, predictions, goalWeight),
    [entries, predictions, goalWeight],
  );
  const latestEntry = entries.length ? entries[entries.length - 1] : undefined;
  const etaLabel = summary?.projectedGoalDate
    ? summary.projectedGoalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'Need more data';
  const paceLabel = summary ? `${summary.pacePerWeek <= 0 ? '' : '+'}${summary.pacePerWeek.toFixed(1)} kg/wk` : '--';

  const handleAddEntry = (payload: EntryPayload) => {
    setEntries((prev) => {
      const next = [...prev, createEntry(payload)];
      return next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });
    setActiveView('dashboard');
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <section className="view-stack">
            <section className="chart-panel">
              <div className="chart-frame">
                <WeightChart entries={entries} predictions={predictions} goalWeight={goalWeight} />
              </div>
              <SummaryPanel
                summary={summary}
                entries={entries}
                predictions={predictions}
                goalWeight={goalWeight}
              />
              <MomentumPanel summary={summary} goalWeight={goalWeight} profile={profile} />
            </section>
          </section>
        );
      case 'log':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Daily workflow</p>
                <h2>Log a new checkpoint</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setActiveView('history')}>
                Review history
              </button>
            </div>
            <EntryPanel onAddEntry={handleAddEntry} />
          </section>
        );
      case 'history':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Recorded data</p>
                <h2>Weight timeline</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setActiveView('log')}>
                Add entry
              </button>
            </div>
            <div className="dual-grid">
              <HistoryPanel entries={entries} />
              <section className="chart-panel compact-panel">
                <div className="chart-frame compact-chart-frame">
                  <WeightChart entries={entries} predictions={predictions} goalWeight={goalWeight} />
                </div>
              </section>
            </div>
          </section>
        );
      case 'goal':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Targeting</p>
                <h2>Goal and pace</h2>
              </div>
            </div>
            <div className="dual-grid">
              <GoalSetter goalWeight={goalWeight} latestEntry={latestEntry} onChange={setGoalWeight} />
              <MomentumPanel summary={summary} goalWeight={goalWeight} profile={profile} />
            </div>
            <SummaryPanel summary={summary} entries={entries} predictions={predictions} goalWeight={goalWeight} />
          </section>
        );
      case 'settings':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Model and data</p>
                <h2>Settings</h2>
              </div>
            </div>
            <div className="dual-grid">
              <MetabolismPanel profile={profile} onChange={setProfile} />
              <DataVault entries={entries} profile={profile} goalWeight={goalWeight} />
            </div>
          </section>
        );
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="label">Personal tracker</p>
          <h1>WTrack</h1>
        </div>
        <div className="topbar-actions">
          <div className="status-strip">
            <div className="status-tile">
              <span className="label">Current</span>
              <strong>{latestEntry ? `${latestEntry.weight.toFixed(1)} kg` : '--'}</strong>
            </div>
            <div className="status-tile">
              <span className="label">Goal</span>
              <strong>{goalWeight.toFixed(1)} kg</strong>
            </div>
            <div className="status-tile">
              <span className="label">ETA</span>
              <strong>{etaLabel}</strong>
            </div>
            <div className="status-tile">
              <span className="label">Pace</span>
              <strong>{paceLabel}</strong>
            </div>
          </div>
          <button type="button" className="primary-button" onClick={() => setActiveView('log')}>
            Log weight
          </button>
        </div>
      </header>

      <div className="app-frame">
        <aside className="sidebar">
          <nav className="nav-stack" aria-label="Primary">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`nav-button ${activeView === view.id ? 'active' : ''}`}
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="app-main">{renderView()}</main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`bottom-nav-button ${activeView === view.id ? 'active' : ''}`}
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
