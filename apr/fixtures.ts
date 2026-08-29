import { test as base } from '@playwright/test';
import { AprReportRecorder } from './lib/reportRecorder';
import { AprConfig, loadAprConfig } from './config';

interface AprFixtures {
  aprConfig: AprConfig;
  aprReport: AprReportRecorder;
}

/**
 * Extends the base Playwright test with:
 *  - `aprConfig`: the env-driven run parameters (agent/date/hour/campaign), loaded once per test.
 *  - `aprReport`: a per-test comparison recorder, auto-attached to the test result on teardown so
 *    apr/reporter.ts can fold it into the consolidated apr-reports/*.html report.
 */
export const test = base.extend<AprFixtures>({
  aprConfig: async ({}, use) => {
    await use(loadAprConfig());
  },
  aprReport: async ({}, use, testInfo) => {
    const recorder = new AprReportRecorder(testInfo.title);
    await use(recorder);
    await recorder.attach(testInfo);
  },
});

export { expect } from '@playwright/test';
