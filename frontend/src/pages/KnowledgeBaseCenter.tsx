import { useEffect, useState } from "react";

import { api, ApiError } from "../api/client";
import type { KnowledgeBase } from "../api/types";

type Locale = "zh" | "en";

const TEXT = {
  zh: {
    waiting: "等待构建",
    kbReadFailed: "知识库读取失败",
    docReadFailed: "文档状态读取失败",
    created: "知识库已创建",
    createFailed: "创建知识库失败",
    buildFailed: "构建失败",
    queryFailed: "检索失败",
    leftTitle: "知识库列表与参数",
    kbName: "KB 名称",
    createKb: "创建 KB",
    rightTitle: "构建与任务时间线",
    docTitle: "文档标题",
    docContent: "文档内容",
    build: "构建",
    query: "检索 Query",
    search: "检索",
    docStatus: "文档状态",
    queryResult: "检索结果",
    queryHit: "命中",
    docPlaceholder: "请输入文档内容，可粘贴 markdown。",
  },
  en: {
    waiting: "Waiting to build",
    kbReadFailed: "Failed to load knowledge bases",
    docReadFailed: "Failed to load document status",
    created: "Knowledge base created",
    createFailed: "Failed to create knowledge base",
    buildFailed: "Build failed",
    queryFailed: "Retrieval failed",
    leftTitle: "Knowledge Bases & Params",
    kbName: "KB Name",
    createKb: "Create KB",
    rightTitle: "Build & Timeline",
    docTitle: "Document Title",
    docContent: "Document Content",
    build: "Build",
    query: "Retrieval Query",
    search: "Search",
    docStatus: "Document Status",
    queryResult: "Retrieval Results",
    queryHit: "Hits",
    docPlaceholder: "Paste document content (markdown is supported).",
  },
} as const;

export function KnowledgeBaseCenter({ token, role, locale }: { token: string; role: string; locale: Locale }) {
  const text = TEXT[locale];
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [activeKbId, setActiveKbId] = useState("");
  const [kbName, setKbName] = useState("family-kb");
  const [docTitle, setDocTitle] = useState("doc-1");
  const [docContent, setDocContent] = useState<string>(text.docPlaceholder);
  const [query, setQuery] = useState<string>(locale === "zh" ? "高血压" : "hypertension");
  const [queryResult, setQueryResult] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState<string>(text.waiting);

  const canWrite = role !== "viewer";

  const loadKb = async () => {
    try {
      const res = await api.listKb(token);
      setKbList(res.items);
      if (!activeKbId && res.items.length > 0) {
        setActiveKbId(res.items[0].id);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.kbReadFailed);
    }
  };

  useEffect(() => {
    void loadKb();
  }, []);

  const loadTimeline = async (kbId: string) => {
    try {
      const res = await api.listKbDocuments(kbId, token);
      setTimeline(res.items);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.docReadFailed);
    }
  };

  useEffect(() => {
    if (activeKbId) {
      void loadTimeline(activeKbId);
    }
  }, [activeKbId]);

  const createKb = async () => {
    if (!canWrite) {
      return;
    }
    try {
      const kb = await api.createKb(
        {
          name: kbName,
          member_scope: "global",
          chunk_size: 1000,
          chunk_overlap: 150,
          top_k: 8,
          rerank_top_n: 4,
        },
        token,
      );
      setKbList((prev) => [kb, ...prev]);
      setActiveKbId(kb.id);
      setMessage(text.created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.createFailed);
    }
  };

  const build = async () => {
    if (!activeKbId || !canWrite) {
      return;
    }
    try {
      const res = await api.buildKb(activeKbId, [{ title: docTitle, content: docContent }], token);
      setMessage(`docs=${res.documents}, chunks=${res.chunks}, status=${res.status}`);
      await loadTimeline(activeKbId);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.buildFailed);
    }
  };

  const search = async () => {
    if (!activeKbId) {
      return;
    }
    try {
      const res = await api.retrievalQuery({ kb_id: activeKbId, query, top_k: 5 }, token);
      const resultText = res.items.map((item) => String(item.text ?? ""));
      setQueryResult(resultText);
      setMessage(`${text.queryHit} ${resultText.length}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.queryFailed);
    }
  };

  return (
    <section className="page-grid two-cols">
      <div className="panel">
        <h3>{text.leftTitle}</h3>
        <label>
          {text.kbName}
          <input value={kbName} onChange={(e) => setKbName(e.target.value)} />
        </label>
        <button type="button" onClick={createKb} disabled={!canWrite}>
          {text.createKb}
        </button>

        <div className="list">
          {kbList.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeKbId ? "session-item active" : "session-item"}
              onClick={() => setActiveKbId(item.id)}
            >
              <strong>{item.name}</strong>
              <small>{item.status}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>{text.rightTitle}</h3>
        <label>
          {text.docTitle}
          <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
        </label>
        <label>
          {text.docContent}
          <textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} rows={6} />
        </label>
        <button type="button" onClick={build} disabled={!activeKbId || !canWrite}>
          {text.build}
        </button>

        <label>
          {text.query}
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" onClick={search} disabled={!activeKbId}>
          {text.search}
        </button>

        <div className="mini-grid">
          <div>
            <h4>{text.docStatus}</h4>
            <ul>
              {timeline.map((item) => (
                <li key={String(item.id)}>
                  {String(item.id).slice(0, 8)} - {String(item.status)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>{text.queryResult}</h4>
            <ul>
              {queryResult.map((item, idx) => (
                <li key={`${idx}-${item.slice(0, 10)}`}>{item.slice(0, 80)}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="inline-message">{message}</p>
      </div>
    </section>
  );
}
