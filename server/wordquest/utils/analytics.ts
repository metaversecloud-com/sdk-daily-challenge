type Analytic = {
  analyticName: string;
  profileId?: string;
  urlSlug?: string;
  uniqueKey?: string;
  incrementBy?: number;
};

export type AnalyticsMode = "daily" | "timed" | "oneshot";
type Kind = "starts" | "completions" | "wins" | "losses";

const today = () => new Date().toISOString().slice(0, 10);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// Each event is recorded twice: once as a standard name (totals across modes)
// and once per mode (e.g. "timedWins"), so the dashboard can show both views.
export const modeEvents = (mode: AnalyticsMode, kinds: Kind[], profileId: string): Analytic[] =>
  kinds.flatMap((kind) => {
    const uniqueKey = `${profileId}-${mode}-${today()}`; // one per player, per mode, per day
    return [
      { analyticName: kind, profileId, uniqueKey },
      { analyticName: `${mode}${cap(kind)}`, profileId, uniqueKey },
    ];
  });

export const badgeEvents = (names: string[], profileId: string): Analytic[] =>
  names.map((name) => ({
    analyticName: "badgesAwarded",
    profileId,
    uniqueKey: `${profileId}-${name}`, // each badge counts once per player
  }));

// Never throws: analytics must not break a guess or a badge grant.
export const trackAnalytics = async (
  target: { updateDataObject: (data: object, options?: any) => Promise<unknown> },
  urlSlug: string,
  events: Analytic[],
) => {
  if (!events.length) return;
  try {
    await target.updateDataObject({}, { analytics: events.map((e) => ({ ...e, urlSlug })) });
  } catch (error) {
    console.error("Analytics failed:", error);
  }
};