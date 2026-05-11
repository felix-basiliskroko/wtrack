import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseAppleHealthExport } from '../src/services/healthImportParser';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_DE">
  <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Smart Scale" unit="kg" startDate="2026-05-01 07:00:00 +0200" endDate="2026-05-01 07:00:00 +0200" value="84.2"/>
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Felix Apple Watch" unit="count" startDate="2026-05-01 08:00:00 +0200" endDate="2026-05-01 08:10:00 +0200" value="9000"/>
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Felix iPhone" unit="count" startDate="2026-05-01 08:00:00 +0200" endDate="2026-05-01 08:10:00 +0200" value="7000"/>
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Felix Apple Watch" unit="Cal" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 10:00:00 +0200" value="550"/>
  <Record type="HKQuantityTypeIdentifierBasalEnergyBurned" sourceName="Felix Apple Watch" unit="Cal" startDate="2026-05-01 00:00:00 +0200" endDate="2026-05-01 23:59:00 +0200" value="1900"/>
  <Record type="HKQuantityTypeIdentifierAppleExerciseTime" sourceName="Felix Apple Watch" unit="min" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 10:00:00 +0200" value="45"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Felix Apple Watch" unit="count/min" startDate="2026-05-01 09:10:00 +0200" endDate="2026-05-01 09:10:00 +0200" value="135"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Felix Apple Watch" unit="count/min" startDate="2026-05-01 09:30:00 +0200" endDate="2026-05-01 09:30:00 +0200" value="160"/>
  <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Felix Apple Watch" unit="count/min" startDate="2026-05-01 06:00:00 +0200" endDate="2026-05-01 06:00:00 +0200" value="52"/>
  <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Felix Apple Watch" unit="ms" startDate="2026-05-01 06:00:00 +0200" endDate="2026-05-01 06:00:00 +0200" value="68"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-04-30 23:30:00 +0200" endDate="2026-05-01 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-05-01 06:30:00 +0200" endDate="2026-05-01 06:45:00 +0200" value="HKCategoryValueSleepAnalysisAwake"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Felix Apple Watch" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 09:45:00 +0200" duration="45" durationUnit="min" totalEnergyBurned="500" totalEnergyBurnedUnit="Cal" totalDistance="7.2" totalDistanceUnit="km"/>
</HealthData>`;

describe('parseAppleHealthExport', () => {
  it('normalizes a zipped Apple Health export into aggregate health snapshots', async () => {
    const archive = zipSync({
      'apple_health_export/export.xml': strToU8(sampleXml),
    });

    const snapshot = await parseAppleHealthExport(new Blob([archive], { type: 'application/zip' }));
    const day = snapshot.dailyMetrics.find((metric) => metric.date === '2026-05-01');

    expect(snapshot.weightMeasurements).toHaveLength(1);
    expect(snapshot.weightMeasurements[0].weightKg).toBe(84.2);
    expect(day?.steps).toBe(9000);
    expect(day?.stepSource).toBe('mixed');
    expect(day?.activeEnergyKcal).toBe(550);
    expect(day?.basalEnergyKcal).toBe(1900);
    expect(day?.exerciseMinutes).toBe(45);
    expect(day?.restingHeartRateBpm).toBe(52);
    expect(day?.hrvSdnnMs).toBe(68);
    expect(snapshot.sleepNights[0].nightDate).toBe('2026-04-30');
    expect(snapshot.sleepNights[0].asleepMin).toBe(420);
    expect(snapshot.sleepIntervals).toHaveLength(2);
    expect(snapshot.sleepIntervals[0].stage).toBe('core');
    expect(snapshot.heartRateSamples).toHaveLength(2);
    expect(snapshot.workouts[0].durationMin).toBe(45);
    expect(snapshot.workouts[0].minHeartRateBpm).toBe(135);
    expect(snapshot.workouts[0].averageHeartRateBpm).toBe(147.5);
    expect(snapshot.workouts[0].maxHeartRateBpm).toBe(160);
    expect(snapshot.heartRateSamples[0].workoutId).toBe(snapshot.workouts[0].id);
    expect(snapshot.importSummaries[0].recordCount).toBe(12);
    expect(snapshot.importSummaries[0].mode).toBe('detailed');
    expect(snapshot.importSummaries[0].sleepIntervalCount).toBe(2);
    expect(snapshot.importSummaries[0].heartRateSampleCount).toBe(2);
  });

  it('keeps aggregate imports compact when detailed records are disabled', async () => {
    const snapshot = await parseAppleHealthExport(
      new Blob([sampleXml], { type: 'text/xml' }),
      { includeDetailedRecords: false },
    );

    expect(snapshot.sleepNights[0].asleepMin).toBe(420);
    expect(snapshot.workouts[0].durationMin).toBe(45);
    expect(snapshot.sleepIntervals).toEqual([]);
    expect(snapshot.heartRateSamples).toEqual([]);
    expect(snapshot.workouts[0].averageHeartRateBpm).toBeUndefined();
    expect(snapshot.importSummaries[0].mode).toBe('aggregate');
    expect(snapshot.importSummaries[0].sleepIntervalCount).toBe(0);
    expect(snapshot.importSummaries[0].heartRateSampleCount).toBe(0);
  });

  it('is idempotent when parsing the same full export repeatedly', async () => {
    const first = await parseAppleHealthExport(new Blob([sampleXml], { type: 'text/xml' }));
    const second = await parseAppleHealthExport(new Blob([sampleXml], { type: 'text/xml' }));

    expect(second.dailyMetrics).toEqual(first.dailyMetrics);
    expect(second.weightMeasurements).toEqual(first.weightMeasurements);
    expect(second.sleepNights).toEqual(first.sleepNights);
    expect(second.workouts).toEqual(first.workouts);
  });
});
