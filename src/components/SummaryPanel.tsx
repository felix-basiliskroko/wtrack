import { format } from 'date-fns';
import { PredictionPoint, ProjectionSummary, WeightEntry } from '../types';

type SummaryPanelProps = {
  entries: WeightEntry[];
  predictions: PredictionPoint[];
  goalWeight: number;
  summary: ProjectionSummary | null;
};

const formatChange = (value: number) => {
  if (!Number.isFinite(value)) return '0.0 kg';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)} kg`;
};

export const SummaryPanel = ({ entries, predictions, goalWeight, summary }: SummaryPanelProps) => {
  const latestPrediction = predictions[6] ?? predictions[predictions.length - 1];

  if (!summary) {
    return (
      <section className="panel-card summary-card">
        <h3>Start logging your data</h3>
        <p className="muted">Once you add your first entries, WTrack will immediately project your trend.</p>
      </section>
    );
  }

  const goalCopy = summary.projectedGoalDate
    ? `At this pace you'll touch ${goalWeight} kg around ${format(summary.projectedGoalDate, 'MMM d')}.`
    : 'Add a bit more history so we can forecast your goal date with confidence.';

  const nextWeekCopy = latestPrediction
    ? `The model expects ${latestPrediction.mean.toFixed(1)} kg in about a week (±${Math.sqrt(latestPrediction.variance).toFixed(1)}).`
    : 'Add a few more points to unlock next-week projections.';

  return (
    <section className="panel-card summary-card">
      <div className="summary-grid">
        <div>
          <p className="label">Net change</p>
          <h3 className={summary.totalChange <= 0 ? 'positive' : 'neutral'}>
            {formatChange(summary.totalChange)}
          </h3>
          <p className="muted">{summary.totalChange <= 0 ? 'Weight lost so far' : 'Weight gain so far'}</p>
        </div>
        <div>
          <p className="label">Weekly velocity</p>
          <h3>{formatChange(summary.pacePerWeek)}</h3>
          <p className="muted">avg change every 7 days</p>
        </div>
        <div>
          <p className="label">Last log</p>
          <h3>{summary.latestWeight.toFixed(1)} kg</h3>
          <p className="muted">{format(new Date(entries[entries.length - 1].timestamp), 'MMM d, HH:mm')}</p>
        </div>
      </div>
      <div className="summary-body">
        <p>{goalCopy}</p>
        <p>{nextWeekCopy}</p>
      </div>
    </section>
  );
};
