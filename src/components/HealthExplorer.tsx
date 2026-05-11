import { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { HealthSnapshot, MetabolicProfile, SleepStage, WeightEntry } from '../types';
import {
  ActivityFilters,
  ExplorerRange,
  MetricDelta,
  buildActivityTrendBuckets,
  buildActivityExplorerModel,
  buildBodyLinkRows,
  buildSleepExplorerModel,
} from '../services/healthExplorerAnalytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);

type HealthExplorerProps = {
  health: HealthSnapshot;
  entries: WeightEntry[];
  profile: MetabolicProfile;
};

type ExplorerTab = 'sleep' | 'activity' | 'body';

const rangeOptions: Array<{ value: ExplorerRange; label: string }> = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
  { value: 'all', label: 'All' },
];

const stageLabels: Record<SleepStage, string> = {
  awake: 'Awake',
  rem: 'REM',
  core: 'Core',
  deep: 'Deep',
  asleep: 'Asleep',
  inBed: 'In bed',
};

const stageColors: Record<SleepStage, string> = {
  awake: '#ffb86c',
  rem: '#e66cff',
  core: '#38e2ff',
  deep: '#5b7cff',
  asleep: '#59ff92',
  inBed: 'rgba(255, 255, 255, 0.18)',
};

const chartText = '#cbcee3';
const chartGrid = 'rgba(255,255,255,0.06)';

const formatHours = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${value.toFixed(1)} h`;

const formatPercent = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${Math.round(value)}%`;

const formatMinutes = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${Math.round(value)} min`;

const formatKcal = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${Math.round(value).toLocaleString()} kcal`;

const formatCount = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : Math.round(value).toLocaleString();

const formatBpm = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? 'No data' : `${Math.round(value)} bpm`;

const formatDelta = (
  metric: MetricDelta,
  formatter: (value: number | undefined) => string,
  options: { lowerIsBetter?: boolean } = {},
) => {
  if (metric.delta === undefined) return 'No previous range';
  const improved = options.lowerIsBetter ? metric.delta < 0 : metric.delta > 0;
  const sign = metric.delta > 0 ? '+' : '';
  return `${improved ? 'Improved' : metric.delta === 0 ? 'Flat' : 'Changed'} ${sign}${formatter(metric.delta)}`;
};

const formatPlainDelta = (metric: MetricDelta, suffix = '', decimals = 0) => {
  if (metric.delta === undefined) return 'No previous range';
  const sign = metric.delta > 0 ? '+' : '';
  return `${sign}${metric.delta.toFixed(decimals)}${suffix}`;
};

const compactDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const baseLineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: chartText, usePointStyle: true },
    },
    tooltip: {
      backgroundColor: 'rgba(10, 12, 24, 0.94)',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: { color: chartGrid },
      ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      grid: { color: chartGrid },
      ticks: { color: chartText },
    },
  },
};

const baseBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: chartText, usePointStyle: true },
    },
    tooltip: {
      backgroundColor: 'rgba(10, 12, 24, 0.94)',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 12,
    },
  },
  scales: {
    x: {
      grid: { color: chartGrid },
      ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      stacked: true,
    },
    y: {
      grid: { color: chartGrid },
      ticks: { color: chartText },
      stacked: true,
    },
  },
};

const StatTile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <article className="metric-tile">
    <span className="label">{label}</span>
    <strong>{value}</strong>
    {note ? <p className="muted tiny">{note}</p> : null}
  </article>
);

const RangeControl = ({ range, setRange }: { range: ExplorerRange; setRange: (range: ExplorerRange) => void }) => (
  <div className="range-control" aria-label="Health explorer range">
    {rangeOptions.map((option) => (
      <button
        key={option.label}
        type="button"
        className={range === option.value ? 'active' : ''}
        onClick={() => setRange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const SleepTab = ({
  health,
  entries,
  range,
}: {
  health: HealthSnapshot;
  entries: WeightEntry[];
  range: ExplorerRange;
}) => {
  const sleep = useMemo(() => buildSleepExplorerModel(health, entries, range), [entries, health, range]);
  const chartNights = sleep.nights.slice(-30);
  const trendNights = sleep.trends.slice(-30);
  const hasIntervals = sleep.nights.some((night) => night.intervals.length);

  const stageChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: chartNights.map((night) => compactDate(night.nightDate)),
      datasets: (['awake', 'rem', 'core', 'deep', 'asleep'] as SleepStage[]).map((stage) => ({
        label: stageLabels[stage],
        data: chartNights.map((night) => Math.max(night.stageMinutes[stage], 0) / 60),
        backgroundColor: stageColors[stage],
        borderWidth: 0,
        borderRadius: 3,
      })),
    }),
    [chartNights],
  );

  const phaseTrendChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: trendNights.map((night) => compactDate(night.nightDate)),
      datasets: [
        {
          label: 'Sleep 7-night avg',
          data: trendNights.map((night) => night.rollingSleepHours ?? null),
          borderColor: stageColors.core,
          backgroundColor: stageColors.core,
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y',
        },
        {
          label: 'Deep sleep',
          data: trendNights.map((night) => night.deepMin / 60),
          borderColor: stageColors.deep,
          backgroundColor: stageColors.deep,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          label: 'REM',
          data: trendNights.map((night) => night.remMin / 60),
          borderColor: stageColors.rem,
          backgroundColor: stageColors.rem,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          label: 'Efficiency',
          data: trendNights.map((night) => night.rollingEfficiencyPercent ?? null),
          borderColor: '#59ff92',
          backgroundColor: '#59ff92',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y1',
        },
      ],
    }),
    [trendNights],
  );

  const weightLinkChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: chartNights.map((night) => compactDate(night.nightDate)),
      datasets: [
        {
          label: 'Sleep hours',
          data: chartNights.map((night) => night.sleepHours),
          borderColor: stageColors.core,
          backgroundColor: stageColors.core,
          tension: 0.35,
          yAxisID: 'y',
        },
        {
          label: 'Next weigh-in',
          data: chartNights.map((night) => night.weightKg ?? null),
          borderColor: '#59ff92',
          backgroundColor: '#59ff92',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y1',
        },
      ],
    }),
    [chartNights],
  );

  const weightLinkOptions: ChartOptions<'line'> = {
    ...baseLineOptions,
    scales: {
      ...baseLineOptions.scales,
      y: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} h` },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: chartText, callback: (value) => `${value} kg` },
      },
    },
  };

  const phaseTrendOptions: ChartOptions<'line'> = {
    ...baseLineOptions,
    scales: {
      ...baseLineOptions.scales,
      y: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} h` },
      },
      y1: {
        position: 'right',
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
        ticks: { color: chartText, callback: (value) => `${value}%` },
      },
    },
  };

  return (
    <div className="explorer-tab-grid">
      <div className="metric-grid wide">
        <StatTile label="Avg sleep" value={formatHours(sleep.stats.averageSleepHours)} />
        <StatTile label="Efficiency" value={formatPercent(sleep.stats.averageEfficiencyPercent)} />
        <StatTile label="Bedtime variance" value={formatMinutes(sleep.stats.bedtimeVarianceMin)} />
        <StatTile label="Wake variance" value={formatMinutes(sleep.stats.wakeVarianceMin)} />
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Sleep phases by night</h4>
          <p className="muted tiny">{hasIntervals ? 'Phase trends from detailed intervals' : 'Aggregate sleep only'}</p>
        </div>
        <div className="trend-card-row">
          <StatTile
            label="Sleep trend"
            value={formatPlainDelta(sleep.comparisons.sleepHours, ' h', 1)}
            note={formatDelta(sleep.comparisons.sleepHours, formatHours)}
          />
          <StatTile
            label="Efficiency trend"
            value={formatPlainDelta(sleep.comparisons.efficiencyPercent, '%', 0)}
            note={formatDelta(sleep.comparisons.efficiencyPercent, formatPercent)}
          />
          <StatTile
            label="Deep trend"
            value={formatPlainDelta(sleep.comparisons.deepMin, ' min')}
            note={formatDelta(sleep.comparisons.deepMin, formatMinutes)}
          />
          <StatTile
            label="Consistency"
            value={formatPlainDelta(sleep.comparisons.bedtimeVarianceMin, ' min')}
            note={formatDelta(sleep.comparisons.bedtimeVarianceMin, formatMinutes, { lowerIsBetter: true })}
          />
        </div>
        <div className="phase-chart-grid">
          <div className="chart-box medium">
            <Bar data={stageChart} options={baseBarOptions} />
          </div>
          <div className="chart-box medium">
            <Line data={phaseTrendChart} options={phaseTrendOptions} />
          </div>
        </div>
      </div>

      <div className="explorer-panel">
        <div className="panel-head compact">
          <h4>Stage mix</h4>
        </div>
        <div className="stage-stack">
          {sleep.stageTotals.map((stage) => (
            <div key={stage.stage} className="stage-row">
              <span>{stageLabels[stage.stage]}</span>
              <div>
                <i style={{ width: `${Math.max(stage.percent, 2)}%`, background: stageColors[stage.stage] }} />
              </div>
              <strong>{Math.round(stage.percent)}%</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="explorer-panel">
        <div className="panel-head compact">
          <h4>Sleep to weight</h4>
          <p className="muted tiny">{sleep.stats.linkedWeightNights} nights linked to next weigh-in</p>
        </div>
        <div className="chart-box small">
          <Line data={weightLinkChart} options={weightLinkOptions} />
        </div>
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Night timeline</h4>
          <p className="muted tiny">6 PM to noon</p>
        </div>
        <div className="sleep-timeline">
          {sleep.nights
            .slice(-45)
            .reverse()
            .map((night) => (
              <div key={night.nightDate} className="sleep-line">
                <span>{compactDate(night.nightDate)}</span>
                <div className="sleep-track">
                  {night.timelineSegments.length ? (
                    <>
                      <div className="sleep-context-layer">
                        {night.inBedSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="sleep-context-segment"
                            style={{
                              left: `${segment.startPercent}%`,
                              width: `${segment.widthPercent}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="sleep-stage-layer">
                        {night.timelineSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="sleep-segment"
                            style={{
                              left: `${segment.startPercent}%`,
                              width: `${Math.max(segment.widthPercent, 0.8)}%`,
                              background: stageColors[segment.stage],
                            }}
                            title={`${stageLabels[segment.stage]} ${Math.round(segment.durationMin)} min`}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div
                      className="aggregate-sleep-line"
                      style={{ width: `${Math.min((night.sleepHours / 12) * 100, 100)}%` }}
                    />
                  )}
                </div>
                <strong>{night.sleepHours.toFixed(1)} h</strong>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

const ActivityTab = ({
  health,
  entries,
  profile,
  range,
}: {
  health: HealthSnapshot;
  entries: WeightEntry[];
  profile: MetabolicProfile;
  range: ExplorerRange;
}) => {
  const [activityType, setActivityType] = useState('all');
  const [minHeartRate, setMinHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');
  const [minDuration, setMinDuration] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const filters: ActivityFilters = {
    activityType,
    minHeartRate: minHeartRate.trim() ? Number(minHeartRate) : undefined,
    maxHeartRate: maxHeartRate.trim() ? Number(maxHeartRate) : undefined,
    minDurationMin: minDuration.trim() ? Number(minDuration) : undefined,
  };
  const activity = useMemo(
    () => buildActivityExplorerModel(health, entries, profile, range, filters),
    [activityType, entries, health, maxHeartRate, minDuration, minHeartRate, profile, range],
  );
  const chartWorkouts = activity.workouts.slice(-30);
  const sortedWorkouts = useMemo(() => {
    const ordered = [...activity.workouts];
    ordered.sort((a, b) => {
      if (sortBy === 'duration') return b.durationMin - a.durationMin;
      if (sortBy === 'calories') return (b.caloriesKcal ?? 0) - (a.caloriesKcal ?? 0);
      if (sortBy === 'heartRate') return (b.averageHeartRateBpm ?? 0) - (a.averageHeartRateBpm ?? 0);
      if (sortBy === 'distance') return (b.distanceKm ?? 0) - (a.distanceKm ?? 0);
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
    return ordered;
  }, [activity.workouts, sortBy]);
  const trendBuckets = useMemo(
    () => buildActivityTrendBuckets(activity.trendRows, range),
    [activity.trendRows, range],
  );

  const workoutChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: chartWorkouts.map((workout) => workout.displayDate),
      datasets: [
        {
          label: 'Duration min',
          data: chartWorkouts.map((workout) => workout.durationMin),
          backgroundColor: '#38e2ff',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Calories',
          data: chartWorkouts.map((workout) => workout.caloriesKcal ?? 0),
          backgroundColor: 'rgba(89, 255, 146, 0.75)',
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    }),
    [chartWorkouts],
  );

  const workoutOptions: ChartOptions<'bar'> = {
    ...baseBarOptions,
    scales: {
      x: {
        grid: { color: chartGrid },
        ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: chartText },
      },
    },
  };

  const heartRateChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: activity.heartRateBuckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: 'Workouts',
          data: activity.heartRateBuckets.map((bucket) => bucket.count),
          backgroundColor: ['#59ff92', '#38e2ff', '#ffcc66', '#ff7070'],
          borderRadius: 4,
        },
      ],
    }),
    [activity.heartRateBuckets],
  );

  const activityTrendChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: trendBuckets.map((row) => compactDate(row.startDate)),
      datasets: [
        {
          label: trendBuckets.some((row) => row.mode === 'weekly') ? 'Active kcal weekly avg' : 'Active kcal 7-day avg',
          data: trendBuckets.map((row) => row.activeEnergyKcal ?? null),
          borderColor: '#59ff92',
          backgroundColor: '#59ff92',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y',
        },
        {
          label: trendBuckets.some((row) => row.mode === 'weekly') ? 'Steps weekly avg' : 'Steps 7-day avg',
          data: trendBuckets.map((row) => row.steps ?? null),
          borderColor: '#38e2ff',
          backgroundColor: '#38e2ff',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y1',
        },
      ],
    }),
    [trendBuckets],
  );

  const workoutMinutesTrendChart = useMemo<ChartData<'bar'>>(
    () => ({
      labels: trendBuckets.map((row) => compactDate(row.startDate)),
      datasets: [
        {
          label: 'Workout minutes',
          data: trendBuckets.map((row) => row.workoutDurationMin),
          backgroundColor: 'rgba(255, 204, 102, 0.78)',
          borderRadius: 4,
          borderWidth: 0,
        },
      ],
    }),
    [trendBuckets],
  );

  const activityTrendOptions: ChartOptions<'line'> = {
    ...baseLineOptions,
    scales: {
      x: baseLineOptions.scales?.x,
      y: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} kcal` },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: chartText, callback: (value) => `${value} steps` },
      },
    },
  };

  const workoutMinutesTrendOptions: ChartOptions<'bar'> = {
    ...baseBarOptions,
    plugins: {
      ...baseBarOptions.plugins,
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        grid: { color: chartGrid },
        ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} min` },
      },
    },
  };

  return (
    <div className="explorer-tab-grid">
      <div className="filter-bar wide">
        <label>
          Activity
          <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
            <option value="all">All activity types</option>
            {activity.activityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min HR
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={minHeartRate}
            onChange={(event) => setMinHeartRate(event.target.value)}
            placeholder="bpm"
          />
        </label>
        <label>
          Max HR
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={maxHeartRate}
            onChange={(event) => setMaxHeartRate(event.target.value)}
            placeholder="bpm"
          />
        </label>
        <label>
          Min duration
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={minDuration}
            onChange={(event) => setMinDuration(event.target.value)}
            placeholder="min"
          />
        </label>
        <label>
          Sort
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="date">Newest</option>
            <option value="duration">Duration</option>
            <option value="calories">Calories</option>
            <option value="heartRate">Heart rate</option>
            <option value="distance">Distance</option>
          </select>
        </label>
      </div>

      <div className="metric-grid wide">
        <StatTile label="Workouts" value={activity.stats.workoutCount.toLocaleString()} />
        <StatTile label="Duration" value={formatMinutes(activity.stats.totalDurationMin)} />
        <StatTile label="Calories" value={formatKcal(activity.stats.totalCaloriesKcal)} />
        <StatTile
          label="Steps"
          value={activity.stats.averageSteps === undefined ? 'No data' : `${formatCount(activity.stats.averageSteps)} /day`}
          note={formatPlainDelta(activity.comparisons.averageSteps, ' steps')}
        />
        <StatTile
          label="Active kcal"
          value={formatKcal(activity.stats.averageActiveEnergyKcal)}
          note={formatPlainDelta(activity.comparisons.averageActiveEnergyKcal, ' kcal')}
        />
        <StatTile
          label="Avg HR"
          value={formatBpm(activity.stats.averageHeartRateBpm)}
        />
        <StatTile
          label="Kcal source"
          value={`${activity.stats.measuredCalorieWorkouts}/${activity.stats.workoutCount}`}
          note={`${activity.stats.estimatedCalorieWorkouts} estimated`}
        />
      </div>

      <div className="trend-card-row wide">
        <StatTile
          label="Workout change"
          value={formatPlainDelta(activity.comparisons.workoutCount)}
          note="vs previous range"
        />
        <StatTile
          label="Duration change"
          value={formatPlainDelta(activity.comparisons.totalDurationMin, ' min')}
          note="vs previous range"
        />
        <StatTile
          label="Calorie change"
          value={formatPlainDelta(activity.comparisons.totalCaloriesKcal, ' kcal')}
          note="vs previous range"
        />
        <StatTile
          label="Step change"
          value={formatPlainDelta(activity.comparisons.averageSteps, ' steps')}
          note="daily average"
        />
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Activity trends</h4>
          <p className="muted tiny">
            {trendBuckets.some((row) => row.mode === 'weekly') ? 'Weekly movement averages' : '7-day movement averages'}
          </p>
        </div>
        <div className="activity-trend-grid">
          <div className="chart-box medium">
            <Line data={activityTrendChart} options={activityTrendOptions} />
          </div>
          <div className="chart-box medium compact-chart">
            <Bar data={workoutMinutesTrendChart} options={workoutMinutesTrendOptions} />
          </div>
        </div>
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Workout load</h4>
          <p className="muted tiny">Calories use Apple values first, then HR estimates.</p>
        </div>
        <div className="chart-box medium">
          <Bar data={workoutChart} options={workoutOptions} />
        </div>
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Activity type breakdown</h4>
        </div>
        <div className="type-breakdown">
          {activity.typeSummaries.map((summary) => (
            <article key={summary.activityType}>
              <div>
                <strong>{summary.activityType}</strong>
                <span className="muted tiny">{summary.workoutCount} workouts</span>
              </div>
              <span>{formatMinutes(summary.totalDurationMin)}</span>
              <span>{formatKcal(summary.totalCaloriesKcal)}</span>
              <span>{formatBpm(summary.averageHeartRateBpm)}</span>
              <span>{summary.totalDistanceKm ? `${summary.totalDistanceKm.toFixed(1)} km` : 'No distance'}</span>
              <div className="share-bar">
                <i style={{ width: `${Math.max(summary.sharePercent, 2)}%` }} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="explorer-panel">
        <div className="panel-head compact">
          <h4>Heart-rate ranges</h4>
        </div>
        <div className="chart-box small">
          <Bar data={heartRateChart} options={baseBarOptions} />
        </div>
      </div>

      <div className="explorer-panel">
        <div className="panel-head compact">
          <h4>Weekly load</h4>
        </div>
        <div className="load-heatmap">
          {activity.weeks.slice(-12).map((week) => (
            <div key={week.weekStart} className="load-week">
              <span>{compactDate(week.weekStart)}</span>
              {week.days.map((minutes, index) => (
                <i
                  key={`${week.weekStart}-${index}`}
                  title={`${Math.round(minutes)} min`}
                  style={{ opacity: minutes ? Math.min(0.25 + minutes / 120, 1) : 0.12 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Workout details</h4>
        </div>
        <div className="workout-list">
          {sortedWorkouts
            .slice(0, 18)
            .map((workout) => (
              <article key={workout.id}>
                <div>
                  <strong>{workout.activityType}</strong>
                  <span className="muted tiny">
                    {new Date(workout.startDate).toLocaleDateString()} · {Math.round(workout.durationMin)} min
                  </span>
                </div>
                <span>{workout.caloriesKcal ? `${workout.caloriesKcal} kcal${workout.caloriesEstimated ? '*' : ''}` : 'No kcal'}</span>
                <span>
                  {workout.averageHeartRateBpm ? `${Math.round(workout.averageHeartRateBpm)} bpm avg` : 'No HR'}
                </span>
                <span>
                  {workout.minHeartRateBpm && workout.maxHeartRateBpm
                    ? `${Math.round(workout.minHeartRateBpm)}-${Math.round(workout.maxHeartRateBpm)} bpm`
                    : 'No range'}
                </span>
                <span>{workout.distanceKm ? `${workout.distanceKm.toFixed(1)} km` : 'No distance'}</span>
              </article>
            ))}
        </div>
      </div>
    </div>
  );
};

const BodyTab = ({
  health,
  entries,
  range,
}: {
  health: HealthSnapshot;
  entries: WeightEntry[];
  range: ExplorerRange;
}) => {
  const rows = useMemo(() => buildBodyLinkRows(health, entries, range), [entries, health, range]);
  const firstWeight = rows.find((row) => row.weightKg !== undefined)?.weightKg;
  const lastWeight = [...rows].reverse().find((row) => row.weightKg !== undefined)?.weightKg;
  const sleepValues = rows.map((row) => row.sleepHours).filter((value): value is number => value !== undefined);
  const energyValues = rows.map((row) => row.activeEnergyKcal).filter((value): value is number => value !== undefined);
  const stepValues = rows.map((row) => row.steps).filter((value): value is number => value !== undefined);
  const restingHrValues = rows
    .map((row) => row.restingHeartRateBpm)
    .filter((value): value is number => value !== undefined);
  const hrvValues = rows.map((row) => row.hrvSdnnMs).filter((value): value is number => value !== undefined);
  const average = (values: number[]) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : undefined;

  const weightDelta = firstWeight !== undefined && lastWeight !== undefined ? lastWeight - firstWeight : undefined;
  const bodyChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: rows.map((row) => compactDate(row.date)),
      datasets: [
        {
          label: 'Weight',
          data: rows.map((row) => row.weightKg ?? null),
          borderColor: '#9d7bff',
          backgroundColor: '#9d7bff',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'yWeight',
        },
        {
          label: 'Sleep',
          data: rows.map((row) => row.sleepHours ?? null),
          borderColor: '#38e2ff',
          backgroundColor: '#38e2ff',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'yHours',
        },
        {
          label: 'Active kcal',
          data: rows.map((row) => row.activeEnergyKcal ?? null),
          borderColor: '#59ff92',
          backgroundColor: '#59ff92',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'yEnergy',
        },
      ],
    }),
    [rows],
  );

  const recoveryChart = useMemo<ChartData<'line'>>(
    () => ({
      labels: rows.map((row) => compactDate(row.date)),
      datasets: [
        {
          label: 'Resting HR',
          data: rows.map((row) => row.restingHeartRateBpm ?? null),
          borderColor: '#ff7070',
          backgroundColor: '#ff7070',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y',
        },
        {
          label: 'HRV',
          data: rows.map((row) => row.hrvSdnnMs ?? null),
          borderColor: '#ffcc66',
          backgroundColor: '#ffcc66',
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y1',
        },
      ],
    }),
    [rows],
  );

  const bodyOptions: ChartOptions<'line'> = {
    ...baseLineOptions,
    scales: {
      x: baseLineOptions.scales?.x,
      yWeight: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} kg` },
      },
      yHours: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: chartText, callback: (value) => `${value} h` },
      },
      yEnergy: {
        display: false,
      },
    },
  };

  const recoveryOptions: ChartOptions<'line'> = {
    ...baseLineOptions,
    scales: {
      ...baseLineOptions.scales,
      y: {
        position: 'left',
        grid: { color: chartGrid },
        ticks: { color: chartText, callback: (value) => `${value} bpm` },
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: chartText, callback: (value) => `${value} ms` },
      },
    },
  };

  return (
    <div className="explorer-tab-grid">
      <div className="metric-grid wide">
        <StatTile
          label="Weight delta"
          value={weightDelta === undefined ? 'No data' : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`}
        />
        <StatTile label="Avg sleep" value={formatHours(average(sleepValues))} />
        <StatTile label="Avg active" value={formatKcal(average(energyValues))} />
        <StatTile
          label="Avg steps"
          value={
            stepValues.length ? `${Math.round(average(stepValues) ?? 0).toLocaleString()} /day` : 'No data'
          }
        />
        <StatTile
          label="Resting HR"
          value={restingHrValues.length ? `${Math.round(average(restingHrValues) ?? 0)} bpm` : 'No data'}
        />
        <StatTile label="HRV" value={hrvValues.length ? `${Math.round(average(hrvValues) ?? 0)} ms` : 'No data'} />
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Weight, sleep, and energy</h4>
        </div>
        <div className="chart-box medium">
          <Line data={bodyChart} options={bodyOptions} />
        </div>
      </div>

      <div className="explorer-panel wide">
        <div className="panel-head compact">
          <h4>Recovery context</h4>
        </div>
        <div className="chart-box small">
          <Line data={recoveryChart} options={recoveryOptions} />
        </div>
      </div>
    </div>
  );
};

export const HealthExplorer = ({ health, entries, profile }: HealthExplorerProps) => {
  const [tab, setTab] = useState<ExplorerTab>('sleep');
  const [range, setRange] = useState<ExplorerRange>(30);
  const hasHealthData = health.dailyMetrics.length || health.sleepNights.length || health.workouts.length;

  return (
    <section className="health-explorer">
      <div className="explorer-head">
        <div>
          <p className="eyebrow">Health explorer</p>
          <h3>Sleep and activity comparison</h3>
        </div>
        <RangeControl range={range} setRange={setRange} />
      </div>

      <div className="tab-control" role="tablist" aria-label="Health explorer sections">
        {(['sleep', 'activity', 'body'] as ExplorerTab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'body' ? 'Body Link' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {hasHealthData ? (
        <>
          {tab === 'sleep' ? <SleepTab health={health} entries={entries} range={range} /> : null}
          {tab === 'activity' ? (
            <ActivityTab health={health} entries={entries} profile={profile} range={range} />
          ) : null}
          {tab === 'body' ? <BodyTab health={health} entries={entries} range={range} /> : null}
        </>
      ) : (
        <div className="explorer-empty">
          <p className="muted">Import Apple Health data to unlock detailed comparisons.</p>
        </div>
      )}
    </section>
  );
};
