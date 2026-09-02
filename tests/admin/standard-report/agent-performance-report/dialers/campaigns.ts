export interface DialerCampaign {
  name: string;
  type: string;
}

/**
 * Campaign identity for each dialer type, colocated with the tests that use it. A campaign's
 * dialer type is fixed per account (not a per-run setting like date range or agent), so it
 * belongs here rather than as separate APR_*_CAMPAIGN_* vars in the shared .env — this way every
 * file in this folder can run together in one `playwright test .../dialers` pass without touching
 * .env at all. Fill in the blank `name` values with real campaign names from your account
 * (Users/Campaigns admin screen); leave the `type` values as-is unless your app's dropdown options
 * differ.
 *
 * `manualDials` turned out to follow the exact same pattern as the other five: confirmed live,
 * the Calls page's "Campaign Type" dropdown lists "Click To Call" alongside Preview Auto/Manual,
 * Predictive/Progressive/Power Dialer — so Manual Dials is keyed by Campaign Type too, not by
 * Call Type as originally assumed (see manual-dials.spec.ts's history for that earlier, wrong
 * assumption).
 */
export const DIALER_CAMPAIGNS: Record<'power' | 'predictive' | 'progressive' | 'previewAuto' | 'previewManual' | 'manualDials', DialerCampaign> = {
  previewAuto: { name: 'Preview auto-hrishika', type: 'Preview Auto' },
  previewManual: { name: 'preview manual', type: 'Preview Manual' },
  power: { name: 'pow pow', type: 'Power Dialer' },
  progressive: { name: 'progreeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', type: 'Progressive Dialer' },
  predictive: { name: 'predictive dialer', type: 'Predictive Dialer' },
  manualDials: { name: 'www', type: 'Click To Call' },
};
