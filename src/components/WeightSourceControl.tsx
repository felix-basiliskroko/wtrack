import { ChartWeightSource } from '../types';

type WeightSourceControlProps = {
  value: ChartWeightSource;
  onChange: (source: ChartWeightSource) => void;
};

const options: Array<{ value: ChartWeightSource; label: string }> = [
  { value: 'combined', label: 'Combined' },
  { value: 'manual', label: 'Manual' },
  { value: 'appleHealth', label: 'Health' },
];

export const WeightSourceControl = ({ value, onChange }: WeightSourceControlProps) => (
  <div className="source-control" role="group" aria-label="Weight source">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={value === option.value ? 'active' : ''}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
