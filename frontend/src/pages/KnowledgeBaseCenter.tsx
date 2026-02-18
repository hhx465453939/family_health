import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "../api/client";
import type { KbDocument, KnowledgeBase, ModelCatalog } from "../api/types";

type Locale = "zh" | "en";
type Strategy = "keyword" | "semantic" | "hybrid";

const TEXT = {
  zh: {
    loading: "等待处理",
    listTitle: "知识库管理",
    create: "新建 KB",
    save: "保存配置",
    name: "知识库名称",
    chunkSize: "Chunk 大小",
    chunkOverlap: "Chunk 重叠",
    topK: "Top K",
    rerankTopN: "Rerank Top N",
    useGlobal: "使用全局默认参数",
    embedding: "Embedding 模型",
    reranker: "Reranker 模型",
    semantic: "语义检索模型(LLM)",
    strategy: "检索策略",
    keywordWeight: "关键词权重",
    semanticWeight: "语义权重",
    rerankWeight: "重排权重",
    buildTitle: "文档构建",
    docTitle: "文本标题",
    docContent: "文本内容",
    buildFromText: "用文本构建",
    uploadDoc: "上传文档构建",
    queryTitle: "检索测试",
    query: "查询",
    search: "检索",
    docs: "文档列表",
    result: "结果",
    created: "知识库已创建",
    updated: "知识库配置已保存",
    deleted: "知识库已删除",
    uploaded: "文档上传并入库成功",
    built: "文本构建完成",
    searched: "检索完成",
    failedLoad: "知识库加载失败",
    failedCreate: "知识库创建失败",
    failedUpdate: "知识库更新失败",
    failedDelete: "知识库删除失败",
    failedBuild: "构建失败",
    failedUpload: "上传失败",
    failedSearch: "检索失败",
    failedDocs: "文档读取失败",
    failedDeleteDoc: "删除文档失败",
    placeholder: "建议粘贴 markdown 文本",
  },
  en: {
    loading: "Waiting",
    listTitle: "Knowledge Base Management",
    create: "Create KB",
    save: "Save Config",
    name: "KB Name",
    chunkSize: "Chunk Size",
    chunkOverlap: "Chunk Overlap",
    topK: "Top K",
    rerankTopN: "Rerank Top N",
    useGlobal: "Use global default parameters",
    embedding: "Embedding Model",
    reranker: "Reranker Model",
    semantic: "Semantic Retrieval Model (LLM)",
    strategy: "Retrieval Strategy",
    keywordWeight: "Keyword Weight",
    semanticWeight: "Semantic Weight",
    rerankWeight: "Rerank Weight",
    buildTitle: "Build Documents",
    docTitle: "Text Title",
    docContent: "Text Content",
    buildFromText: "Build from Text",
    uploadDoc: "Upload Document",
    queryTitle: "Retrieval Test",
    query: "Query",
    search: "Search",
    docs: "Documents",
    result: "Results",
    created: "Knowledge base created",
    updated: "Knowledge base updated",
    deleted: "Knowledge base deleted",
    uploaded: "Document uploaded and indexed",
    built: "Text build completed",
    searched: "Search completed",
    failedLoad: "Failed to load KB",
    failedCreate: "Failed to create KB",
    failedUpdate: "Failed to update KB",
    failedDelete: "Failed to delete KB",
    failedBuild: "Build failed",
    failedUpload: "Upload failed",
    failedSearch: "Search failed",
    failedDocs: "Failed to load documents",
    failedDeleteDoc: "Failed to delete document",
    placeholder: "Markdown content is recommended",
  },
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function KnowledgeBaseCenter({ token, role, locale }: { token: string; role: string; locale: Locale }) {
  const text = TEXT[locale];
  const canWrite = role !== "viewer";
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog[]>([]);
  const [activeKbId, setActiveKbId] = useState("");
  const [message, setMessage] = useState<string>(text.loading);

  const [form, setForm] = useState({
    name: "family-kb",
    chunk_size: 1000,
    chunk_overlap: 150,
    top_k: 8,
    rerank_top_n: 4,
    use_global_defaults: true,
    embedding_model_id: "",
    reranker_model_id: "",
    semantic_model_id: "",
    retrieval_strategy: "hybrid" as Strategy,
    keyword_weight: 0.4,
    semantic_weight: 0.4,
    rerank_weight: 0.2,
  });
  const [docTitle, setDocTitle] = useState("doc-1");
  const [docContent, setDocContent] = useState<string>(text.placeholder);
  const [query, setQuery] = useState(locale === "zh" ? "高血压 用药" : "hypertension medication");
  const [queryResult, setQueryResult] = useState<Array<Record<string, unknown>>>([]);

  const activeKb = useMemo(() => kbList.find((x) => x.id === activeKbId) ?? null, [activeKbId, kbList]);
  const embeddingModels = useMemo(() => catalog.filter((x) => x.model_type === "embedding"), [catalog]);
  const rerankerModels = useMemo(() => catalog.filter((x) => x.model_type === "reranker"), [catalog]);
  const semanticModels = useMemo(() => catalog.filter((x) => x.model_type === "llm"), [catalog]);

  const loadKb = async () => {
    try {
      const [kbRes, modelRes] = await Promise.all([api.listKb(token), api.listCatalog(token)]);
      setKbList(kbRes.items);
      setCatalog(modelRes.items);
      if (!activeKbId && kbRes.items.length > 0) {
        setActiveKbId(kbRes.items[0].id);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedLoad);
    }
  };

  const loadDocs = async (kbId: string) => {
    try {
      const res = await api.listKbDocuments(kbId, token);
      setDocs(res.items as KbDocument[]);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedDocs);
    }
  };

  useEffect(() => {
    void loadKb();
  }, []);

  useEffect(() => {
    if (!activeKb) {
      return;
    }
    setForm({
      name: activeKb.name,
      chunk_size: activeKb.chunk_size,
      chunk_overlap: activeKb.chunk_overlap,
      top_k: activeKb.top_k,
      rerank_top_n: activeKb.rerank_top_n,
      use_global_defaults: activeKb.use_global_defaults,
      embedding_model_id: activeKb.embedding_model_id ?? "",
      reranker_model_id: activeKb.reranker_model_id ?? "",
      semantic_model_id: activeKb.semantic_model_id ?? "",
      retrieval_strategy: activeKb.retrieval_strategy,
      keyword_weight: activeKb.keyword_weight,
      semantic_weight: activeKb.semantic_weight,
      rerank_weight: activeKb.rerank_weight,
    });
    void loadDocs(activeKb.id);
  }, [activeKbId]);

  const createKb = async () => {
    if (!canWrite) {
      return;
    }
    try {
      const created = await api.createKb(
        {
          name: form.name,
          member_scope: "global",
          chunk_size: form.chunk_size,
          chunk_overlap: form.chunk_overlap,
          top_k: form.top_k,
          rerank_top_n: form.rerank_top_n,
          use_global_defaults: form.use_global_defaults,
          embedding_model_id: form.embedding_model_id || null,
          reranker_model_id: form.reranker_model_id || null,
          semantic_model_id: form.semantic_model_id || null,
          retrieval_strategy: form.retrieval_strategy,
          keyword_weight: form.keyword_weight,
          semantic_weight: form.semantic_weight,
          rerank_weight: form.rerank_weight,
        },
        token,
      );
      setKbList((prev) => [created, ...prev]);
      setActiveKbId(created.id);
      setMessage(text.created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedCreate);
    }
  };

  const saveKb = async () => {
    if (!canWrite || !activeKbId) {
      return;
    }
    try {
      const row = await api.updateKb(
        activeKbId,
        {
          name: form.name,
          chunk_size: form.chunk_size,
          chunk_overlap: form.chunk_overlap,
          top_k: form.top_k,
          rerank_top_n: form.rerank_top_n,
          use_global_defaults: form.use_global_defaults,
          embedding_model_id: form.embedding_model_id || null,
          reranker_model_id: form.reranker_model_id || null,
          semantic_model_id: form.semantic_model_id || null,
          retrieval_strategy: form.retrieval_strategy,
          keyword_weight: form.keyword_weight,
          semantic_weight: form.semantic_weight,
          rerank_weight: form.rerank_weight,
        },
        token,
      );
      setKbList((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      setMessage(text.updated);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedUpdate);
    }
  };

  const removeKb = async (kbId: string) => {
    if (!canWrite) {
      return;
    }
    try {
      await api.deleteKb(kbId, token);
      setKbList((prev) => prev.filter((x) => x.id !== kbId));
      if (activeKbId === kbId) {
        setActiveKbId("");
      }
      setDocs([]);
      setMessage(text.deleted);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedDelete);
    }
  };

  const buildFromText = async () => {
    if (!canWrite || !activeKbId) {
      return;
    }
    try {
      await api.buildKb(activeKbId, [{ title: docTitle, content: docContent }], token);
      await loadDocs(activeKbId);
      setMessage(text.built);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedBuild);
    }
  };

  const uploadDoc = async (file: File | null) => {
    if (!canWrite || !activeKbId || !file) {
      return;
    }
    try {
      await api.uploadKbDocument(activeKbId, file, token);
      await loadDocs(activeKbId);
      setMessage(text.uploaded);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedUpload);
    }
  };

  const removeDoc = async (docId: string) => {
    if (!canWrite || !activeKbId) {
      return;
    }
    try {
      await api.deleteKbDocument(activeKbId, docId, token);
      setDocs((prev) => prev.filter((x) => x.id !== docId));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedDeleteDoc);
    }
  };

  const search = async () => {
    if (!activeKbId) {
      return;
    }
    try {
      const res = await api.retrievalQuery(
        {
          kb_id: activeKbId,
          query,
          top_k: form.top_k,
          strategy: form.retrieval_strategy,
          keyword_weight: form.keyword_weight,
          semantic_weight: form.semantic_weight,
          rerank_weight: form.rerank_weight,
        },
        token,
      );
      setQueryResult(res.items);
      setMessage(text.searched);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.failedSearch);
    }
  };

  return (
    <section className="page-grid two-cols">
      <div className="panel">
        <div className="row-between">
          <h3>{text.listTitle}</h3>
          <button type="button" onClick={createKb} disabled={!canWrite}>{text.create}</button>
        </div>

        <label>{text.name}<input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} /></label>
        <div className="mini-grid">
          <label>{text.chunkSize}<input type="number" value={form.chunk_size} onChange={(e) => setForm((s) => ({ ...s, chunk_size: Number(e.target.value) }))} /></label>
          <label>{text.chunkOverlap}<input type="number" value={form.chunk_overlap} onChange={(e) => setForm((s) => ({ ...s, chunk_overlap: Number(e.target.value) }))} /></label>
          <label>{text.topK}<input type="number" value={form.top_k} onChange={(e) => setForm((s) => ({ ...s, top_k: Number(e.target.value) }))} /></label>
          <label>{text.rerankTopN}<input type="number" value={form.rerank_top_n} onChange={(e) => setForm((s) => ({ ...s, rerank_top_n: Number(e.target.value) }))} /></label>
        </div>

        <label className="inline-check">
          <input type="checkbox" checked={form.use_global_defaults} onChange={(e) => setForm((s) => ({ ...s, use_global_defaults: e.target.checked }))} />
          {text.useGlobal}
        </label>
        <label>{text.embedding}
          <select value={form.embedding_model_id} onChange={(e) => setForm((s) => ({ ...s, embedding_model_id: e.target.value }))}>
            <option value="">-</option>
            {embeddingModels.map((m) => <option key={m.id} value={m.id}>{m.model_name}</option>)}
          </select>
        </label>
        <label>{text.reranker}
          <select value={form.reranker_model_id} onChange={(e) => setForm((s) => ({ ...s, reranker_model_id: e.target.value }))}>
            <option value="">-</option>
            {rerankerModels.map((m) => <option key={m.id} value={m.id}>{m.model_name}</option>)}
          </select>
        </label>
        <label>{text.semantic}
          <select value={form.semantic_model_id} onChange={(e) => setForm((s) => ({ ...s, semantic_model_id: e.target.value }))}>
            <option value="">-</option>
            {semanticModels.map((m) => <option key={m.id} value={m.id}>{m.model_name}</option>)}
          </select>
        </label>
        <label>{text.strategy}
          <select value={form.retrieval_strategy} onChange={(e) => setForm((s) => ({ ...s, retrieval_strategy: e.target.value as Strategy }))}>
            <option value="keyword">keyword</option>
            <option value="semantic">semantic</option>
            <option value="hybrid">hybrid</option>
          </select>
        </label>
        <div className="mini-grid">
          <label>{text.keywordWeight}<input type="number" step="0.1" value={form.keyword_weight} onChange={(e) => setForm((s) => ({ ...s, keyword_weight: Number(e.target.value) }))} /></label>
          <label>{text.semanticWeight}<input type="number" step="0.1" value={form.semantic_weight} onChange={(e) => setForm((s) => ({ ...s, semantic_weight: Number(e.target.value) }))} /></label>
          <label>{text.rerankWeight}<input type="number" step="0.1" value={form.rerank_weight} onChange={(e) => setForm((s) => ({ ...s, rerank_weight: Number(e.target.value) }))} /></label>
        </div>
        <button type="button" onClick={saveKb} disabled={!canWrite || !activeKbId}>{text.save}</button>

        <div className="list session-list">
          {kbList.map((item) => (
            <article key={item.id} className="list-item session-row">
              <button type="button" className={item.id === activeKbId ? "session-item active" : "session-item"} onClick={() => setActiveKbId(item.id)}>
                <strong>{item.name}</strong>
                <small>{item.status}</small>
              </button>
              <div className="icon-actions">
                <button type="button" className="icon-btn danger" onClick={() => void removeKb(item.id)}>
                  <Icon d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v7M14 10v7" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>{text.buildTitle}</h3>
        <label>{text.docTitle}<input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></label>
        <label>{text.docContent}<textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} rows={6} /></label>
        <button type="button" onClick={buildFromText} disabled={!activeKbId || !canWrite}>{text.buildFromText}</button>
        <label>{text.uploadDoc}<input type="file" onChange={(e) => void uploadDoc(e.target.files?.[0] ?? null)} /></label>

        <h4>{text.queryTitle}</h4>
        <label>{text.query}<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <button type="button" onClick={search} disabled={!activeKbId}>{text.search}</button>

        <div className="mini-grid">
          <div>
            <h4>{text.docs}</h4>
            <div className="list">
              {docs.map((item) => (
                <article key={item.id} className="list-item session-row">
                  <div>
                    <small>{item.source_type}</small>
                    <small>{item.status}</small>
                  </div>
                  <div className="icon-actions">
                    <button type="button" className="icon-btn danger" onClick={() => void removeDoc(item.id)}>
                      <Icon d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v7M14 10v7" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div>
            <h4>{text.result}</h4>
            <ul>
              {queryResult.map((item, idx) => (
                <li key={`${idx}-${String(item.chunk_id ?? idx)}`}>{String(item.text ?? "").slice(0, 80)}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="inline-message">{message}</p>
      </div>
    </section>
  );
}
