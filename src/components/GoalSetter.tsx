import { DisplayPreferences, WeightEntry } from '../types';
import { convertWeight, getWeightInputBounds, getWeightInputStep, parseWeightInput } from '../utils/formatting';

type GoalSetterProps = {
  goalWeight: number;
  latestEntry?: WeightEntry;
  preferences: DisplayPreferences;
  onChange: (goal: number) => void;
};

export const GoalSetter = ({ goalWeight, latestEntry, preferences, onChange }: GoalSetterProps) => {
  const latestWeight = latestEntry?.weight ?? goalWeight;
  const delta = latestWeight - goalWeight;
  const bounds = getWeightInputBounds(preferences.weightUnit);
  const step = getWeightInputStep(preferences.weightUnit);
  const displayGoal = convertWeight(goalWeight, preferences.weightUnit);

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
          <h2>{displayGoal.toFixed(1)} {preferences.weightUnit}</h2>
          <p className="muted">
            {delta >= 0
              ? `${convertWeight(delta, preferences.weightUnit).toFixed(1)} ${preferences.weightUnit} to go`
              : `${convertWeight(Math.abs(delta), preferences.weightUnit).toFixed(1)} ${preferences.weightUnit} past goal`}
          </p>
        </div>
        <div className="goal-control">
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={displayGoal}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(parseWeightInput(next, preferences.weightUnit));
              }
            }}
          />
          <input
            type="number"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={displayGoal}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(parseWeightInput(next, preferences.weightUnit));
              }
            }}
          />
        </div>
      </div>
    </section>
  );
};
