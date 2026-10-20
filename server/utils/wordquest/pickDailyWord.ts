export const pickDailyWord = (date: string, pool: string[]): string => {
  if (pool.length === 0) throw new Error("Answer pool is empty");
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
};

export const getTodayDateString = (): string => new Date().toISOString().split("T")[0];