import { useEffect, useState } from "react";
import { backendAPI } from "@/utils";
import {
  AnswerListData,
  getCachedAnswerList,
  loadAnswerList,
  setCachedAnswerList,
} from "./answerListCache";

interface Rejected {
  word: string;
  reason: string;
}

export const WordQuestAnswerAdmin = () => {
  // Starts filled in if the preload already finished
  const [data, setData] = useState<AnswerListData | null>(getCachedAnswerList());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [rejected, setRejected] = useState<Rejected[]>([]);

  useEffect(() => {
    if (data) return;
    loadAnswerList()
      .then(setData)
      .catch(() => {
        setIsError(true);
        setMessage("Could not load the answer list.");
      });
  }, []);

  const update = (next: AnswerListData) => {
    setCachedAnswerList(next);
    setData(next);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy || !data) return;
    setBusy(true);
    try {
      const csv = await file.text();
      const r = await backendAPI.post("/answers", { csv, fileName: file.name });
      const { count, fileName, rejected: skipped } = r.data.data;
      // Words aren't returned by the upload, so keep a placeholder array of the right length
      update({ ...data, customAnswers: new Array(count).fill(""), fileName });
      setRejected(skipped);
      setIsError(false);
      setMessage(`Saved ${count} words from ${fileName}.`);
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.response?.data?.error || "Upload failed.");
      setRejected(err?.response?.data?.rejected || []);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (busy || !data) return;
    setBusy(true);
    try {
      await backendAPI.delete("/answers");
      update({ ...data, customAnswers: [], fileName: null });
      setRejected([]);
      setIsError(false);
      setMessage("Custom list cleared. Using the default list.");
    } catch {
      setIsError(true);
      setMessage("Could not clear the list.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <p className={`p3 my-4 ${isError ? "wordquest-error" : ""}`} role={isError ? "alert" : "status"}>
        {message ?? "Loading answer list…"}
      </p>
    );
  }

  const customCount = data.customAnswers.length;

  return (
    <section className="flex flex-col gap-3 my-4" aria-labelledby="answer-admin-heading">
      <h3 className="h4" id="answer-admin-heading">Answer list</h3>
      <p className="p3">
        {customCount > 0
          ? `Using custom list: ${data.fileName ?? "uploaded file"} (${customCount} words).`
          : `Using the default list (${data.defaultCount} words).`}{" "}
        Max {data.cap} words. Every word must be in the word bank.
      </p>

      <label className="label" htmlFor="answer-csv">Upload CSV</label>
      <input
        id="answer-csv"
        className="input"
        type="file"
        accept=".csv,.txt,text/csv"
        disabled={busy}
        onChange={handleFile}
      />

      {message && (
        <p className={`p3 ${isError ? "wordquest-error" : ""}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}
      {rejected.length > 0 && (
        <details className="p3">
          <summary>{rejected.length} words skipped</summary>
          <ul>
            {rejected.map((r, i) => (
              <li key={i}>{r.word}: {r.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {customCount > 0 && (
        <button type="button" className="btn btn-outline" disabled={busy} onClick={handleClear}>
          Reset to default list
        </button>
      )}
    </section>
  );
};