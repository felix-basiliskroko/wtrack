import { DisplayPreferences, WeightEntry } from '../types';
import { summarizeMilestones } from '../utils/gaussianProcess';
import { formatWeight } from '../utils/formatting';

type MilestonesPanelProps = {
  entries: WeightEntry[];
  goalWeight: number;
  preferences: DisplayPreferences;
};

export const MilestonesPanel = ({ entries, goalWeight, preferences }: MilestonesPanelProps) => {
  const milestones = summarizeMilestones(entries, goalWeight);

  return (
    <section className="panel-card milestones-card">
      <div className="panel-head">
        <p className="eyebrow">Milestones</p>
        <h3>Progress markers</h3>
        <p className="muted">
          {entries.length
            ? `Tracking against ${formatWeight(goalWeight, preferences.weightUnit)}.`
            : 'Log a few entries and milestones will start stacking up.'}
        </p>
      </div>
      {milestones.length ? (
        <ul className="milestone-list">
          {milestones.map((milestone) => (
            <li key={milestone.id}>
              <strong>{milestone.title}</strong>
              <p className="muted">{milestone.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No milestones yet. A bit more history will unlock them.</p>
      )}
    </section>
  );
};
