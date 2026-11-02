import { getCredentials, getVisitor } from "@utils/index.js";
import { getChallengeKey, getWordQuestVisitorData } from "../../controllers/getWordQuestVisitorData.js";
import type { ChallengeMode, ChallengeRun, WordQuestVisitorData } from "@shared/types/WordQuestTypes.js";

type Visitor = Awaited<ReturnType<typeof getWordQuestVisitorData>>["visitor"];

export const saveChallengeRun = async (
  visitor: Visitor,
  credentials: ReturnType<typeof getCredentials>,
  _wordQuestData: WordQuestVisitorData, // no longer needed, kept so callers don't change
  mode: ChallengeMode,
  run: ChallengeRun,
) => {
  const challengeKey = getChallengeKey(credentials, mode);
  await visitor.updateDataObject({ [challengeKey]: JSON.stringify(run) }, {});

  // TEMP: confirm it stuck
  const check = (await (await getVisitor(credentials, true)).visitor.fetchDataObject()) as any;
  console.log("CHALLENGE SAVED?", typeof check?.[challengeKey] === "string");
};