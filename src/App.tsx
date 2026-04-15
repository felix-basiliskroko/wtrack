import { useEffect, useMemo, useState } from 'react';
import { WeightChart } from './components/WeightChart';
import { EntryPanel, EntryPayload } from './components/EntryPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { GoalSetter } from './components/GoalSetter';
import { HistoryPanel } from './components/HistoryPanel';
import { DataVault } from './components/DataVault';
import { MetabolismPanel } from './components/MetabolismPanel';
import { MomentumPanel } from './components/MomentumPanel';
import { DisplaySettingsPanel } from './components/DisplaySettingsPanel';
import { WeeklyReviewPanel } from './components/WeeklyReviewPanel';
import { MilestonesPanel } from './components/MilestonesPanel';
import { usePersistentState } from './hooks/usePersistentState';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_GOAL_WEIGHT,
  DEFAULT_METABOLIC_PROFILE,
  SEED_ENTRIES,
  STORAGE_KEYS,
} from './constants';
import { generatePredictions, summarizeProjection } from './utils/gaussianProcess';
import { BackupPayload, BackupStatus, DisplayPreferences, MetabolicProfile, WeightEntry } from './types';
import { buildBackupPayload, hashBackupPayload } from './utils/backup';
import { convertWeight, formatShortDate, formatWeight } from './utils/formatting';

type ViewId = 'dashboard' | 'log' | 'review' | 'history' | 'goal' | 'settings';

const primaryViews: Array<{ id: ViewId; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
];

const secondaryViews: Array<{ id: ViewId; label: string }> = [
  { id: 'review', label: 'Review' },
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
  note: payload.note,
});

const EMPTY_BACKUP_STATUS: BackupStatus = {
  available: false,
  lastBackupAt: null,
  latestHash: null,
  latestFilename: null,
  count: 0,
};

function App() {
  const [entries, setEntries] = usePersistentState<WeightEntry[]>(STORAGE_KEYS.entries, SEED_ENTRIES);
  const [profile, setProfile] = usePersistentState<MetabolicProfile>(
    STORAGE_KEYS.profile,
    DEFAULT_METABOLIC_PROFILE,
  );
  const [goalWeight, setGoalWeight] = usePersistentState<number>(STORAGE_KEYS.goal, DEFAULT_GOAL_WEIGHT);
  const [storedPreferences, setPreferences] = usePersistentState<DisplayPreferences>(
    STORAGE_KEYS.display,
    DEFAULT_DISPLAY_PREFERENCES,
  );
  const preferences = useMemo(
    () => ({ ...DEFAULT_DISPLAY_PREFERENCES, ...storedPreferences }),
    [storedPreferences],
  );
  const backupPayload = useMemo(
    () => buildBackupPayload(entries, profile, goalWeight, preferences),
    [entries, profile, goalWeight, preferences],
  );
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(EMPTY_BACKUP_STATUS);
  const [backupPending, setBackupPending] = useState(false);
  const [backupStatusLoaded, setBackupStatusLoaded] = useState(false);
  const [currentBackupHash, setCurrentBackupHash] = useState<string | null>(null);

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
  const backupDisabled =
    !backupStatus.available || backupPending || !currentBackupHash || backupStatus.latestHash === currentBackupHash;

  const handleAddEntry = (payload: EntryPayload) => {
    setEntries((prev) => {
      const next = [...prev, createEntry(payload)];
      return next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });
    setActiveView('dashboard');
    setMenuOpen(false);
  };

  const handleUpdateEntry = (id: string, payload: EntryPayload) => {
    setEntries((prev) =>
      prev
        .map((entry) =>
          entry.id === id
            ? { ...entry, timestamp: payload.timestamp, weight: payload.weight, workout: payload.workout, note: payload.note }
            : entry,
        )
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    );
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleResetDisplaySettings = () => {
    setPreferences(DEFAULT_DISPLAY_PREFERENCES);
  };

  const handleRestoreBackup = (payload: BackupPayload) => {
    const nextEntries = Array.isArray(payload.entries)
      ? payload.entries
          .filter((entry) => typeof entry?.timestamp === 'string' && Number.isFinite(entry?.weight))
          .map((entry) => ({
            ...entry,
            id: entry.id || makeId(),
          }))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : SEED_ENTRIES;

    const nextProfile = payload.metabolicProfile
      ? { ...DEFAULT_METABOLIC_PROFILE, ...payload.metabolicProfile }
      : DEFAULT_METABOLIC_PROFILE;

    const nextGoalWeight =
      typeof payload.goalWeight === 'number' && Number.isFinite(payload.goalWeight)
        ? payload.goalWeight
        : DEFAULT_GOAL_WEIGHT;

    const nextPreferences = payload.displayPreferences
      ? { ...DEFAULT_DISPLAY_PREFERENCES, ...payload.displayPreferences }
      : DEFAULT_DISPLAY_PREFERENCES;

    setEntries(nextEntries);
    setProfile(nextProfile);
    setGoalWeight(nextGoalWeight);
    setPreferences(nextPreferences);
    setActiveView('dashboard');
    setMenuOpen(false);
  };

  const refreshBackupStatus = async () => {
    try {
      const response = await fetch('/api/backups/status');
      if (!response.ok) throw new Error(`status ${response.status}`);
      const nextStatus = (await response.json()) as BackupStatus;
      setBackupStatus(nextStatus);
    } catch (error) {
      console.warn('Backup status unavailable', error);
      setBackupStatus(EMPTY_BACKUP_STATUS);
    } finally {
      setBackupStatusLoaded(true);
    }
  };

  const runBackup = async () => {
    setBackupPending(true);
    try {
      const response = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupPayload),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const nextStatus = (await response.json()) as BackupStatus;
      setBackupStatus(nextStatus);
    } catch (error) {
      console.warn('Backup failed', error);
      await refreshBackupStatus();
    } finally {
      setBackupPending(false);
    }
  };

  const handleViewChange = (view: ViewId) => {
    setActiveView(view);
    setMenuOpen(false);
  };

  useEffect(() => {
    void refreshBackupStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void hashBackupPayload(backupPayload).then((hash) => {
      if (!cancelled) {
        setCurrentBackupHash(hash);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [backupPayload]);

  useEffect(() => {
    if (!backupStatusLoaded || !backupStatus.available || !currentBackupHash) return;
    if (backupStatus.latestHash === currentBackupHash) return;

    const timeoutId = window.setTimeout(() => {
      void runBackup();
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [backupPayload, backupStatus.available, backupStatus.latestHash, backupStatusLoaded, currentBackupHash]);

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
              <MilestonesPanel entries={entries} goalWeight={goalWeight} preferences={preferences} />
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
              <button type="button" className="ghost-button" onClick={() => handleViewChange('history')}>
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
              <button type="button" className="ghost-button" onClick={() => handleViewChange('log')}>
                Add entry
              </button>
            </div>
            <div className="dual-grid">
              <HistoryPanel
                entries={entries}
                preferences={preferences}
                onDeleteEntry={handleDeleteEntry}
                onUpdateEntry={handleUpdateEntry}
              />
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
      case 'review':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Check-in</p>
                <h2>Weekly review</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => handleViewChange('log')}>
                Log another entry
              </button>
            </div>
            <WeeklyReviewPanel entries={entries} preferences={preferences} summary={summary} />
            <div className="dual-grid">
              <SummaryPanel
                summary={summary}
                entries={entries}
                predictions={predictions}
                goalWeight={goalWeight}
                preferences={preferences}
              />
              <MomentumPanel summary={summary} goalWeight={goalWeight} preferences={preferences} />
            </div>
            <MilestonesPanel entries={entries} goalWeight={goalWeight} preferences={preferences} />
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
            <DisplaySettingsPanel
              preferences={preferences}
              onChange={setPreferences}
              onReset={handleResetDisplaySettings}
            />
            <div className="dual-grid">
              <MetabolismPanel profile={profile} onChange={setProfile} />
              <DataVault
                entries={entries}
                profile={profile}
                goalWeight={goalWeight}
                preferences={preferences}
                onRestore={handleRestoreBackup}
                backupStatus={backupStatus}
                backupDisabled={backupDisabled}
                backupPending={backupPending}
                onManualBackup={() => void runBackup()}
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
        <div className="topbar-main">
          <div className="brand-block">
            <p className="label">Personal tracker</p>
            <h1>WTrack</h1>
          </div>
          <button type="button" className="primary-button topbar-log-button" onClick={() => handleViewChange('log')}>
            Log weight
          </button>
        </div>
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
      </header>

      <div className="app-frame">
        <aside className="sidebar">
          <nav className="nav-stack" aria-label="Primary">
            {primaryViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`nav-button ${view.id === 'dashboard' ? 'nav-home-button' : ''} ${activeView === view.id ? 'active' : ''}`}
                onClick={() => handleViewChange(view.id)}
              >
                {view.label}
              </button>
            ))}
            <div className={`more-nav ${menuOpen ? 'open' : ''}`}>
              <button
                type="button"
                className={`nav-button nav-menu-button ${secondaryViews.some((view) => view.id === activeView) ? 'active' : ''}`}
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-label="Open more navigation"
              >
                <span className="menu-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                More
              </button>
              {menuOpen ? (
                <div className="more-menu" role="menu">
                  {secondaryViews.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      className={`more-menu-button ${activeView === view.id ? 'active' : ''}`}
                      onClick={() => handleViewChange(view.id)}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>
        </aside>

        <main className="app-main">{renderView()}</main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {primaryViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`bottom-nav-button ${view.id === 'dashboard' ? 'bottom-home-button' : ''} ${activeView === view.id ? 'active' : ''}`}
            onClick={() => handleViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
        <div className={`bottom-more ${menuOpen ? 'open' : ''}`}>
          <button
            type="button"
            className={`bottom-nav-button bottom-menu-button ${secondaryViews.some((view) => view.id === activeView) ? 'active' : ''}`}
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-label="Open more navigation"
          >
            <span className="menu-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            More
          </button>
          {menuOpen ? (
            <div className="bottom-more-menu" role="menu">
              {secondaryViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={`more-menu-button ${activeView === view.id ? 'active' : ''}`}
                  onClick={() => handleViewChange(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}

export default App;
