import { backendAPI } from "@/utils";

export interface AnswerListData {
  customAnswers: string[];
  fileName: string | null;
  defaultCount: number;
  cap: number;
}

let cached: AnswerListData | null = null;
let inflight: Promise<AnswerListData> | null = null;

export const getCachedAnswerList = () => cached;
export const setCachedAnswerList = (data: AnswerListData) => {
  cached = data;
};

// Returns the cache if there is one, otherwise fetches (one request at a time)
export const loadAnswerList = (): Promise<AnswerListData> => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = backendAPI
      .get("/answers")
      .then((r) => {
        cached = r.data.data as AnswerListData;
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};