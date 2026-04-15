import { DisplayPreferences, WeightEntry } from '../types';
import { describeWorkout } from '../utils/gaussianProcess';
import { formatDateTime, formatWeight } from '../utils/formatting';

type HistoryPanelProps = {
  entries: WeightEntry[];
  preferences: DisplayPreferences;
};

export const HistoryPanel = ({ entries, preferences }: HistoryPanelProps) => {
  const ordered = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <section className="panel-card history-card">
      <div className="panel-head">
        <p className="eyebrow">Signal log</p>
        <h3>Your recent entries</h3>
      </div>
      {ordered.length ? (
        <ul>
          {ordered.slice(0, 8).map((entry) => (
            <li key={entry.id}>
              <div>
                <p className="label">{formatDateTime(new Date(entry.timestamp), preferences.dateFormat)}</p>
                <p className="muted">{describeWorkout(entry)}</p>
              </div>
              <span className="weight">{formatWeight(entry.weight, preferences.weightUnit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Add your first measurement to start the log.</p>
      )}
    </section>
  );
};
