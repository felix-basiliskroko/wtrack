import { formatDistanceStrict } from 'date-fns';
import { DisplayPreferences, ProjectionSummary } from '../types';
import { convertWeight, formatShortDate } from '../utils/formatting';

const formatEta = (date: Date | null, dateFormat: DisplayPreferences['dateFormat']) => {
  if (!date) return 'Need more data for a prediction.';
  const daysOut = formatDistanceStrict(new Date(), date, { unit: 'day' });
  return `${formatShortDate(date, dateFormat)} (${daysOut} away)`;
};

const classify = (weeklyLoss: number) => {
  if (weeklyLoss >= 0.8) {
    return {
      label: 'Ahead',
      tone: 'positive',
      copy: 'You are melting >0.8 kg/week. Keep fueling recovery and sleep so the trend stays sustainable.',
    };
  }
  if (weeklyLoss >= 0.4) {
    return {
      label: 'On track',
      tone: 'steady',
      copy: 'That 0.4‑0.8 kg/week zone is exactly what most coaches recommend. Stay consistent.',
    };
  }
  if (weeklyLoss >= 0.1) {
    return {
      label: 'Lagging',
      tone: 'neutral',
      copy: 'Loss is slow; consider adding ~5 extra cardio minutes or trimming 100 kcal from meals.',
    };
  }
  return {
    label: 'Off course',
    tone: 'warning',
    copy: 'Weight is flat or climbing. Re-check logging accuracy and hit sessions with higher heart rate.',
  };
};

type MomentumPanelProps = {
  summary: ProjectionSummary | null;
  goalWeight: number;
  preferences: DisplayPreferences;
};

export const MomentumPanel = ({ summary, goalWeight, preferences }: MomentumPanelProps) => {
  if (!summary) {
    return (
      <section className="panel-card momentum-card">
        <h3>Progress pulse</h3>
        <p className="muted">Log a few entries to unlock momentum feedback.</p>
      </section>
    );
  }

  const weeklyLoss = -summary.pacePerWeek;
  const status = classify(weeklyLoss);
  const eta = formatEta(summary.projectedGoalDate, preferences.dateFormat);
  const etaRange =
    summary.goalDateRange.early && summary.goalDateRange.late
      ? `${formatShortDate(summary.goalDateRange.early, preferences.dateFormat)} to ${formatShortDate(summary.goalDateRange.late, preferences.dateFormat)}`
      : 'Need more signal for a tight range.';
  const kgToGoal = summary.latestWeight - goalWeight;
  const suggestion =
    weeklyLoss >= 0.1
      ? `Projected goal in: ${eta}`
      : `Need ${convertWeight(Math.max(kgToGoal, 0), preferences.weightUnit).toFixed(1)} ${preferences.weightUnit} drop to hit ${convertWeight(goalWeight, preferences.weightUnit).toFixed(1)} ${preferences.weightUnit}.`;

  return (
    <section className="panel-card momentum-card">
      <div className="momentum-head">
        <p className="label">Momentum</p>
        <span className={`status-chip ${status.tone}`}>{status.label}</span>
      </div>
      <div className="momentum-body">
        <div>
          <p className="eyebrow">Weekly velocity</p>
          <h3>
            {`${weeklyLoss >= 0 ? '-' : '+'}${convertWeight(Math.abs(weeklyLoss), preferences.weightUnit).toFixed(2)} ${preferences.weightUnit}/wk`}
          </h3>
        </div>
        <div>
          <p className="eyebrow">Goal ETA</p>
          <p>{eta}</p>
          <p className="muted tiny">{etaRange}</p>
        </div>
        <div>
          <p className="eyebrow">Confidence</p>
          <p>{summary.confidenceScore}%</p>
        </div>
      </div>
      <div className="momentum-footer">
        <p>{suggestion}</p>
        <p className="muted">{status.copy}</p>
      </div>
    </section>
  );
};
