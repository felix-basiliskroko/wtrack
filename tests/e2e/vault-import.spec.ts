import { expect, test } from '@playwright/test';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_DE">
  <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Smart Scale" unit="kg" startDate="2026-05-01 07:00:00 +0200" endDate="2026-05-01 07:00:00 +0200" value="84.2"/>
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Felix Apple Watch" unit="count" startDate="2026-05-01 08:00:00 +0200" endDate="2026-05-01 08:10:00 +0200" value="9000"/>
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Felix Apple Watch" unit="Cal" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 10:00:00 +0200" value="550"/>
  <Record type="HKQuantityTypeIdentifierAppleExerciseTime" sourceName="Felix Apple Watch" unit="min" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 10:00:00 +0200" value="45"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Felix Apple Watch" unit="count/min" startDate="2026-05-01 09:10:00 +0200" endDate="2026-05-01 09:10:00 +0200" value="135"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Felix Apple Watch" unit="count/min" startDate="2026-05-01 09:30:00 +0200" endDate="2026-05-01 09:30:00 +0200" value="160"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-04-30 23:00:00 +0200" endDate="2026-05-01 07:00:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-04-30 23:30:00 +0200" endDate="2026-05-01 03:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-05-01 03:30:00 +0200" endDate="2026-05-01 05:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Felix Apple Watch" startDate="2026-05-01 05:00:00 +0200" endDate="2026-05-01 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepREM"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Felix Apple Watch" startDate="2026-05-01 09:00:00 +0200" endDate="2026-05-01 09:45:00 +0200" duration="45" durationUnit="min" totalEnergyBurned="500" totalEnergyBurnedUnit="Cal" totalDistance="7.2" totalDistanceUnit="km"/>
</HealthData>`;

test('persists manual data, display settings, and Apple Health imports in the encrypted vault', async ({ page }) => {
  const passphrase = 'playwright-passphrase';

  await page.goto('/');
  await page.getByLabel('Server token').fill('wtrack-local-dev');
  await page.getByRole('button', { name: 'Open vault server' }).click();

  const setupField = page.getByLabel('New vault passphrase');
  try {
    await setupField.waitFor({ state: 'visible', timeout: 2000 });
    await setupField.fill(passphrase);
    await page.getByRole('button', { name: 'Create encrypted vault' }).click();
  } catch {
    const unlockField = page.getByLabel('Vault passphrase');
    await expect(unlockField).toBeVisible();
    await unlockField.fill(passphrase);
    await page.getByRole('button', { name: 'Unlock vault' }).click();
  }

  await expect(page.getByRole('button', { name: 'Log weight' })).toBeVisible();

  await page.getByRole('button', { name: 'Log weight' }).click();
  await page.getByLabel("Today's weight (kg)").fill('84.5');
  await page.getByLabel('Note').first().fill('Initial manual note');
  await page.getByRole('button', { name: 'Drop it into the model' }).click();

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Initial manual note')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Note').fill('Edited manual note');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Edited manual note')).toBeVisible();

  await page.getByRole('button', { name: 'Open more navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme').selectOption('paper');
  await expect(page.locator('.app-shell')).toHaveClass(/theme-paper/);
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByLabel('Vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock vault' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-paper/);

  await page.getByRole('button', { name: 'Open more navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Server backup' }).click();
  await expect(page.getByText(/Last encrypted server backup|No encrypted server backup yet/)).toBeVisible();

  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByText('Apple Health import', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Keep detailed records')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Choose Health export' })).toBeVisible();
  await expect(page.getByText('Sleep and activity comparison')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sleep' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Body Link' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'export.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from(sampleXml),
  });

  await expect(page.getByText('Detailed', { exact: true })).toBeVisible();
  await expect(page.locator('.sleep-segment').first()).toBeVisible();
  await expect(page.locator('.sleep-context-segment').first()).toBeVisible();
  await expect(page.getByText('Sleep phases by night')).toBeVisible();

  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByText('Activity trends')).toBeVisible();
  await expect(page.getByText('Activity type breakdown')).toBeVisible();
  await expect(page.getByLabel('Min duration')).toBeVisible();

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Apple Health').first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Edited manual note')).toHaveCount(0);
});
