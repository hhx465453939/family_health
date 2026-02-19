import { useEffect, useState } from "react";

import { api, ApiError } from "../api/client";
import type { ExportCandidateChat, ExportCandidateKb, ExportJob } from "../api/types";
import { DesensitizationModal } from "../components/DesensitizationModal";

type Locale = "zh" | "en";

const TEXT = {
  zh: {
    init: "准备创建导出任务",
    readFailed: "导出任务读取失败",
    chooseType: "至少选择一种导出类型",
    createDone: "导出任务创建成功",
    createFailed: "导出任务创建失败",
    deleteDone: "任务已删除",
    deleteFailed: "删除任务失败",
    downloadDone: "下载已开始",
    downloadFailed: "下载失败，请确认任务状态为 done",
    filters: "导出筛选器",
    chat: "聊天记录",
    kb: "知识库文档",
    includeRaw: "包含原始文件（谨慎）",
    includeSanitized: "包含脱敏文本",
    chatLimit: "聊天导出条数上限",
    create: "创建打包任务",
    jobs: "导出任务列表",
    download: "下载",
    delete: "删除",
  },
  en: {
    init: "Ready to create export jobs",
    readFailed: "Failed to load export jobs",
    chooseType: "Select at least one export type",
    createDone: "Export job created",
    createFailed: "Failed to create export job",
    deleteDone: "Job deleted",
    deleteFailed: "Failed to delete job",
    downloadDone: "Download started",
    downloadFailed: "Download failed. Ensure job status is done",
    filters: "Export Filters",
    chat: "Chat Records",
    kb: "Knowledge Base Docs",
    includeRaw: "Include raw files (careful)",
    includeSanitized: "Include sanitized text",
    chatLimit: "Chat export limit",
    create: "Create Package Job",
    jobs: "Export Jobs",
    download: "Download",
    delete: "Delete",
  },
} as const;

export function ExportCenter({ token, locale }: { token: string; locale: Locale }) {
  const text = TEXT[locale];
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [includeRaw, setIncludeRaw] = useState(false);
  const [includeSanitized, setIncludeSanitized] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [kbEnabled, setKbEnabled] = useState(true);
  const [chatLimit, setChatLimit] = useState(200);
  const [message, setMessage] = useState<string>(text.init);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [chatCandidates, setChatCandidates] = useState<ExportCandidateChat[]>([]);
  const [kbCandidates, setKbCandidates] = useState<ExportCandidateKb[]>([]);
  const [previewText, setPreviewText] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [candidateType, setCandidateType] = useState<"chat" | "kb">("chat");
  const [candidateFilter, setCandidateFilter] = useState("");
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);

  const loadJobs = async () => {
    try {
      const res = await api.listExportJobs(token);
      setJobs(res.items);
      setSelectedJobs([]);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.readFailed);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const createJob = async () => {
    const exportTypes = [chatEnabled ? "chat" : "", kbEnabled ? "kb" : ""].filter(Boolean);
    if (exportTypes.length === 0) {
      setMessage(text.chooseType);
      return;
    }
    setReviewOpen(true);
    setCandidatesLoading(true);
    try {
      const res = await api.listExportCandidates(
        {
          member_scope: "global",
          export_types: exportTypes,
          include_raw_file: includeRaw,
          include_sanitized_text: includeSanitized,
          filters: { chat_limit: chatLimit },
        },
        token,
      );
      setChatCandidates(res.chat_messages);
      setKbCandidates(res.kb_documents);
      setCandidateType(chatEnabled ? "chat" : "kb");
      setPreviewText("");
      setPreviewName("");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.createFailed);
      setReviewOpen(false);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const removeJob = async (jobId: string) => {
    try {
      await api.deleteExportJob(jobId, token);
      setMessage(text.deleteDone);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.deleteFailed);
    }
  };

  const download = async (jobId: string) => {
    try {
      const blob = await api.downloadExportJob(jobId, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${jobId}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(text.downloadDone);
    } catch {
      setMessage(text.downloadFailed);
    }
  };

  const batchDownload = async () => {
    if (selectedJobs.length === 0) {
      setMessage(locale === "zh" ? "请选择要下载的任务" : "Select jobs to download");
      return;
    }
    for (const jobId of selectedJobs) {
      try {
        const blob = await api.downloadExportJob(jobId, token);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${jobId}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch {
        setMessage(text.downloadFailed);
        return;
      }
    }
    setMessage(text.downloadDone);
  };

  return (
    <section className="page-grid two-cols">
      <div className="panel">
        <h3>{text.filters}</h3>
        <label className="inline-check">
          <input type="checkbox" checked={chatEnabled} onChange={(e) => setChatEnabled(e.target.checked)} />
          {text.chat}
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={kbEnabled} onChange={(e) => setKbEnabled(e.target.checked)} />
          {text.kb}
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={includeRaw} onChange={(e) => setIncludeRaw(e.target.checked)} />
          {text.includeRaw}
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={includeSanitized} onChange={(e) => setIncludeSanitized(e.target.checked)} />
          {text.includeSanitized}
        </label>

        <label>
          {text.chatLimit}
          <input type="number" value={chatLimit} min={1} max={1000} onChange={(e) => setChatLimit(Number(e.target.value))} />
        </label>

        <button type="button" onClick={createJob}>
          {text.create}
        </button>
        <p className="inline-message">{message}</p>
      </div>

      <div className="panel">
        <h3>{text.jobs}</h3>
        <div className="actions">
          <button type="button" onClick={batchDownload}>
            {locale === "zh" ? "批量下载" : "Batch Download"}
          </button>
        </div>
        <div className="list">
          {jobs.map((item) => (
            <article key={item.id} className="list-item">
              <div>
                <strong>{item.id.slice(0, 8)}</strong>
                <small>
                  {item.status} | {item.export_types.join(",")}
                </small>
              </div>
              <div className="actions">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={selectedJobs.includes(item.id)}
                    onChange={(e) =>
                      setSelectedJobs((prev) =>
                        e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id),
                      )
                    }
                  />
                </label>
                <button type="button" onClick={() => void download(item.id)}>
                  {text.download}
                </button>
                <button type="button" className="ghost" onClick={() => void removeJob(item.id)}>
                  {text.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <DesensitizationModal
        open={reviewOpen}
        token={token}
        locale={locale}
        title={locale === "zh" ? "导出脱敏预览" : "Export Preview & Mask"}
        previewText={previewText}
        previewName={previewName}
        confirmLabel={locale === "zh" ? "确认导出" : "Create Export"}
        onCancel={() => setReviewOpen(false)}
        onConfirm={async () => {
          const exportTypes = [chatEnabled ? "chat" : "", kbEnabled ? "kb" : ""].filter(Boolean);
          if (exportTypes.length === 0) return;
          if (includeRaw) {
            const ok = window.confirm(locale === "zh" ? "将包含原始文件（可能含敏感信息），确认继续？" : "Including raw files may expose sensitive data. Continue?");
            if (!ok) {
              return;
            }
          }
          try {
            await api.createExportJob(
              {
                member_scope: "global",
                export_types: exportTypes,
                include_raw_file: includeRaw,
                include_sanitized_text: includeSanitized,
                filters: { chat_limit: chatLimit },
              },
              token,
            );
            setMessage(text.createDone);
            await loadJobs();
            setReviewOpen(false);
          } catch (error) {
            setMessage(error instanceof ApiError ? error.message : text.createFailed);
          }
        }}
        extraControls={(
          <div className="panel" style={{ border: "1px dashed rgba(255,255,255,0.15)", background: "transparent" }}>
            <strong>{locale === "zh" ? "导出预览" : "Export Preview"}</strong>
            <div className="inline-check">
              <label>
                <input type="radio" checked={candidateType === "chat"} onChange={() => setCandidateType("chat")} />
                {text.chat}
              </label>
              <label>
                <input type="radio" checked={candidateType === "kb"} onChange={() => setCandidateType("kb")} />
                {text.kb}
              </label>
              <input
                placeholder={locale === "zh" ? "搜索候选项" : "Search candidates"}
                value={candidateFilter}
                onChange={(e) => setCandidateFilter(e.target.value)}
              />
            </div>
            {candidatesLoading && <div className="inline-message">{locale === "zh" ? "加载中..." : "Loading..."}</div>}
            <div className="list" style={{ maxHeight: 200, overflow: "auto" }}>
              {(candidateType === "chat" ? chatCandidates : kbCandidates)
                .filter((item) => {
                  const key = candidateType === "chat"
                    ? (item as ExportCandidateChat).preview
                    : `${(item as ExportCandidateKb).kb_name} ${(item as ExportCandidateKb).source_path ?? ""}`;
                  return key.toLowerCase().includes(candidateFilter.toLowerCase());
                })
                .map((item) => (
                  <article key={item.id} className="list-item" onClick={async () => {
                    try {
                      if (candidateType === "chat") {
                        const res = await api.previewChatMessage(item.id, token);
                        setPreviewText(res.text);
                        setPreviewName(res.file_name);
                      } else {
                        const res = await api.previewKbDocument(item.id, token, "raw");
                        setPreviewText(res.text);
                        setPreviewName(res.file_name);
                      }
                    } catch (error) {
                      setMessage(error instanceof ApiError ? error.message : text.readFailed);
                    }
                  }}>
                    {candidateType === "chat" ? (
                      <div>
                        <strong>{(item as ExportCandidateChat).role}</strong>
                        <small>{(item as ExportCandidateChat).preview}</small>
                      </div>
                    ) : (
                      <div>
                        <strong>{(item as ExportCandidateKb).kb_name}</strong>
                        <small>{(item as ExportCandidateKb).source_path ?? (item as ExportCandidateKb).masked_path ?? item.id}</small>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          </div>
        )}
      />
    </section>
  );
}
