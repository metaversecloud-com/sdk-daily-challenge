import { getCredentials } from "@utils/index.js";
import { getWordQuestKey, getWordQuestVisitorData } from "../controllers/getWordQuestVisitorData.js";
import type { WordQuestVisitorData } from "@shared/types/WordQuestTypes.js";

type Visitor = Awaited<ReturnType<typeof getWordQuestVisitorData>>["visitor"];

// updateDataObject on a plain top-level key persists; setDataObject on existing data did not.
// Keeps whatever else lives under this key (e.g. Word Hunt).
export const saveWordQuestData = async (
  visitor: Visitor,
  credentials: ReturnType<typeof getCredentials>,
  wordQuestData: WordQuestVisitorData,
) => {
    const key = getWordQuestKey(credentials);
    const dataObject = (await visitor.fetchDataObject()) as Record<string, any> | undefined;
    const { challenge: _challenge, ...rest } = wordQuestData; // challenge runs are stored separately
    await visitor.updateDataObject({ [key]: { ...dataObject?.[key], wordquest: rest } }, {});
};