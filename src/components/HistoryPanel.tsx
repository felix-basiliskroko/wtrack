import { format } from 'date-fns';
import { WeightEntry } from '../types';
import { describeWorkout } from '../utils/gaussianProcess';

type HistoryPanelProps = {
  entries: WeightEntry[];
};

export const HistoryPanel = ({ entries }: HistoryPanelProps) => {
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
                <p className="label">{format(new Date(entry.timestamp), 'MMM d, HH:mm')}</p>
                <p className="muted">{describeWorkout(entry)}</p>
              </div>
              <span className="weight">{entry.weight.toFixed(1)} kg</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Add your first measurement to start the log.</p>
      )}
    </section>
  );
};
