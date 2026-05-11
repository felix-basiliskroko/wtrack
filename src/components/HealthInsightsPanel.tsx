type Insight = {
  label: string;
  value: string;
  copy: string;
};

type HealthInsightsPanelProps = {
  insights: Insight[];
};

export const HealthInsightsPanel = ({ insights }: HealthInsightsPanelProps) => (
  <section className="panel-card insights-card">
    <div className="panel-head">
      <p className="eyebrow">Weight loss context</p>
      <h3>Health signals linked to progress</h3>
    </div>
    <div className="insights-grid">
      {insights.map((insight) => (
        <article key={insight.label} className="insight-tile">
          <p className="label">{insight.label}</p>
          <h4>{insight.value}</h4>
          <p className="muted">{insight.copy}</p>
        </article>
      ))}
    </div>
  </section>
);
