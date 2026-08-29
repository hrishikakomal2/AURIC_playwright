import { test as base } from '@playwright/test';
import { AprReportRecorder } from '../apr/lib/reportRecorder';
import { NewAppConfig, loadNewAppConfig } from './config';

interface NewAppFixtures {
  newAppConfig: NewAppConfig;
  newAppReport: AprReportRecorder;
}

/**
 * Extends the base Playwright test with this environment's own env-driven config and its own
 * per-test comparison recorder (attached to the test result on teardown, so apr-new-app/reporter.ts
 * can fold it into apr-new-app-reports/*.html — kept separate from the existing suite's
 * apr-reports/*.html). See apr-new-app/README.md "Isolation from the existing suite".
 */
export const test = base.extend<NewAppFixtures>({
  newAppConfig: async ({}, use) => {
    await use(loadNewAppConfig());
  },
  newAppReport: async ({}, use, testInfo) => {
    const recorder = new AprReportRecorder(testInfo.title);
    await use(recorder);
    await recorder.attach(testInfo, 'new-app-comparison');
  },
});

export { expect } from '@playwright/test';
