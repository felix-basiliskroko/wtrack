import { useMemo } from 'react';
import { Hero } from './components/Hero';
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

  const predictions = useMemo(() => generatePredictions(entries, profile), [entries, profile]);
  const summary = useMemo(
    () => summarizeProjection(entries, predictions, goalWeight),
    [entries, predictions, goalWeight],
  );
  const latestEntry = entries.length ? entries[entries.length - 1] : undefined;

  const handleAddEntry = (payload: EntryPayload) => {
    setEntries((prev) => {
      const next = [...prev, createEntry(payload)];
      return next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });
  };

  return (
    <div className="app-shell">
      <Hero />
      <main>
        <section className="chart-panel">
          <div className="chart-frame">
            <WeightChart entries={entries} predictions={predictions} goalWeight={goalWeight} />
          </div>
          <SummaryPanel summary={summary} entries={entries} predictions={predictions} goalWeight={goalWeight} />
          <MomentumPanel summary={summary} goalWeight={goalWeight} profile={profile} />
        </section>

        <div className="dual-grid">
          <EntryPanel onAddEntry={handleAddEntry} />
          <GoalSetter goalWeight={goalWeight} latestEntry={latestEntry} onChange={setGoalWeight} />
        </div>

        <div className="triple-grid">
          <MetabolismPanel profile={profile} onChange={setProfile} />
          <HistoryPanel entries={entries} />
          <DataVault entries={entries} profile={profile} goalWeight={goalWeight} />
        </div>
      </main>
    </div>
  );
}

export default App;
