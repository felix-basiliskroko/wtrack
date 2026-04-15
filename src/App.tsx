import { useMemo, useState } from 'react';
import { WeightChart } from './components/WeightChart';
import { EntryPanel, EntryPayload } from './components/EntryPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { GoalSetter } from './components/GoalSetter';
import { HistoryPanel } from './components/HistoryPanel';
import { DataVault } from './components/DataVault';
import { MetabolismPanel } from './components/MetabolismPanel';
import { MomentumPanel } from './components/MomentumPanel';
import { DisplaySettingsPanel } from './components/DisplaySettingsPanel';
import { usePersistentState } from './hooks/usePersistentState';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_GOAL_WEIGHT,
  DEFAULT_METABOLIC_PROFILE,
  SEED_ENTRIES,
  STORAGE_KEYS,
} from './constants';
import { generatePredictions, summarizeProjection } from './utils/gaussianProcess';
import { DisplayPreferences, MetabolicProfile, WeightEntry } from './types';
import { convertWeight, formatShortDate, formatWeight } from './utils/formatting';

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
  const [preferences, setPreferences] = usePersistentState<DisplayPreferences>(
    STORAGE_KEYS.display,
    DEFAULT_DISPLAY_PREFERENCES,
  );
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  const predictions = useMemo(() => generatePredictions(entries, profile), [entries, profile]);
  const summary = useMemo(
    () => summarizeProjection(entries, predictions, goalWeight),
    [entries, predictions, goalWeight],
  );
  const latestEntry = entries.length ? entries[entries.length - 1] : undefined;
  const etaLabel = summary?.projectedGoalDate
    ? formatShortDate(summary.projectedGoalDate, preferences.dateFormat)
    : 'Need more data';
  const paceLabel = summary
    ? `${summary.pacePerWeek <= 0 ? '' : '+'}${convertWeight(summary.pacePerWeek, preferences.weightUnit).toFixed(1)} ${preferences.weightUnit}/wk`
    : '--';

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
                <WeightChart
                  entries={entries}
                  predictions={predictions}
                  goalWeight={goalWeight}
                  preferences={preferences}
                />
              </div>
              <SummaryPanel
                summary={summary}
                entries={entries}
                predictions={predictions}
                goalWeight={goalWeight}
                preferences={preferences}
              />
              <MomentumPanel summary={summary} goalWeight={goalWeight} preferences={preferences} />
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
            <EntryPanel onAddEntry={handleAddEntry} preferences={preferences} />
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
              <HistoryPanel entries={entries} preferences={preferences} />
              <section className="chart-panel compact-panel">
                <div className="chart-frame compact-chart-frame">
                  <WeightChart
                    entries={entries}
                    predictions={predictions}
                    goalWeight={goalWeight}
                    preferences={preferences}
                  />
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
              <GoalSetter
                goalWeight={goalWeight}
                latestEntry={latestEntry}
                preferences={preferences}
                onChange={setGoalWeight}
              />
              <MomentumPanel summary={summary} goalWeight={goalWeight} preferences={preferences} />
            </div>
            <SummaryPanel
              summary={summary}
              entries={entries}
              predictions={predictions}
              goalWeight={goalWeight}
              preferences={preferences}
            />
          </section>
        );
      case 'settings':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Preferences and data</p>
                <h2>Settings</h2>
              </div>
            </div>
            <DisplaySettingsPanel preferences={preferences} onChange={setPreferences} />
            <div className="dual-grid">
              <MetabolismPanel profile={profile} onChange={setProfile} />
              <DataVault
                entries={entries}
                profile={profile}
                goalWeight={goalWeight}
                preferences={preferences}
              />
            </div>
          </section>
        );
    }
  };

  return (
    <div
      className={`app-shell theme-${preferences.theme} density-${preferences.density} nav-${preferences.navigationStyle} motion-${preferences.motion}`}
    >
      <header className="topbar">
        <div className="brand-block">
          <p className="label">Personal tracker</p>
          <h1>WTrack</h1>
        </div>
        <div className="topbar-actions">
          <div className="status-strip">
            <div className="status-tile">
              <span className="label">Current</span>
              <strong>{latestEntry ? formatWeight(latestEntry.weight, preferences.weightUnit) : '--'}</strong>
            </div>
            <div className="status-tile">
              <span className="label">Goal</span>
              <strong>{formatWeight(goalWeight, preferences.weightUnit)}</strong>
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
