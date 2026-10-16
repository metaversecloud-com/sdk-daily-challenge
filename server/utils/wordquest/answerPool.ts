import { getDroppedAsset } from "@utils/index.js";
import { DEFAULT_ANSWER_LIST, WORD_BANK_SET } from "./words.js";

export const getCustomAnswers = async (credentials: any): Promise<string[]> => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  const list = data?.customAnswers;
  return Array.isArray(list) ? list.filter((w: string) => WORD_BANK_SET.has(w)) : [];
};

export const getCustomAnswerFileName = async (credentials: any): Promise<string | null> => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  return typeof data?.customAnswersFileName === "string" ? data.customAnswersFileName : null;
};

// Custom list if it exists and has words, otherwise the default in code
export const getAnswerPool = async (credentials: any): Promise<string[]> => {
  const custom = await getCustomAnswers(credentials);
  return custom.length > 0 ? custom : DEFAULT_ANSWER_LIST;
};

export const saveCustomAnswers = async (credentials: any, list: string[], fileName: string | null = null) => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  const payload = { customAnswers: list, customAnswersFileName: list.length ? fileName : null };
  // Initialize first if the data object has never been set up
  if (!data || Object.keys(data).length === 0) await droppedAsset.setDataObject(payload);
  else await droppedAsset.updateDataObject(payload);
};

// helper method
export const getCustomAnswerData = async (credentials: any) => {
  const droppedAsset = await getDroppedAsset(credentials);
  const data = await droppedAsset.fetchDataObject();
  const list: string[] = Array.isArray(data?.customAnswers)
    ? data.customAnswers.filter((w: string) => WORD_BANK_SET.has(w))
    : [];
  const fileName = list.length && typeof data?.customAnswersFileName === "string" ? data.customAnswersFileName : null;
  return { list, fileName };
};