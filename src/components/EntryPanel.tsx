import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { DisplayPreferences } from '../types';
import { convertWeight, getWeightInputStep, parseWeightInput } from '../utils/formatting';

export type EntryPayload = {
  weight: number;
  timestamp: string;
  note?: string;
  workout?: {
    activityType: 'cardio' | 'intervals' | 'strength';
    durationMin: number;
    peakHeartRate: number;
  };
};

type EntryPanelProps = {
  onAddEntry: (payload: EntryPayload) => void;
  preferences: DisplayPreferences;
};

const roundToTenth = (value: number) => Math.round(value * 10) / 10;
type WorkoutPayload = NonNullable<EntryPayload['workout']>;
type ActivityType = WorkoutPayload['activityType'];

export const EntryPanel = ({ onAddEntry, preferences }: EntryPanelProps) => {
  const [todayWeight, setTodayWeight] = useState('');
  const [todayActivity, setTodayActivity] = useState<ActivityType>('cardio');
  const [todayDuration, setTodayDuration] = useState('45');
  const [todayHeartRate, setTodayHeartRate] = useState('160');
  const [todayNote, setTodayNote] = useState('');
  const [pastWeight, setPastWeight] = useState('');
  const [pastDate, setPastDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [pastTime, setPastTime] = useState('08:00');
  const [pastActivity, setPastActivity] = useState<ActivityType>('cardio');
  const [pastDuration, setPastDuration] = useState('45');
  const [pastHeartRate, setPastHeartRate] = useState('160');
  const [pastNote, setPastNote] = useState('');

  const workoutComplete = (duration: string, heartRate: string) =>
    Boolean(duration.trim()) && Boolean(heartRate.trim());

  const isTodayDisabled = useMemo(
    () => !todayWeight.trim() || !workoutComplete(todayDuration, todayHeartRate),
    [todayHeartRate, todayDuration, todayWeight],
  );
  const isPastDisabled = useMemo(
    () =>
      !pastWeight.trim() || !pastDate || !pastTime || !workoutComplete(pastDuration, pastHeartRate),
    [pastDate, pastDuration, pastHeartRate, pastTime, pastWeight],
  );

  const buildWorkout = (activity: ActivityType, duration: string, heartRate: string) => {
    const parsedDuration = parseFloat(duration);
    const parsedHeartRate = parseFloat(heartRate);
    if (Number.isNaN(parsedDuration) || Number.isNaN(parsedHeartRate)) return undefined;
    return {
      activityType: activity,
      durationMin: Math.max(parsedDuration, 0),
      peakHeartRate: Math.max(parsedHeartRate, 0),
    };
  };

  const handleTodaySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!todayWeight.trim()) return;
    const parsedWeight = parseFloat(todayWeight);
    const weight = roundToTenth(parseWeightInput(parsedWeight, preferences.weightUnit));
    if (Number.isNaN(weight)) return;
    const timestamp = new Date().toISOString();
    const workout = buildWorkout(todayActivity, todayDuration, todayHeartRate);
    onAddEntry({ weight, timestamp, workout, note: todayNote.trim() || undefined });
    setTodayWeight('');
    setTodayNote('');
  };

  const handlePastSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pastWeight.trim() || !pastDate || !pastTime) return;
    const parsedWeight = parseFloat(pastWeight);
    const weight = roundToTenth(parseWeightInput(parsedWeight, preferences.weightUnit));
    if (Number.isNaN(weight)) return;
    const localTimestamp = new Date(`${pastDate}T${pastTime}`);
    const workout = buildWorkout(pastActivity, pastDuration, pastHeartRate);
    onAddEntry({ weight, timestamp: localTimestamp.toISOString(), workout, note: pastNote.trim() || undefined });
    setPastWeight('');
    setPastNote('');
  };

  return (
    <div className="entry-panel">
      <section className="panel-card">
        <div className="panel-head">
          <p className="eyebrow">Today's checkpoint</p>
          <h3>Capture your current self</h3>
          <p className="muted">
            Logging your cardio session (duration + heart rate) lets the metabolic model stay realistic.
          </p>
        </div>
        <form className="entry-form" onSubmit={handleTodaySubmit}>
          <label>
            {`Today's weight (${preferences.weightUnit})`}
            <input
              type="number"
              step={getWeightInputStep(preferences.weightUnit)}
              min="0"
              placeholder={convertWeight(81.4, preferences.weightUnit).toFixed(1)}
              value={todayWeight}
              onChange={(event) => setTodayWeight(event.target.value)}
            />
          </label>
          <label>
            Activity type
            <select value={todayActivity} onChange={(event) => setTodayActivity(event.target.value as ActivityType)}>
              <option value="cardio">Steady cardio</option>
              <option value="intervals">Intervals/HIIT</option>
              <option value="strength">Strength or circuit</option>
            </select>
          </label>
          <label>
            Session duration (min)
            <input
              type="number"
              min="0"
              step="1"
              value={todayDuration}
              onChange={(event) => setTodayDuration(event.target.value)}
            />
          </label>
          <label>
            Peak heart rate (bpm)
            <input
              type="number"
              min="40"
              step="1"
              value={todayHeartRate}
              onChange={(event) => setTodayHeartRate(event.target.value)}
            />
          </label>
          <label>
            Note
            <textarea
              rows={3}
              placeholder="Sleep, sodium, travel, stress, anything useful"
              value={todayNote}
              onChange={(event) => setTodayNote(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isTodayDisabled}>
            Drop it into the model
          </button>
        </form>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <p className="eyebrow">Backfill a moment</p>
          <h3>Tell WTrack about a past day</h3>
          <p className="muted">Reconstructing cardio inputs keeps projections grounded in actual metabolism.</p>
        </div>
        <form className="entry-form" onSubmit={handlePastSubmit}>
          <label>
            Date
            <input type="date" value={pastDate} onChange={(event) => setPastDate(event.target.value)} />
          </label>
          <label>
            Time
            <input type="time" value={pastTime} onChange={(event) => setPastTime(event.target.value)} />
          </label>
          <label>
            {`Weight (${preferences.weightUnit})`}
            <input
              type="number"
              step={getWeightInputStep(preferences.weightUnit)}
              min="0"
              placeholder={convertWeight(82.3, preferences.weightUnit).toFixed(1)}
              value={pastWeight}
              onChange={(event) => setPastWeight(event.target.value)}
            />
          </label>
          <label>
            Activity type
            <select value={pastActivity} onChange={(event) => setPastActivity(event.target.value as ActivityType)}>
              <option value="cardio">Steady cardio</option>
              <option value="intervals">Intervals/HIIT</option>
              <option value="strength">Strength or circuit</option>
            </select>
          </label>
          <label>
            Session duration (min)
            <input
              type="number"
              min="0"
              step="1"
              value={pastDuration}
              onChange={(event) => setPastDuration(event.target.value)}
            />
          </label>
          <label>
            Peak heart rate (bpm)
            <input
              type="number"
              min="40"
              step="1"
              value={pastHeartRate}
              onChange={(event) => setPastHeartRate(event.target.value)}
            />
          </label>
          <label>
            Note
            <textarea
              rows={3}
              placeholder="Why this day matters"
              value={pastNote}
              onChange={(event) => setPastNote(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isPastDisabled}>
            Sync history
          </button>
        </form>
      </section>
    </div>
  );
};
