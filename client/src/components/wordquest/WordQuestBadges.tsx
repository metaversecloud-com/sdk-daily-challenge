import type { BadgeType } from "@shared/types/WordQuestTypes";

// Badge names, grouped for display. Must match the ecosystem item names.
const GROUPS: { title: string; names: string[] }[] = [
  {
    title: "Daily word",
    names: ["First Win", "Hot Streak", "Week Warrior", "Month Master", "Hole in One", "Quick Draw", "Close Call", "Regular", "Century"],
  },
  {
    title: "Timed",
    names: ["First Tick", "Beat the Clock", "Speed Demon", "Photo Finish", "Efficient", "Podium (Timed)", "Time Keeper"],
  },
  {
    title: "One Shot",
    names: ["Opening Shot", "Survivor", "Sharpshooter", "Lucky Strike", "Nerves of Steel", "Podium (One Shot)", "Iron Will"],
  },
  { title: "Across modes", names: ["All-Rounder", "Triple Threat", "Daily Devotion"] },
];

interface Props {
  badges?: Record<string, BadgeType>;
  owned?: Record<string, unknown>; // visitorInventory.badges
}

export const WordQuestBadges = ({ badges, owned }: Props) => {
  const all = badges ?? {};
  if (Object.keys(all).length === 0) return <p className="p3">No badges available yet.</p>;

  // Anything in the ecosystem that isn't in a group still shows up, under "Other"
  const grouped = new Set(GROUPS.flatMap((g) => g.names));
  const other = Object.keys(all).filter((name) => !grouped.has(name));
  const groups = [...GROUPS, ...(other.length ? [{ title: "Other", names: other }] : [])]
    .map((g) => ({ title: g.title, items: g.names.map((n) => all[n]).filter(Boolean) as BadgeType[] }))
    .filter((g) => g.items.length > 0);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const earnedTotal = groups.reduce((n, g) => n + g.items.filter((b) => owned?.[b.name]).length, 0);

  return (
    <div className="wordquest-badges">
      <h2 className="h4">Badges</h2>
      <p className="p3 wordquest-badges-count">
        {earnedTotal} of {total} earned
      </p>

      {groups.map((group) => (
        <section key={group.title} className="wordquest-badge-group" aria-label={group.title}>
          <h3 className="wordquest-badge-group-title">
            {group.title}{" "}
            <span className="wordquest-badge-group-count">
              {group.items.filter((b) => owned?.[b.name]).length}/{group.items.length}
            </span>
          </h3>
          <ul className="wordquest-badge-grid">
            {group.items.map((badge) => {
              const earned = !!owned?.[badge.name];
              return (
                <li key={badge.name} className={earned ? "wordquest-badge is-earned" : "wordquest-badge"}>
                  <img src={badge.icon} alt="" width={72} height={72} loading="lazy" />
                  <span className="p3 wordquest-badge-name">{badge.name}</span>
                  {badge.description && <span className="wordquest-badge-desc">{badge.description}</span>}
                  <span className="sr-only">{earned ? "Earned" : "Not earned yet"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};