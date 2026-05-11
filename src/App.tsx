import { useEffect, useMemo } from 'react';
import { Hero } from './components/Hero';
import { WeightChart } from './components/WeightChart';
import { EntryPanel } from './components/EntryPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { GoalSetter } from './components/GoalSetter';
import { HistoryPanel } from './components/HistoryPanel';
import { MetabolismPanel } from './components/MetabolismPanel';
import { MomentumPanel } from './components/MomentumPanel';
import { VaultGate } from './components/VaultGate';
import { HealthImportPanel } from './components/HealthImportPanel';
import { HealthInsightsPanel } from './components/HealthInsightsPanel';
import { HealthExplorer } from './components/HealthExplorer';
import { VaultStatusPanel } from './components/VaultStatusPanel';
import { WeightSourceControl } from './components/WeightSourceControl';
import { useVault } from './hooks/useVault';
import { generatePredictions, summarizeProjection } from './utils/gaussianProcess';
import { buildDisplayEntries, buildHealthInsights } from './services/healthAnalytics';

function App() {
  const vault = useVault();

  useEffect(() => {
    if (vault.status === 'unlocked' && window.location.pathname === '/import') {
      document.getElementById('import')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [vault.status]);

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

  return (
    <div className="app-shell">
      <Hero />
      <main>
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
            <WeightChart entries={entries} predictions={predictions} goalWeight={goalWeight} />
          </div>
          <SummaryPanel summary={summary} entries={entries} predictions={predictions} goalWeight={goalWeight} />
          <MomentumPanel summary={summary} goalWeight={goalWeight} profile={profile} />
        </section>

        <HealthInsightsPanel insights={insights} />

        <HealthExplorer health={health} entries={entries} profile={profile} />

        <div className="dual-grid">
          <EntryPanel
            onAddEntry={(payload) => {
              vault.addEntry(payload).catch(console.error);
            }}
          />
          <GoalSetter
            goalWeight={goalWeight}
            latestEntry={latestEntry}
            onChange={(nextGoal) => {
              vault.updateGoal(nextGoal).catch(console.error);
            }}
          />
        </div>

        <div className="triple-grid">
          <MetabolismPanel
            profile={profile}
            onChange={(nextProfile) => {
              vault.updateProfile(nextProfile).catch(console.error);
            }}
          />
          <HistoryPanel entries={entries} />
          <HealthImportPanel
            busy={vault.busy}
            progress={vault.importProgress}
            latestSummary={health.importSummaries[0]}
            onImport={(file, options) => {
              vault.importHealthExport(file, options).catch(console.error);
            }}
          />
          <VaultStatusPanel
            health={health}
            onLock={vault.lock}
            onLogout={vault.logout}
            onRotatePassphrase={vault.rotatePassphrase}
            onExportEncryptedBackup={vault.exportEncryptedBackup}
          />
        </div>
        {vault.error ? <p className="error-text">{vault.error}</p> : null}
      </main>
    </div>
  );
}

export default App;
