import { useState } from 'react';
import { EntryPayload } from './EntryPanel';
import { DisplayPreferences, WeightEntry } from '../types';
import { describeWorkout } from '../utils/gaussianProcess';
import { convertWeight, formatDateTime, formatWeight, getWeightInputStep, parseWeightInput } from '../utils/formatting';

type HistoryPanelProps = {
  entries: WeightEntry[];
  preferences: DisplayPreferences;
  onDeleteEntry: (id: string) => void;
  onUpdateEntry: (id: string, payload: EntryPayload) => void;
};

type EditableEntry = {
  id: string;
  date: string;
  time: string;
  weight: string;
  activityType: 'cardio' | 'intervals' | 'strength';
  durationMin: string;
  peakHeartRate: string;
  note: string;
};

const buildEditable = (entry: WeightEntry, preferences: DisplayPreferences): EditableEntry => {
  const date = new Date(entry.timestamp);
  const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return {
    id: entry.id,
    date: localIso.slice(0, 10),
    time: localIso.slice(11, 16),
    weight: convertWeight(entry.weight, preferences.weightUnit).toFixed(1),
    activityType: entry.workout?.activityType ?? 'cardio',
    durationMin: entry.workout?.durationMin?.toString() ?? '45',
    peakHeartRate: entry.workout?.peakHeartRate?.toString() ?? '160',
    note: entry.note ?? '',
  };
};

export const HistoryPanel = ({ entries, preferences, onDeleteEntry, onUpdateEntry }: HistoryPanelProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableEntry | null>(null);

  const ordered = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const startEditing = (entry: WeightEntry) => {
    setEditingId(entry.id);
    setDraft(buildEditable(entry, preferences));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEditing = () => {
    if (!draft) return;
    const parsedWeight = parseFloat(draft.weight);
    if (Number.isNaN(parsedWeight) || !draft.date || !draft.time) return;

    const weight = parseWeightInput(parsedWeight, preferences.weightUnit);
    const duration = parseFloat(draft.durationMin);
    const peakHeartRate = parseFloat(draft.peakHeartRate);

    onUpdateEntry(draft.id, {
      timestamp: new Date(`${draft.date}T${draft.time}`).toISOString(),
      weight,
      note: draft.note.trim() || undefined,
      workout:
        Number.isNaN(duration) || Number.isNaN(peakHeartRate)
          ? undefined
          : {
              activityType: draft.activityType,
              durationMin: Math.max(duration, 0),
              peakHeartRate: Math.max(peakHeartRate, 0),
            },
    });

    cancelEditing();
  };

  return (
    <section className="panel-card history-card">
      <div className="panel-head">
        <p className="eyebrow">Signal log</p>
        <h3>Your recent entries</h3>
      </div>
      {ordered.length ? (
        <ul>
          {ordered.map((entry) => {
            const isEditing = editingId === entry.id && draft;
            return (
              <li key={entry.id} className={isEditing ? 'history-item editing' : 'history-item'}>
                {isEditing && draft ? (
                  <div className="history-edit-grid">
                    <label>
                      Date
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                      />
                    </label>
                    <label>
                      Time
                      <input
                        type="time"
                        value={draft.time}
                        onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                      />
                    </label>
                    <label>
                      Weight ({preferences.weightUnit})
                      <input
                        type="number"
                        step={getWeightInputStep(preferences.weightUnit)}
                        value={draft.weight}
                        onChange={(event) => setDraft({ ...draft, weight: event.target.value })}
                      />
                    </label>
                    <label>
                      Activity
                      <select
                        value={draft.activityType}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            activityType: event.target.value as EditableEntry['activityType'],
                          })
                        }
                      >
                        <option value="cardio">Steady cardio</option>
                        <option value="intervals">Intervals/HIIT</option>
                        <option value="strength">Strength or circuit</option>
                      </select>
                    </label>
                    <label>
                      Duration
                      <input
                        type="number"
                        value={draft.durationMin}
                        onChange={(event) => setDraft({ ...draft, durationMin: event.target.value })}
                      />
                    </label>
                    <label>
                      Peak HR
                      <input
                        type="number"
                        value={draft.peakHeartRate}
                        onChange={(event) => setDraft({ ...draft, peakHeartRate: event.target.value })}
                      />
                    </label>
                    <label className="history-note-field">
                      Note
                      <textarea
                        rows={3}
                        value={draft.note}
                        onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                      />
                    </label>
                    <div className="history-actions">
                      <button type="button" className="ghost-button" onClick={cancelEditing}>
                        Cancel
                      </button>
                      <button type="button" className="primary-button" onClick={saveEditing}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="label">{formatDateTime(new Date(entry.timestamp), preferences.dateFormat)}</p>
                      <p className="muted">{describeWorkout(entry)}</p>
                      {entry.note ? <p className="history-note">{entry.note}</p> : null}
                    </div>
                    <div className="history-meta">
                      <span className="weight">{formatWeight(entry.weight, preferences.weightUnit)}</span>
                      <div className="history-actions">
                        <button type="button" className="ghost-button" onClick={() => startEditing(entry)}>
                          Edit
                        </button>
                        <button type="button" className="danger-button" onClick={() => onDeleteEntry(entry.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Add your first measurement to start the log.</p>
      )}
    </section>
  );
};
