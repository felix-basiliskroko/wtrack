import { DisplayPreferences, ProjectionSummary, WeightEntry } from '../types';
import { summarizeWeek } from '../utils/gaussianProcess';
import { formatDateTime, formatWeight, formatWeightDelta } from '../utils/formatting';

type WeeklyReviewPanelProps = {
  entries: WeightEntry[];
  preferences: DisplayPreferences;
  summary: ProjectionSummary | null;
};

export const WeeklyReviewPanel = ({ entries, preferences, summary }: WeeklyReviewPanelProps) => {
  const weekly = summarizeWeek(entries);

  if (!weekly) {
    return (
      <section className="panel-card">
        <div className="panel-head">
          <p className="eyebrow">Weekly review</p>
          <h3>Need a few more logs</h3>
          <p className="muted">Once you have entries in the last 7 days, this screen will summarize the week.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card weekly-review-card">
      <div className="panel-head">
        <p className="eyebrow">Weekly review</p>
        <h3>How the last 7 days looked</h3>
        <p className="muted">Latest check-in: {formatDateTime(new Date(weekly.latestTimestamp), preferences.dateFormat)}</p>
      </div>
      <div className="summary-grid">
        <div>
          <p className="label">Avg weight</p>
          <h3>{formatWeight(weekly.averageWeight, preferences.weightUnit)}</h3>
        </div>
        <div>
          <p className="label">Net change</p>
          <h3 className={weekly.netChange <= 0 ? 'positive' : 'neutral'}>{formatWeightDelta(weekly.netChange, preferences.weightUnit)}</h3>
        </div>
        <div>
          <p className="label">Days logged</p>
          <h3>{weekly.daysLogged}/7</h3>
        </div>
        <div>
          <p className="label">Workout logs</p>
          <h3>{weekly.workoutsLogged}</h3>
        </div>
        <div>
          <p className="label">Notes added</p>
          <h3>{weekly.noteCount}</h3>
        </div>
        <div>
          <p className="label">Best drop</p>
          <h3 className="positive">{formatWeightDelta(weekly.bestDrop, preferences.weightUnit)}</h3>
        </div>
      </div>
      <div className="summary-body">
        <p>
          {weekly.daysLogged >= 5
            ? 'Logging consistency was strong this week.'
            : 'More consistent daily check-ins will tighten the model.'}
        </p>
        <p>
          {summary?.projectedGoalDate
            ? `Current forecast still points toward ${summary.confidenceScore}% confidence on the goal ETA.`
            : 'Keep building history to unlock stronger forecast confidence.'}
        </p>
      </div>
    </section>
  );
};
