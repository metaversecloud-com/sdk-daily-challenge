import { Request, Response } from "express";
import { errorHandler, getCredentials, getVisitor } from "@utils/index.js";
import { getCustomAnswers, getCustomAnswerData, saveCustomAnswers } from "@utils/wordquest/answerPool.js";
import { parseAnswerCsv } from "@utils/wordquest/parseAnswerCsv.js";
import { DEFAULT_ANSWER_LIST, MAX_CUSTOM_ANSWERS } from "@utils/wordquest/words.js";

const MAX_CSV_CHARS = 50_000;

const requireAdmin = async (credentials: any, res: Response) => {
  const { visitor } = await getVisitor(credentials, true);
  if (!visitor.isAdmin) {
    res.status(403).json({ success: false, error: "Admins only." });
    return false;
  }
  return true;
};

export const handleGetAnswerList = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;

    const { list: customAnswers, fileName } = await getCustomAnswerData(credentials);;
    

    return res.json({
        success: true,
        data: { 
            customAnswers, 
            fileName, 
            defaultCount: DEFAULT_ANSWER_LIST.length, 
            cap: MAX_CUSTOM_ANSWERS
        },
    });
  } catch (error) {
    return errorHandler({ error, functionName: "handleGetAnswerList", message: "Error getting answer list", req, res });
  }
};

export const handleSetAnswerList = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;

    const csv: string = typeof req.body.csv === "string" ? req.body.csv : "";
    if (!csv || csv.length > MAX_CSV_CHARS) {
      return res.status(400).json({ success: false, error: "Missing or oversized file." });
    }

    const { valid, rejected, error } = parseAnswerCsv(csv);
    if (error) return res.status(400).json({ success: false, error, rejected });

    // The name is only a label: strip any path and limit the length
    const rawName = typeof req.body.fileName === "string" ? req.body.fileName : "";
    const fileName = rawName.split(/[\\/]/).pop()?.slice(0, 100) || "Uploaded list";

    await saveCustomAnswers(credentials, valid, fileName);
    return res.json({ success: true, data: { count: valid.length, fileName, rejected } });
  } catch (error) {
    return errorHandler({ error, functionName: "handleSetAnswerList", message: "Error saving answer list", req, res });
  }
};

export const handleClearAnswerList = async (req: Request, res: Response) => {
  try {
    const credentials = getCredentials(req.query);
    if (!(await requireAdmin(credentials, res))) return;

    await saveCustomAnswers(credentials, []);
    return res.json({ success: true });
  } catch (error) {
    return errorHandler({ error, functionName: "handleClearAnswerList", message: "Error clearing answer list", req, res });
  }
};