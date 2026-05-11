import { useEffect, useMemo, useState } from 'react';
import { Hero } from './components/Hero';
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
import { VaultGate } from './components/VaultGate';
import { HealthImportPanel } from './components/HealthImportPanel';
import { HealthInsightsPanel } from './components/HealthInsightsPanel';
import { HealthExplorer } from './components/HealthExplorer';
import { VaultStatusPanel } from './components/VaultStatusPanel';
import { WeightSourceControl } from './components/WeightSourceControl';
import { DEFAULT_DISPLAY_PREFERENCES } from './constants';
import { useVault } from './hooks/useVault';
import { generatePredictions, summarizeProjection } from './utils/gaussianProcess';
import { buildDisplayEntries, buildHealthInsights } from './services/healthAnalytics';
import { convertWeight, formatShortDate, formatWeight } from './utils/formatting';

type ViewId = 'dashboard' | 'log' | 'health' | 'history' | 'review' | 'goal' | 'settings';

const primaryViews: Array<{ id: ViewId; label: string }> = [
  { id: 'dashboard', label: 'Home' },
  { id: 'log', label: 'Log' },
  { id: 'health', label: 'Health' },
  { id: 'history', label: 'History' },
];

const secondaryViews: Array<{ id: ViewId; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'goal', label: 'Goal' },
  { id: 'settings', label: 'Settings' },
];

function App() {
  const vault = useVault();

  if (vault.status !== 'unlocked' || !vault.data) {
    const gateMode = vault.status === 'unlocked' ? 'locked' : vault.status;
    return (
      <div className="app-shell">
        <Hero />
        <VaultGate
          mode={gateMode}
          busy={vault.busy}
          error={vault.error}
          onLogin={vault.login}
          onSetup={vault.setup}
          onUnlock={vault.unlock}
        />
      </div>
    );
  }

  return <UnlockedDashboard vault={vault as UnlockedVault} />;
}

type UnlockedVault = ReturnType<typeof useVault> & {
  status: 'unlocked';
  data: NonNullable<ReturnType<typeof useVault>['data']>;
};

function UnlockedDashboard({ vault }: { vault: UnlockedVault }) {
  const { settings, manualEntries, health } = vault.data;
  const profile = settings.metabolicProfile;
  const goalWeight = settings.goalWeight;
  const preferences = settings.displayPreferences;
  const [activeView, setActiveView] = useState<ViewId>(() =>
    window.location.pathname === '/import' ? 'health' : 'dashboard',
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const entries = useMemo(
    () => buildDisplayEntries(manualEntries, health, settings.chartWeightSource),
    [health, manualEntries, settings.chartWeightSource],
  );
  const predictions = useMemo(
    () => generatePredictions(entries, profile, health.dailyMetrics, health.workouts),
    [entries, health.dailyMetrics, health.workouts, profile],
  );
  const summary = useMemo(
    () => summarizeProjection(entries, predictions, goalWeight),
    [entries, predictions, goalWeight],
  );
  const insights = useMemo(() => buildHealthInsights(entries, health, profile), [entries, health, profile]);
  const latestEntry = entries.length ? entries[entries.length - 1] : undefined;
  const etaLabel = summary?.projectedGoalDate
    ? formatShortDate(summary.projectedGoalDate, preferences.dateFormat)
    : 'Need more data';
  const paceLabel = summary
    ? `${summary.pacePerWeek <= 0 ? '' : '+'}${convertWeight(summary.pacePerWeek, preferences.weightUnit).toFixed(1)} ${preferences.weightUnit}/wk`
    : '--';

  useEffect(() => {
    if (activeView === 'health' && window.location.pathname === '/import') {
      document.getElementById('import')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeView]);

  const handleViewChange = (view: ViewId) => {
    setActiveView(view);
    setMenuOpen(false);
  };

  const handleAddEntry = (payload: EntryPayload) => {
    vault
      .addEntry(payload)
      .then(() => {
        setActiveView('dashboard');
        setMenuOpen(false);
      })
      .catch(console.error);
  };

  const handleUpdateEntry = (id: string, payload: EntryPayload) => {
    vault.updateEntry(id, payload).catch(console.error);
  };

  const handleDeleteEntry = (id: string) => {
    vault.deleteEntry(id).catch(console.error);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <section className="view-stack">
            <section className="chart-panel">
              <div className="chart-toolbar">
                <div>
                  <p className="eyebrow">Weight source</p>
                  <h3>Trend and forecast</h3>
                </div>
                <WeightSourceControl
                  value={settings.chartWeightSource}
                  onChange={(source) => {
                    vault.updateChartSource(source).catch(console.error);
                  }}
                />
              </div>
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
      case 'health':
        return (
          <section className="view-stack">
            <div className="view-intro">
              <div>
                <p className="label">Apple Health</p>
                <h2>Imported signals</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => handleViewChange('dashboard')}>
                Back to trend
              </button>
            </div>
            <HealthInsightsPanel insights={insights} />
            <HealthExplorer health={health} entries={entries} profile={profile} />
            <HealthImportPanel
              busy={vault.busy}
              progress={vault.importProgress}
              latestSummary={health.importSummaries[0]}
              onImport={(file, options) => {
                vault.importHealthExport(file, options).catch(console.error);
              }}
            />
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
                onChange={(nextGoal) => {
                  vault.updateGoal(nextGoal).catch(console.error);
                }}
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
              onChange={(nextPreferences) => {
                vault.updatePreferences(nextPreferences).catch(console.error);
              }}
              onReset={() => {
                vault.updatePreferences(DEFAULT_DISPLAY_PREFERENCES).catch(console.error);
              }}
            />
            <div className="dual-grid">
              <MetabolismPanel
                profile={profile}
                onChange={(nextProfile) => {
                  vault.updateProfile(nextProfile).catch(console.error);
                }}
              />
              <DataVault
                entries={manualEntries}
                profile={profile}
                goalWeight={goalWeight}
                preferences={preferences}
                onRestore={(payload) => {
                  vault
                    .restoreBackup(payload)
                    .then(() => handleViewChange('dashboard'))
                    .catch(console.error);
                }}
              />
            </div>
            <VaultStatusPanel
              health={health}
              backupStatus={vault.backupStatus}
              backupPending={vault.backupPending}
              onLock={vault.lock}
              onLogout={vault.logout}
              onRotatePassphrase={vault.rotatePassphrase}
              onExportEncryptedBackup={vault.exportEncryptedBackup}
              onManualBackup={vault.backupEncryptedVault}
            />
            {vault.error ? <p className="error-text">{vault.error}</p> : null}
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
                className={`nav-button ${view.id === 'dashboard' ? 'nav-home-button' : ''} ${
                  activeView === view.id ? 'active' : ''
                }`}
                onClick={() => handleViewChange(view.id)}
              >
                {view.label}
              </button>
            ))}
            <div className={`more-nav ${menuOpen ? 'open' : ''}`}>
              <button
                type="button"
                className={`nav-button nav-menu-button ${
                  secondaryViews.some((view) => view.id === activeView) ? 'active' : ''
                }`}
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
            className={`bottom-nav-button ${view.id === 'dashboard' ? 'bottom-home-button' : ''} ${
              activeView === view.id ? 'active' : ''
            }`}
            onClick={() => handleViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
        <div className={`bottom-more ${menuOpen ? 'open' : ''}`}>
          <button
            type="button"
            className={`bottom-nav-button bottom-menu-button ${
              secondaryViews.some((view) => view.id === activeView) ? 'active' : ''
            }`}
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
