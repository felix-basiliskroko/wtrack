import { MetabolicProfile } from '../types';

type MetabolismPanelProps = {
  profile: MetabolicProfile;
  onChange: (profile: MetabolicProfile) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const parseOr = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const MetabolismPanel = ({ profile, onChange }: MetabolismPanelProps) => {
  const update = (patch: Partial<MetabolicProfile>) => onChange({ ...profile, ...patch });

  return (
    <section className="panel-card">
      <div className="panel-head">
        <p className="eyebrow">Metabolic profile</p>
        <h3>Make the physics realistic</h3>
        <p className="muted">
          BMR + cardio expenditure determine your forecast. Adjust these knobs to match your body.
        </p>
      </div>
      <div className="controls-grid">
        <label className="slider-field">
          <div className="slider-head">
            <span>Biological sex</span>
          </div>
          <select value={profile.biologicalSex} onChange={(event) => update({ biologicalSex: event.target.value as MetabolicProfile['biologicalSex'] })}>
            <option value="male">Male / masc physiology</option>
            <option value="female">Female / fem physiology</option>
          </select>
        </label>
        <label className="slider-field">
          <div className="slider-head">
            <span>Age</span>
            <span>{profile.age} yrs</span>
          </div>
          <input
            type="number"
            min={16}
            max={90}
            value={profile.age}
            onChange={(event) => update({ age: clamp(parseOr(event.target.value, profile.age), 16, 90) })}
          />
        </label>
        <label className="slider-field">
          <div className="slider-head">
            <span>Height</span>
            <span>{profile.heightCm} cm</span>
          </div>
          <input
            type="number"
            min={140}
            max={210}
            value={profile.heightCm}
            onChange={(event) =>
              update({ heightCm: clamp(parseOr(event.target.value, profile.heightCm), 140, 210) })
            }
          />
        </label>
        <label className="slider-field">
          <div className="slider-head">
            <span>Activity multiplier</span>
            <span>{profile.activityMultiplier.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={1.2}
            max={1.8}
            step={0.01}
            value={profile.activityMultiplier}
            onChange={(event) =>
              update({ activityMultiplier: parseFloat(event.target.value) })
            }
          />
          <p className="muted tiny">Accounts for steps, fidgeting, and daily movement outside training.</p>
        </label>
        <label className="slider-field">
          <div className="slider-head">
            <span>Diet deficit</span>
            <span>{profile.dietDeficit} kcal</span>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            step={25}
            value={profile.dietDeficit}
            onChange={(event) =>
              update({ dietDeficit: Math.round(parseInt(event.target.value, 10) / 5) * 5 })
            }
          />
          <p className="muted tiny">How many calories per day you cut via nutrition.</p>
        </label>
        <label className="slider-field">
          <div className="slider-head">
            <span>Forecast horizon</span>
            <span>{profile.horizonDays} days</span>
          </div>
          <input
            type="number"
            min={7}
            max={42}
            value={profile.horizonDays}
            onChange={(event) =>
              update({
                horizonDays: clamp(parseOr(event.target.value, profile.horizonDays), 7, 42),
              })
            }
          />
        </label>
      </div>
    </section>
  );
};
