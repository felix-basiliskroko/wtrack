import { DisplayPreferences } from '../types';

type DisplaySettingsPanelProps = {
  preferences: DisplayPreferences;
  onChange: (preferences: DisplayPreferences) => void;
};

export const DisplaySettingsPanel = ({ preferences, onChange }: DisplaySettingsPanelProps) => {
  const update = <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) =>
    onChange({ ...preferences, [key]: value });

  return (
    <section className="panel-card">
      <div className="panel-head">
        <p className="eyebrow">Display</p>
        <h3>App feel</h3>
        <p className="muted">Keep the interface tuned to how you want to read and use it.</p>
      </div>

      <div className="controls-grid">
        <label className="slider-field">
          <div className="slider-head">
            <span>Theme</span>
          </div>
          <select value={preferences.theme} onChange={(event) => update('theme', event.target.value as DisplayPreferences['theme'])}>
            <option value="midnight">Midnight</option>
            <option value="paper">Paper</option>
            <option value="sports-lab">Sports Lab</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Density</span>
          </div>
          <select
            value={preferences.density}
            onChange={(event) => update('density', event.target.value as DisplayPreferences['density'])}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Chart line style</span>
          </div>
          <select
            value={preferences.chartLineStyle}
            onChange={(event) =>
              update('chartLineStyle', event.target.value as DisplayPreferences['chartLineStyle'])
            }
          >
            <option value="strong">Strong</option>
            <option value="soft">Soft</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Navigation</span>
          </div>
          <select
            value={preferences.navigationStyle}
            onChange={(event) =>
              update('navigationStyle', event.target.value as DisplayPreferences['navigationStyle'])
            }
          >
            <option value="compact">Compact labels</option>
            <option value="large">Large tabs</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Motion</span>
          </div>
          <select value={preferences.motion} onChange={(event) => update('motion', event.target.value as DisplayPreferences['motion'])}>
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Weight unit</span>
          </div>
          <select
            value={preferences.weightUnit}
            onChange={(event) => update('weightUnit', event.target.value as DisplayPreferences['weightUnit'])}
          >
            <option value="kg">Kilograms</option>
            <option value="lb">Pounds</option>
          </select>
        </label>

        <label className="slider-field">
          <div className="slider-head">
            <span>Date format</span>
          </div>
          <select
            value={preferences.dateFormat}
            onChange={(event) => update('dateFormat', event.target.value as DisplayPreferences['dateFormat'])}
          >
            <option value="month-day">Apr 15</option>
            <option value="day-month">15 Apr</option>
            <option value="iso">2026-04-15</option>
          </select>
        </label>

        <label className="toggle-field">
          <span>Show confidence band</span>
          <input
            type="checkbox"
            checked={preferences.showConfidenceBand}
            onChange={(event) => update('showConfidenceBand', event.target.checked)}
          />
        </label>

        <label className="toggle-field">
          <span>Show goal line</span>
          <input
            type="checkbox"
            checked={preferences.showGoalLine}
            onChange={(event) => update('showGoalLine', event.target.checked)}
          />
        </label>
      </div>
    </section>
  );
};
