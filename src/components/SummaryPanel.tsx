import { DisplayPreferences, PredictionPoint, ProjectionSummary, WeightEntry } from '../types';
import { convertWeight, formatDateTime, formatShortDate, formatWeight, formatWeightDelta } from '../utils/formatting';

type SummaryPanelProps = {
  entries: WeightEntry[];
  predictions: PredictionPoint[];
  goalWeight: number;
  preferences: DisplayPreferences;
  summary: ProjectionSummary | null;
};

export const SummaryPanel = ({ entries, predictions, goalWeight, preferences, summary }: SummaryPanelProps) => {
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
    ? `At this pace you'll touch ${formatWeight(goalWeight, preferences.weightUnit)} around ${formatShortDate(summary.projectedGoalDate, preferences.dateFormat)}.`
    : 'Add a bit more history so we can forecast your goal date with confidence.';
  const etaRangeCopy =
    summary.goalDateRange.early && summary.goalDateRange.late
      ? `${formatShortDate(summary.goalDateRange.early, preferences.dateFormat)} to ${formatShortDate(summary.goalDateRange.late, preferences.dateFormat)}`
      : 'Range unlocks once the model has tighter variance.';

  const nextWeekCopy = latestPrediction
    ? `The model expects ${convertWeight(latestPrediction.mean, preferences.weightUnit).toFixed(1)} ${preferences.weightUnit} in about a week (±${convertWeight(Math.sqrt(latestPrediction.variance), preferences.weightUnit).toFixed(1)}).`
    : 'Add a few more points to unlock next-week projections.';

  return (
    <section className="panel-card summary-card">
      <div className="summary-grid">
        <div>
          <p className="label">Net change</p>
          <h3 className={summary.totalChange <= 0 ? 'positive' : 'neutral'}>
            {formatWeightDelta(summary.totalChange, preferences.weightUnit)}
          </h3>
          <p className="muted">{summary.totalChange <= 0 ? 'Weight lost so far' : 'Weight gain so far'}</p>
        </div>
        <div>
          <p className="label">Weekly velocity</p>
          <h3>{formatWeightDelta(summary.pacePerWeek, preferences.weightUnit)}</h3>
          <p className="muted">avg change every 7 days</p>
        </div>
        <div>
          <p className="label">Last log</p>
          <h3>{formatWeight(summary.latestWeight, preferences.weightUnit)}</h3>
          <p className="muted">{formatDateTime(new Date(entries[entries.length - 1].timestamp), preferences.dateFormat)}</p>
        </div>
        <div>
          <p className="label">ETA confidence</p>
          <h3>{summary.confidenceScore}%</h3>
          <p className="muted">{etaRangeCopy}</p>
        </div>
      </div>
      <div className="summary-body">
        <p>{goalCopy}</p>
        <p>{nextWeekCopy}</p>
      </div>
    </section>
  );
};
