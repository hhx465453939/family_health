import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError } from "../api/client";
import type { AgentRole, ChatMessage, ChatSession, KnowledgeBase, McpServer, ModelCatalog, RuntimeProfile } from "../api/types";
import { DesensitizationModal } from "../components/DesensitizationModal";

type Locale = "zh" | "en";
type StreamEvent = { type: string; delta?: string; assistant_answer?: string; reasoning_content?: string; message?: string; assistant_message_id?: string };
type StreamDone = { id?: string; answer?: string; reasoning?: string };

const TEXT = {
  zh: {
    sessionReady: "会话已就绪",
    sessions: "会话",
    newSession: "新建",
    role: "医学角色",
    noRole: "不使用预置角色",
    customPrompt: "自定义角色提示词（会话级）",
    customPromptPlaceholder: "可选，不在消息流展示。",
    contextLimit: "上下文记忆轮数",
    reasoningSwitch: "思维链开关",
    auto: "自动",
    on: "开启",
    off: "关闭",
    reasoningBudget: "思维链预算",
    showReasoning: "显示思维链流",
    bulkExport: "批量导出",
    bulkDelete: "批量删除",
    selectFirst: "请先选择会话",
    saveConfig: "保存会话配置",
    messageFlow: "消息流",
    noMessages: "还没有消息",
    streaming: "流式输出",
    reasoning: "思维链",
    collapsed: "已折叠",
    queryPlaceholder: "输入问题，支持粘贴文件上传。",
    send: "发送",
    enterQuestion: "请输入问题或先上传附件",
    created: "会话已创建",
    copied: "会话已复制",
    branched: "会话已分支",
    deleted: "会话已删除",
    exported: "会话已导出",
    bulkExportDone: "批量导出完成",
    bulkDeleteDone: "批量删除完成",
    saveDone: "会话配置已保存",
    streamDone: "已完成流式回复",
    uploadDone: "附件已上传",
    uploadFailed: "上传失败",
    imageBlocked: "当前模型不是多模态，禁止上传图片",
    loadSessionsFailed: "加载会话失败",
    loadMessagesFailed: "加载消息失败",
    copyLabel: "复制",
    branchLabel: "分支",
    exportMd: "导出 Markdown",
    exportPdf: "导出 PDF",
    exportSession: "导出会话",
    includeReasoning: "保留思维链",
    kb: "知识库",
    noKb: "不使用知识库",
    deleteLabel: "删除",
    share: "分享",
    selectAll: "全选",
    attach: "附件",
    mcp: "MCP",
    pendingAttachment: "待发送附件",
    none: "无",
    copyMsg: "复制消息",
    exportMsgMd: "导出消息 MD",
    exportMsgPdf: "导出消息 PDF",
    shareSelected: "分享已选消息",
    deleteSelectedMsg: "删除已选消息",
    selectMsgFirst: "请先选择消息",
    shared: "分享链接已复制",
  },
  en: {
    sessionReady: "Session ready",
    sessions: "Sessions",
    newSession: "New",
    role: "Medical Role",
    noRole: "No preset role",
    customPrompt: "Custom Role Prompt (session)",
    customPromptPlaceholder: "Optional. Hidden from message flow.",
    contextLimit: "Context memory turns",
    reasoningSwitch: "Reasoning switch",
    auto: "Auto",
    on: "On",
    off: "Off",
    reasoningBudget: "Reasoning budget",
    showReasoning: "Show reasoning stream",
    bulkExport: "Bulk Export",
    bulkDelete: "Bulk Delete",
    selectFirst: "Select sessions first",
    saveConfig: "Save Session Config",
    messageFlow: "Message Flow",
    noMessages: "No messages yet",
    streaming: "streaming",
    reasoning: "reasoning",
    collapsed: "collapsed",
    queryPlaceholder: "Type question. Paste file to upload.",
    send: "Send",
    enterQuestion: "Enter a question or upload attachments first",
    created: "Session created",
    copied: "Session copied",
    branched: "Session branched",
    deleted: "Session deleted",
    exported: "Session exported",
    bulkExportDone: "Bulk export completed",
    bulkDeleteDone: "Bulk delete completed",
    saveDone: "Session config saved",
    streamDone: "Agent replied (stream)",
    uploadDone: "Attachment uploaded",
    uploadFailed: "Upload failed",
    imageBlocked: "Current model is not multimodal; image upload disabled",
    loadSessionsFailed: "Failed to load sessions",
    loadMessagesFailed: "Failed to load messages",
    copyLabel: "Copy",
    branchLabel: "Branch",
    exportMd: "Export Markdown",
    exportPdf: "Export PDF",
    exportSession: "Export Session",
    includeReasoning: "Include reasoning",
    kb: "Knowledge Base",
    noKb: "No knowledge base",
    deleteLabel: "Delete",
    share: "Share",
    selectAll: "Select all",
    attach: "Attach",
    mcp: "MCP",
    pendingAttachment: "Pending attachments",
    none: "none",
    copyMsg: "Copy message",
    exportMsgMd: "Export message MD",
    exportMsgPdf: "Export message PDF",
    shareSelected: "Share selected messages",
    deleteSelectedMsg: "Delete selected messages",
    selectMsgFirst: "Select messages first",
    shared: "Share link copied",
  },
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  const lines = escaped.split("\n");
  const mapped = lines.map((line) => {
    if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
    return `<p>${line || "<br/>"}</p>`;
  });
  return mapped.join("");
}

export function ChatCenter({ token, locale }: { token: string; locale: Locale }) {
  const text = TEXT[locale];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog[]>([]);
  const [query, setQuery] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionRoleId, setSessionRoleId] = useState("");
  const [sessionPrompt, setSessionPrompt] = useState("");
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean | null>(null);
  const [reasoningBudget, setReasoningBudget] = useState("");
  const [showReasoning, setShowReasoning] = useState(true);
  const [contextLimit, setContextLimit] = useState("20");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createRoleId, setCreateRoleId] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createReasoningEnabled, setCreateReasoningEnabled] = useState<boolean | null>(null);
  const [createReasoningBudget, setCreateReasoningBudget] = useState("");
  const [createShowReasoning, setCreateShowReasoning] = useState(true);
  const [createContextLimit, setCreateContextLimit] = useState("20");
  const [createSelectedMcpIds, setCreateSelectedMcpIds] = useState<string[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [reasoningExpanded, setReasoningExpanded] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showMcpPicker, setShowMcpPicker] = useState(false);
  const [message, setMessage] = useState<string>(text.sessionReady);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [reasoningByMessageId, setReasoningByMessageId] = useState<Record<string, string>>({});
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [exportMenuSessionId, setExportMenuSessionId] = useState<string | null>(null);
  const [exportIncludeReasoning, setExportIncludeReasoning] = useState<boolean>(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [kbMode, setKbMode] = useState<"context" | "chat_default" | "kb">("context");
  const [kbTargetId, setKbTargetId] = useState<string>("");

  const answerQueueRef = useRef("");
  const reasoningQueueRef = useRef("");
  const lastStreamDoneRef = useRef<StreamDone | null>(null);
  const drainTimerRef = useRef<number | null>(null);

  const activeSession = useMemo(() => sessions.find((item) => item.id === activeSessionId) ?? null, [activeSessionId, sessions]);
  const activeProfile = useMemo(() => {
    const profileId = activeSession?.runtime_profile_id;
    if (profileId) {
      return profiles.find((x) => x.id === profileId) ?? null;
    }
    return profiles.find((x) => x.is_default) ?? null;
  }, [activeSession?.runtime_profile_id, profiles]);
  const activeModel = useMemo(() => {
    const llmModelId = activeProfile?.llm_model_id;
    if (!llmModelId) {
      return null;
    }
    return catalog.find((x) => x.id === llmModelId) ?? null;
  }, [activeProfile?.llm_model_id, catalog]);
  const supportsImage = useMemo(() => {
    if (!activeModel) {
      return false;
    }
    const caps = activeModel.capabilities as Record<string, unknown>;
    if (caps.multimodal === true) {
      return true;
    }
    const inputTypes = caps.input_types;
    return Array.isArray(inputTypes) && inputTypes.includes("image");
  }, [activeModel]);
  const selectedAllSessions = sessions.length > 0 && selectedSessionIds.length === sessions.length;

  const stopDrain = () => {
    if (drainTimerRef.current !== null) {
      window.clearInterval(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  };

  const startDrain = () => {
    stopDrain();
    drainTimerRef.current = window.setInterval(() => {
      if (answerQueueRef.current.length > 0) {
        const chunk = answerQueueRef.current.slice(0, 16);
        answerQueueRef.current = answerQueueRef.current.slice(16);
        setStreamingAnswer((prev) => prev + chunk);
      }
      if (reasoningQueueRef.current.length > 0) {
        const chunk = reasoningQueueRef.current.slice(0, 18);
        reasoningQueueRef.current = reasoningQueueRef.current.slice(18);
        setStreamingReasoning((prev) => prev + chunk);
      }
    }, 40);
  };

  const loadSessions = async () => {
    try {
      const [sessionRes, mcpRes, roleRes, profileRes, catalogRes, kbRes] = await Promise.all([
        api.listChatSessions(token),
        api.listMcpServers(token),
        api.listAgentRoles(token),
        api.listRuntimeProfiles(token),
        api.listCatalog(token),
        api.listKb(token),
      ]);
      setSessions(sessionRes.items);
      setMcpServers(mcpRes.items);
      setRoles(roleRes.items);
      setProfiles(profileRes.items);
      setCatalog(catalogRes.items);
      setKbList(kbRes.items);
      if (!selectedKbId) {
        const chatDefault = kbRes.items.find((item) => item.name === "Chat Default KB");
        if (chatDefault) {
          setSelectedKbId(chatDefault.id);
        }
      }
      if (!activeSessionId && sessionRes.items.length > 0) {
        setActiveSessionId(sessionRes.items[0].id);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  useEffect(() => {
    void loadSessions();
    return () => stopDrain();
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      if (!activeSessionId) {
        setMessages([]);
        return;
      }
      try {
        const res = await api.listMessages(activeSessionId, token);
        setMessages(res.items);
        setReasoningByMessageId(
          res.items.reduce<Record<string, string>>((acc, item) => {
            if (item.reasoning_content) {
              acc[item.id] = item.reasoning_content;
            }
            return acc;
          }, {}),
        );
      } catch (error) {
        setMessage(error instanceof ApiError ? error.message : text.loadMessagesFailed);
      }
    };
    void loadMessages();
  }, [activeSessionId, token, text.loadMessagesFailed]);

  useEffect(() => {
    if (!activeSession) {
      setSelectedMcpIds([]);
      setSessionTitle("");
      setSessionRoleId("");
      setSessionPrompt("");
      return;
    }
    setSessionTitle(activeSession.title || "");
    setSessionRoleId(activeSession.role_id || "");
    setSessionPrompt(activeSession.background_prompt || "");
    setSelectedMcpIds(activeSession.default_enabled_mcp_ids);
    setReasoningEnabled(activeSession.reasoning_enabled);
    setReasoningBudget(activeSession.reasoning_budget ? String(activeSession.reasoning_budget) : "");
    setShowReasoning(activeSession.show_reasoning);
    setContextLimit(String(activeSession.context_message_limit || 20));
  }, [activeSession]);

  const openCreateSessionDialog = () => {
    setCreateTitle(`Chat ${new Date().toLocaleTimeString()}`);
    setCreateRoleId(sessionRoleId);
    setCreatePrompt(sessionPrompt);
    setCreateReasoningEnabled(reasoningEnabled);
    setCreateReasoningBudget(reasoningBudget);
    setCreateShowReasoning(showReasoning);
    setCreateContextLimit(contextLimit);
    setCreateSelectedMcpIds(selectedMcpIds);
    setCreateDialogOpen(true);
  };

  const confirmCreateSession = async () => {
    try {
      const session = await api.createChatSession(
        {
          title: createTitle.trim() || `Chat ${new Date().toLocaleTimeString()}`,
          runtime_profile_id: null,
          role_id: createRoleId || null,
          background_prompt: createPrompt.trim() || null,
          reasoning_enabled: createReasoningEnabled,
          reasoning_budget: createReasoningBudget.trim() ? Number(createReasoningBudget) : null,
          show_reasoning: createShowReasoning,
          context_message_limit: Number(createContextLimit) || 20,
          default_enabled_mcp_ids: createSelectedMcpIds,
        },
        token,
      );
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setCreateDialogOpen(false);
      setMessage(text.created);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const copySession = async (sessionId: string) => {
    try {
      const row = await api.copyChatSession(sessionId, token);
      setSessions((prev) => [row, ...prev]);
      setMessage(text.copied);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const branchSession = async (sessionId: string) => {
    try {
      const row = await api.branchChatSession(sessionId, token);
      setSessions((prev) => [row, ...prev]);
      setMessage(text.branched);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await api.deleteChatSession(sessionId, token);
      setSessions((prev) => prev.filter((x) => x.id !== sessionId));
      setSelectedSessionIds((prev) => prev.filter((x) => x !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId("");
      }
      setMessage(text.deleted);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const exportSession = async (sessionId: string, format: "md" | "pdf", includeReasoning: boolean) => {
    try {
      const blob = await api.exportChatSession(sessionId, "md", includeReasoning, token);
      if (format === "md") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sessionId}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const markdown = await blob.text();
        const popup = window.open("", "_blank");
        if (!popup) {
          setMessage("Popup blocked");
          return;
        }
        popup.document.write(`<html><body>${renderMarkdown(markdown)}</body></html>`);
        popup.document.close();
        popup.focus();
        popup.print();
      }
      setExportMenuSessionId(null);
      setMessage(text.exported);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const shareSession = async (sessionId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    await navigator.clipboard.writeText(url.toString());
    setMessage(text.shared);
  };

  const bulkExportSessions = async () => {
    if (!selectedSessionIds.length) {
      setMessage(text.selectFirst);
      return;
    }
    try {
      const blob = await api.bulkExportChatSessions(selectedSessionIds, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chat-sessions-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      setMessage(text.bulkExportDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const bulkDeleteSessions = async () => {
    if (!selectedSessionIds.length) {
      setMessage(text.selectFirst);
      return;
    }
    try {
      await api.bulkDeleteChatSessions(selectedSessionIds, token);
      setSessions((prev) => prev.filter((x) => !selectedSessionIds.includes(x.id)));
      if (activeSessionId && selectedSessionIds.includes(activeSessionId)) {
        setActiveSessionId("");
      }
      setSelectedSessionIds([]);
      setMessage(text.bulkDeleteDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const persistSessionConfig = async () => {
    if (!activeSessionId) return;
    try {
      const updated = await api.updateChatSession(
        activeSessionId,
        {
          title: sessionTitle.trim() || undefined,
          role_id: sessionRoleId || null,
          background_prompt: sessionPrompt.trim() || null,
          default_enabled_mcp_ids: selectedMcpIds,
          reasoning_enabled: reasoningEnabled,
          reasoning_budget: reasoningBudget.trim() ? Number(reasoningBudget) : null,
          show_reasoning: showReasoning,
          context_message_limit: Number(contextLimit) || 20,
        },
        token,
      );
      setSessions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setMessage(text.saveDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  const openUploadModal = (files: File[]) => {
    if (!activeSessionId || files.length === 0) return;
    const first = files[0];
    if (first.type.startsWith("image/") && !supportsImage) {
      setMessage(text.imageBlocked);
      return;
    }
    if (!kbTargetId && selectedKbId) {
      setKbTargetId(selectedKbId);
    }
    setPendingFiles(files);
    setPendingIndex(0);
    setUploadModalOpen(true);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter((it) => it.kind === "file");
    if (fileItems.length === 0) return;
    e.preventDefault();
    const files = fileItems.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (files.length > 0) {
      openUploadModal(files);
    }
  };

  const sendQa = async () => {
    const normalized = query.trim();
    if (!activeSessionId) return;
    if (!normalized && attachmentIds.length === 0) {
      setMessage(text.enterQuestion);
      return;
    }
    setStreamingAnswer("");
    setStreamingReasoning("");
    answerQueueRef.current = "";
    reasoningQueueRef.current = "";
    lastStreamDoneRef.current = null;
    setReasoningExpanded(true);
    setIsStreaming(true);
    startDrain();

    try {
      await api.qaStream(
        {
          session_id: activeSessionId,
          query: normalized,
          kb_id: selectedKbId || null,
          enabled_mcp_ids: selectedMcpIds,
          attachments_ids: attachmentIds,
        },
        token,
        (evt: StreamEvent) => {
          if (evt.type === "message") answerQueueRef.current += evt.delta ?? "";
          if (evt.type === "reasoning") reasoningQueueRef.current += evt.delta ?? "";
          if (evt.type === "error") setMessage(evt.message ?? "stream failed");
          if (evt.type === "done") {
            lastStreamDoneRef.current = {
              id: evt.assistant_message_id as string | undefined,
              answer: evt.assistant_answer,
              reasoning: evt.reasoning_content,
            };
            if (evt.assistant_message_id && evt.reasoning_content) {
              setReasoningByMessageId((prev) => ({ ...prev, [evt.assistant_message_id as string]: evt.reasoning_content as string }));
            }
            if (evt.assistant_answer && !answerQueueRef.current) {
              answerQueueRef.current = evt.assistant_answer;
            }
          }
        },
      );
      if (answerQueueRef.current) {
        setStreamingAnswer((prev) => prev + answerQueueRef.current);
        answerQueueRef.current = "";
      }
      if (reasoningQueueRef.current) {
        setStreamingReasoning((prev) => prev + reasoningQueueRef.current);
        reasoningQueueRef.current = "";
      }
      stopDrain();
      setIsStreaming(false);
      setReasoningExpanded(false);
      setQuery("");
      setAttachmentIds([]);
      setAttachmentNames([]);
      const res = await api.listMessages(activeSessionId, token);
      const done = lastStreamDoneRef.current as StreamDone | null;
      let items = res.items;
      if (done?.id && !items.some((msg) => msg.id === done.id)) {
        items = [
          ...items,
          {
            id: done.id,
            role: "assistant",
            content: done.answer ?? "",
            reasoning_content: done.reasoning ?? "",
            created_at: new Date().toISOString(),
          },
        ];
      }
      setMessages(items);
      setMessage(text.streamDone);
      if (done?.id && items.some((msg) => msg.id === done.id)) {
        setStreamingAnswer("");
        setStreamingReasoning("");
      }
    } catch (error) {
      stopDrain();
      setIsStreaming(false);
      setMessage(error instanceof ApiError ? error.message : "send failed");
      setStreamingAnswer("");
      setStreamingReasoning("");
    }
  };

  const copyMessage = async (msg: ChatMessage) => {
    await navigator.clipboard.writeText(msg.content);
    setMessage(text.copyMsg);
  };

  const exportMessageMd = (msg: ChatMessage, includeReasoning: boolean) => {
    const reasoning = includeReasoning ? reasoningByMessageId[msg.id] ?? "" : "";
    const body = `# ${msg.role}\n\n${msg.content}\n${reasoning ? `\n## reasoning\n\n${reasoning}\n` : ""}`;
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${msg.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMessagePdf = (msg: ChatMessage) => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(`<html><body>${renderMarkdown(msg.content)}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const shareSelectedMessages = async () => {
    if (!activeSessionId || selectedMessageIds.length === 0) {
      setMessage(text.selectMsgFirst);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("session", activeSessionId);
    url.searchParams.set("msgs", selectedMessageIds.join(","));
    await navigator.clipboard.writeText(url.toString());
    setMessage(`${text.shared} (${selectedMessageIds.length})`);
  };

  const deleteSelectedMessages = async () => {
    if (!activeSessionId || selectedMessageIds.length === 0) {
      setMessage(text.selectMsgFirst);
      return;
    }
    try {
      await api.bulkDeleteChatMessages(activeSessionId, selectedMessageIds, token);
      setMessages((prev) => prev.filter((msg) => !selectedMessageIds.includes(msg.id)));
      setSelectedMessageIds([]);
      setMessage(text.bulkDeleteDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadMessagesFailed);
    }
  };

  return (
    <section className="chat-grid chat-grid-two">
      <div className="panel">
        <div className="row-between">
          <h3>{text.sessions}</h3>
          <button type="button" onClick={openCreateSessionDialog}>{text.newSession}</button>
        </div>
        {!activeSession && <div className="inline-message">{locale === "zh" ? "请先选择一个会话" : "Select a session first"}</div>}
        <label>{locale === "zh" ? "会话标题" : "Session title"}
          <input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} disabled={!activeSessionId} />
        </label>
        <label>{text.role}
          <select value={sessionRoleId} onChange={(e) => setSessionRoleId(e.target.value)} disabled={!activeSessionId}>
            <option value="">{text.noRole}</option>
            {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>{text.customPrompt}
          <textarea value={sessionPrompt} onChange={(e) => setSessionPrompt(e.target.value)} placeholder={text.customPromptPlaceholder} disabled={!activeSessionId} />
        </label>
        <label>{text.contextLimit}<input value={contextLimit} onChange={(e) => setContextLimit(e.target.value)} disabled={!activeSessionId} /></label>
        <label>{text.reasoningSwitch}
          <select value={reasoningEnabled === null ? "auto" : reasoningEnabled ? "on" : "off"} onChange={(e) => setReasoningEnabled(e.target.value === "auto" ? null : e.target.value === "on")} disabled={!activeSessionId}>
            <option value="auto">{text.auto}</option>
            <option value="on">{text.on}</option>
            <option value="off">{text.off}</option>
          </select>
        </label>
        <label>{text.reasoningBudget}<input value={reasoningBudget} onChange={(e) => setReasoningBudget(e.target.value)} disabled={!activeSessionId} /></label>
        <label className="inline-check"><input type="checkbox" checked={showReasoning} onChange={(e) => setShowReasoning(e.target.checked)} disabled={!activeSessionId} />{text.showReasoning}</label>
        <button type="button" onClick={persistSessionConfig} disabled={!activeSessionId}>{text.saveConfig}</button>

        <div className="row-between">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={selectedAllSessions}
              onChange={(e) => setSelectedSessionIds(e.target.checked ? sessions.map((x) => x.id) : [])}
            />
            {text.selectAll}
          </label>
          <div className="actions">
            <button type="button" onClick={bulkExportSessions}>{text.bulkExport}</button>
            <button type="button" className="ghost" onClick={bulkDeleteSessions}>{text.bulkDelete}</button>
          </div>
        </div>

        <div className="list session-list">
          {sessions.map((item) => (
            <article key={item.id} className="list-item session-row">
              <label className="session-check">
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(item.id)}
                  onChange={(e) =>
                    setSelectedSessionIds((prev) =>
                      e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id),
                    )
                  }
                />
              </label>
              <button type="button" className={item.id === activeSessionId ? "session-item active" : "session-item"} onClick={() => setActiveSessionId(item.id)}>
                <strong>{item.title}</strong><small>{new Date(item.updated_at).toLocaleString()}</small>
              </button>
              <div className="icon-actions">
                <button type="button" className="icon-btn" title={text.copyLabel} onClick={() => void copySession(item.id)}><Icon d="M9 9h10v10H9zM5 5h10v10" /></button>
                <button type="button" className="icon-btn" title={text.branchLabel} onClick={() => void branchSession(item.id)}><Icon d="M7 3v7a4 4 0 0 0 4 4h6M13 21l4-4-4-4" /></button>
                <div className="icon-menu">
                  <button type="button" className="icon-btn" title={text.exportSession} onClick={() => setExportMenuSessionId((prev) => prev === item.id ? null : item.id)}><Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" /></button>
                  {exportMenuSessionId === item.id && (
                    <div className="menu-popover">
                      <label className="inline-check">
                        <input type="checkbox" checked={exportIncludeReasoning} onChange={(e) => setExportIncludeReasoning(e.target.checked)} />
                        {text.includeReasoning}
                      </label>
                      <div className="actions">
                        <button type="button" className="ghost" onClick={() => void exportSession(item.id, "md", exportIncludeReasoning)}>{text.exportMd}</button>
                        <button type="button" className="ghost" onClick={() => void exportSession(item.id, "pdf", exportIncludeReasoning)}>{text.exportPdf}</button>
                      </div>
                    </div>
                  )}
                </div>
                <button type="button" className="icon-btn" title={text.share} onClick={() => void shareSession(item.id)}><Icon d="M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM6 14a3 3 0 1 0 3 3 3 3 0 0 0-3-3zm12 2a3 3 0 1 0 3 3 3 3 0 0 0-3-3zM8.7 14.9l6.6-3.8M8.7 19.1l6.6 3.8" /></button>
                <button type="button" className="icon-btn danger" title={text.deleteLabel} onClick={() => void deleteSession(item.id)}><Icon d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v7M14 10v7" /></button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel message-flow">
        <div className="row-between">
          <h3>{text.messageFlow}</h3>
          <div className="actions">
            <button type="button" className="ghost" onClick={shareSelectedMessages}>{text.shareSelected}</button>
            <button type="button" className="ghost" onClick={deleteSelectedMessages}>{text.deleteSelectedMsg}</button>
          </div>
        </div>
        <div className="messages">
          {messages.length === 0 && <p className="muted">{text.noMessages}</p>}
          {messages.map((item) => (
            <article key={item.id} className={item.role === "assistant" ? "bubble assistant" : "bubble user"}>
              <header className="row-between">
                <span>{item.role}</span>
                <span className="icon-actions">
                  <input type="checkbox" checked={selectedMessageIds.includes(item.id)} onChange={(e) => setSelectedMessageIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id))} />
                  <button type="button" className="icon-btn" title={text.copyMsg} onClick={() => void copyMessage(item)}><Icon d="M9 9h10v10H9zM5 5h10v10" /></button>
                  <button type="button" className="icon-btn" title={text.exportMsgMd} onClick={() => exportMessageMd(item, true)}><Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" /></button>
                  <button type="button" className="icon-btn" title={text.exportMsgPdf} onClick={() => exportMessagePdf(item)}><Icon d="M6 2h9l5 5v15H6zM15 2v5h5" /></button>
                </span>
              </header>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />
            </article>
          ))}
          {streamingReasoning && showReasoning && (
            <details className="bubble assistant reasoning-box" open={isStreaming ? true : reasoningExpanded} onToggle={(e) => setReasoningExpanded((e.target as HTMLDetailsElement).open)}>
              <summary>{text.reasoning} {isStreaming ? `(${text.streaming})` : `(${text.collapsed})`}</summary>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingReasoning) }} />
            </details>
          )}
          {streamingAnswer && (
            <article className="bubble assistant">
              <header>{text.streaming}</header>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingAnswer) }} />
            </article>
          )}
        </div>

        <div className="composer">
          <div className="icon-actions">
            <button type="button" className="icon-btn" title={text.attach} onClick={() => fileInputRef.current?.click()}>
              <Icon d="M21.44 11.05l-8.49 8.49a6 6 0 0 1-8.49-8.49l8.49-8.49a4 4 0 1 1 5.66 5.66l-8.49 8.49a2 2 0 1 1-2.83-2.83l7.78-7.78" />
            </button>
            <button type="button" className={showMcpPicker ? "icon-btn" : "icon-btn"} title={text.mcp} onClick={() => setShowMcpPicker((s) => !s)}>
              <Icon d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
            </button>
            <small className="muted">{text.pendingAttachment}: {attachmentNames.join(", ") || text.none}</small>
          </div>
          {showMcpPicker && (
            <select multiple value={selectedMcpIds} onChange={(e) => setSelectedMcpIds(Array.from(e.target.selectedOptions).map((x) => x.value))}>
              {mcpServers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          <label>{text.kb}
            <select value={selectedKbId} onChange={(e) => setSelectedKbId(e.target.value)}>
              <option value="">{text.noKb}</option>
              {kbList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <textarea value={query} onPaste={(e) => void onPaste(e)} onChange={(e) => setQuery(e.target.value)} placeholder={text.queryPlaceholder} />
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => openUploadModal(Array.from(e.target.files ?? []))} />
          <button type="button" onClick={sendQa} disabled={!activeSessionId || isStreaming}>{text.send}</button>
          <div className="inline-message">{message}</div>
        </div>
      </div>
      {createDialogOpen && (
        <div className="modal-mask" onClick={() => setCreateDialogOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{locale === "zh" ? "新建会话参数" : "New Session Config"}</h3>
            <label>{locale === "zh" ? "会话标题" : "Session title"}
              <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
            </label>
            <label>{text.role}
              <select value={createRoleId} onChange={(e) => setCreateRoleId(e.target.value)}>
                <option value="">{text.noRole}</option>
                {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>{text.customPrompt}
              <textarea value={createPrompt} onChange={(e) => setCreatePrompt(e.target.value)} placeholder={text.customPromptPlaceholder} />
            </label>
            <label>{text.contextLimit}<input value={createContextLimit} onChange={(e) => setCreateContextLimit(e.target.value)} /></label>
            <label>{text.reasoningSwitch}
              <select value={createReasoningEnabled === null ? "auto" : createReasoningEnabled ? "on" : "off"} onChange={(e) => setCreateReasoningEnabled(e.target.value === "auto" ? null : e.target.value === "on")}>
                <option value="auto">{text.auto}</option>
                <option value="on">{text.on}</option>
                <option value="off">{text.off}</option>
              </select>
            </label>
            <label>{text.reasoningBudget}<input value={createReasoningBudget} onChange={(e) => setCreateReasoningBudget(e.target.value)} /></label>
            <label className="inline-check"><input type="checkbox" checked={createShowReasoning} onChange={(e) => setCreateShowReasoning(e.target.checked)} />{text.showReasoning}</label>
            <label>{text.mcp}
              <select multiple value={createSelectedMcpIds} onChange={(e) => setCreateSelectedMcpIds(Array.from(e.target.selectedOptions).map((x) => x.value))}>
                {mcpServers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setCreateDialogOpen(false)}>{locale === "zh" ? "取消" : "Cancel"}</button>
              <button type="button" onClick={confirmCreateSession}>{locale === "zh" ? "确认创建" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
      <DesensitizationModal
        open={uploadModalOpen}
        token={token}
        locale={locale}
        title={locale === "zh" ? "上传脱敏预览" : "Upload Preview & Mask"}
        file={pendingFiles[pendingIndex] ?? null}
        docIndex={pendingIndex}
        docTotal={pendingFiles.length}
        onPrevDoc={pendingIndex > 0 ? () => setPendingIndex((prev) => Math.max(0, prev - 1)) : undefined}
        onNextDoc={pendingIndex < pendingFiles.length - 1 ? () => setPendingIndex((prev) => Math.min(pendingFiles.length - 1, prev + 1)) : undefined}
        confirmLabel={locale === "zh" ? "确认上传" : "Upload"}
        onCancel={() => {
          setUploadModalOpen(false);
          setPendingFiles([]);
          setPendingIndex(0);
        }}
        onConfirm={async () => {
          const pendingFile = pendingFiles[pendingIndex];
          if (!pendingFile || !activeSessionId) return;
          if (kbMode === "kb" && !kbTargetId) {
            setMessage(locale === "zh" ? "请选择知识库" : "Select a knowledge base");
            return;
          }
          try {
            const res = await api.uploadAttachment(activeSessionId, pendingFile, token, {
              kb_mode: kbMode,
              kb_id: kbMode === "kb" ? kbTargetId : undefined,
            });
            setAttachmentIds((prev) => [...prev, res.id]);
            setAttachmentNames((prev) => [...prev, pendingFile.name]);
            setMessage(`${text.uploadDone}: ${pendingFile.name}`);
            if (res.kb_id) {
              const kbRes = await api.listKb(token);
              setKbList(kbRes.items);
              setSelectedKbId(res.kb_id);
            }
          } catch (error) {
            setMessage(error instanceof ApiError ? error.message : text.uploadFailed);
          } finally {
            const nextFiles = pendingFiles.filter((_, idx) => idx !== pendingIndex);
            if (nextFiles.length === 0) {
              setUploadModalOpen(false);
              setPendingFiles([]);
              setPendingIndex(0);
              return;
            }
            const nextIndex = Math.min(pendingIndex, nextFiles.length - 1);
            setPendingFiles(nextFiles);
            setPendingIndex(nextIndex);
          }
        }}
        extraControls={(
          <div className="panel" style={{ border: "1px dashed rgba(255,255,255,0.15)", background: "transparent" }}>
            <strong>{locale === "zh" ? "入库选择" : "Storage Target"}</strong>
            {pendingFiles.length > 1 && (
              <small className="muted">
                {locale === "zh"
                  ? `剩余待处理 ${pendingFiles.length - pendingIndex - 1} 个文件`
                  : `${pendingFiles.length - pendingIndex - 1} files remaining`}
              </small>
            )}
            <label className="inline-check">
              <input type="radio" name="kbMode" checked={kbMode === "context"} onChange={() => setKbMode("context")} />
              {locale === "zh" ? "仅用于本次聊天上下文" : "Context only"}
            </label>
            <label className="inline-check">
              <input type="radio" name="kbMode" checked={kbMode === "chat_default"} onChange={() => setKbMode("chat_default")} />
              {locale === "zh" ? "进入默认 Chat Default KB" : "Store in Chat Default KB"}
            </label>
            <label className="inline-check">
              <input type="radio" name="kbMode" checked={kbMode === "kb"} onChange={() => setKbMode("kb")} />
              {locale === "zh" ? "进入指定知识库" : "Store in selected KB"}
            </label>
            {kbMode === "kb" && (
              <select value={kbTargetId} onChange={(e) => setKbTargetId(e.target.value)}>
                <option value="">{locale === "zh" ? "请选择知识库" : "Select KB"}</option>
                {kbList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <small className="muted">
              {locale === "zh"
                ? "建议将体检/历史报告等长期资料放入独立知识库。"
                : "Tip: Put long-term health records into a dedicated KB."}
            </small>
          </div>
        )}
      />
    </section>
  );
}
