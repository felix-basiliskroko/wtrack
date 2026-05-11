import { format } from 'date-fns';
import { DateFormatMode, WeightUnit } from '../types';

const KG_TO_LB = 2.2046226218;

const shortDatePatterns: Record<DateFormatMode, string> = {
  'month-day': 'MMM d',
  'day-month': 'd MMM',
  iso: 'yyyy-MM-dd',
};

const dateTimePatterns: Record<DateFormatMode, string> = {
  'month-day': 'MMM d, HH:mm',
  'day-month': 'd MMM, HH:mm',
  iso: 'yyyy-MM-dd HH:mm',
};

export const convertWeight = (weightKg: number, unit: WeightUnit) =>
  unit === 'lb' ? weightKg * KG_TO_LB : weightKg;

export const parseWeightInput = (value: number, unit: WeightUnit) =>
  unit === 'lb' ? value / KG_TO_LB : value;

export const formatWeight = (weightKg: number, unit: WeightUnit, digits = 1) =>
  `${convertWeight(weightKg, unit).toFixed(digits)} ${unit}`;

export const formatWeightDelta = (weightKg: number, unit: WeightUnit, digits = 1) => {
  const converted = convertWeight(weightKg, unit);
  const prefix = converted > 0 ? '+' : '';
  return `${prefix}${converted.toFixed(digits)} ${unit}`;
};

export const getWeightInputStep = (unit: WeightUnit) => (unit === 'lb' ? 0.5 : 0.1);

export const getWeightInputBounds = (unit: WeightUnit) =>
  unit === 'lb' ? { min: 90, max: 330 } : { min: 40, max: 150 };

export const formatShortDate = (date: Date, dateFormat: DateFormatMode) => format(date, shortDatePatterns[dateFormat]);

export const formatDateTime = (date: Date, dateFormat: DateFormatMode) => format(date, dateTimePatterns[dateFormat]);
