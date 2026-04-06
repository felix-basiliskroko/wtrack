import { WeightEntry } from '../types';

type GoalSetterProps = {
  goalWeight: number;
  latestEntry?: WeightEntry;
  onChange: (goal: number) => void;
};

export const GoalSetter = ({ goalWeight, latestEntry, onChange }: GoalSetterProps) => {
  const latestWeight = latestEntry?.weight ?? goalWeight;
  const delta = latestWeight - goalWeight;

  return (
    <section className="panel-card goal-card">
      <div className="panel-head">
        <p className="eyebrow">Motivation anchor</p>
        <h3>Target weight</h3>
        <p className="muted">Lock in the number that excites you. The projection will highlight when we reach it.</p>
      </div>
      <div className="goal-body">
        <div className="goal-display">
          <span className="label">Goal</span>
          <h2>{goalWeight.toFixed(1)} kg</h2>
          <p className="muted">
            {delta >= 0 ? `${delta.toFixed(1)} kg to go` : `${Math.abs(delta).toFixed(1)} kg past goal`}
          </p>
        </div>
        <div className="goal-control">
          <input
            type="range"
            min={50}
            max={120}
            step={0.5}
            value={goalWeight}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(next);
              }
            }}
          />
          <input
            type="number"
            min={40}
            max={150}
            step={0.1}
            value={goalWeight}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(next);
              }
            }}
          />
        </div>
      </div>
    </section>
  );
};
