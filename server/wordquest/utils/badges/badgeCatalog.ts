// Names must match the BADGE items in the ecosystem inventory exactly
// (the ZIP you upload to Topia). Icon files are named after the `icon` key.
export const BADGES = {
  // Daily word
  firstWin: "First Win",
  hotStreak: "Hot Streak",
  weekWarrior: "Week Warrior",
  monthMaster: "Month Master",
  holeInOne: "Hole in One",
  quickDraw: "Quick Draw",
  closeCall: "Close Call",
  regular: "Regular",
  century: "Century",
  // Timed
  firstTick: "First Tick",
  beatTheClock: "Beat the Clock",
  speedDemon: "Speed Demon",
  photoFinish: "Photo Finish",
  efficient: "Efficient",
  timedPodium: "Podium (Timed)",
  timeKeeper: "Time Keeper",
  // One Shot
  openingShot: "Opening Shot",
  survivor: "Survivor",
  sharpshooter: "Sharpshooter",
  luckyStrike: "Lucky Strike",
  nervesOfSteel: "Nerves of Steel",
  oneShotPodium: "Podium (One Shot)",
  ironWill: "Iron Will",
  // Across modes
  allRounder: "All-Rounder",
  tripleThreat: "Triple Threat",
  dailyDevotion: "Daily Devotion",
} as const;

export type BadgeName = (typeof BADGES)[keyof typeof BADGES];

// Inventory item names have to be unique, so the two Podiums are different names.
// (Show them in the UI as "Podium" if you like by stripping the parentheses.)
export const BADGE_ICONS: Record<BadgeName, string> = {
  "First Win": "daily-first-win.png",
  "Hot Streak": "daily-hot-streak.png",
  "Week Warrior": "daily-week-warrior.png",
  "Month Master": "daily-month-master.png",
  "Hole in One": "daily-hole-in-one.png",
  "Quick Draw": "daily-quick-draw.png",
  "Close Call": "daily-close-call.png",
  Regular: "daily-regular.png",
  Century: "daily-century.png",
  "First Tick": "timed-first-tick.png",
  "Beat the Clock": "timed-beat-the-clock.png",
  "Speed Demon": "timed-speed-demon.png",
  "Photo Finish": "timed-photo-finish.png",
  Efficient: "timed-efficient.png",
  "Podium (Timed)": "timed-podium.png",
  "Time Keeper": "timed-time-keeper.png",
  "Opening Shot": "oneshot-opening-shot.png",
  Survivor: "oneshot-survivor.png",
  Sharpshooter: "oneshot-sharpshooter.png",
  "Lucky Strike": "oneshot-lucky-strike.png",
  "Nerves of Steel": "oneshot-nerves-of-steel.png",
  "Podium (One Shot)": "oneshot-podium.png",
  "Iron Will": "oneshot-iron-will.png",
  "All-Rounder": "across-all-rounder.png",
  "Triple Threat": "across-triple-threat.png",
  "Daily Devotion": "across-daily-devotion.png",
};