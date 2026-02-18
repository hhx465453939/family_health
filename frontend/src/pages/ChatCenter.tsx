import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError } from "../api/client";
import type { AgentRole, ChatMessage, ChatSession, McpServer } from "../api/types";

type Locale = "zh" | "en";
type StreamEvent = { type: string; delta?: string; assistant_answer?: string; reasoning_content?: string; message?: string };

const TEXT = {
  zh: {
    sessionReady: "会话已就绪",
    sessions: "会话",
    newSession: "新建",
    role: "医学角色",
    noRole: "不使用预置角色",
    customPrompt: "自定义角色提示词（会话级）",
    customPromptPlaceholder: "可选，不在消息流展示。",
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
    tools: "工具与上下文",
    mcpRequest: "本次请求启用 MCP",
    upload: "上传附件",
    pendingAttachment: "待发送附件 ID",
    none: "无",
    messageFlow: "消息流",
    noMessages: "还没有消息",
    streaming: "流式输出",
    reasoning: "思维链",
    collapsed: "已折叠",
    expandReasoning: "展开思维链",
    collapseReasoning: "收起思维链",
    queryPlaceholder: "输入健康问题；仅附件也可发送。",
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
    copyFailed: "复制失败",
    branchFailed: "分支失败",
    deleteFailed: "删除失败",
    exportFailed: "导出失败",
    bulkExportFailed: "批量导出失败",
    bulkDeleteFailed: "批量删除失败",
    saveFailed: "保存配置失败",
    sendFailed: "发送失败",
    uploadDone: "附件已脱敏",
    uploadFailed: "上传失败",
    loadSessionsFailed: "加载会话失败",
    loadMessagesFailed: "加载消息失败",
    shareDone: "分享链接已复制",
    shareFailed: "分享链接复制失败",
    copyLabel: "复制",
    branchLabel: "分支",
    exportMd: "导出 Markdown",
    exportJson: "导出 JSON",
    deleteLabel: "删除",
    share: "分享",
    selectAll: "全选",
  },
  en: {
    sessionReady: "Session ready",
    sessions: "Sessions",
    newSession: "New",
    role: "Medical Role",
    noRole: "No preset role",
    customPrompt: "Custom Role Prompt (session)",
    customPromptPlaceholder: "Optional. Hidden from message flow.",
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
    tools: "Tools & Context",
    mcpRequest: "MCP for this request",
    upload: "Upload attachment",
    pendingAttachment: "Pending attachment IDs",
    none: "none",
    messageFlow: "Message Flow",
    noMessages: "No messages yet",
    streaming: "streaming",
    reasoning: "reasoning",
    collapsed: "collapsed",
    expandReasoning: "Expand reasoning",
    collapseReasoning: "Collapse reasoning",
    queryPlaceholder: "Type health question. Attachments-only is also supported.",
    send: "Send",
    enterQuestion: "Enter a question or upload attachment(s) first",
    created: "Session created",
    copied: "Session copied",
    branched: "Session branched",
    deleted: "Session deleted",
    exported: "Session exported",
    bulkExportDone: "Bulk export completed",
    bulkDeleteDone: "Bulk delete completed",
    saveDone: "Session config saved",
    streamDone: "Agent replied (stream)",
    copyFailed: "Copy failed",
    branchFailed: "Branch failed",
    deleteFailed: "Delete failed",
    exportFailed: "Export failed",
    bulkExportFailed: "Bulk export failed",
    bulkDeleteFailed: "Bulk delete failed",
    saveFailed: "Save config failed",
    sendFailed: "Send failed",
    uploadDone: "Attachment sanitized",
    uploadFailed: "Upload failed",
    loadSessionsFailed: "Failed to load sessions",
    loadMessagesFailed: "Failed to load messages",
    shareDone: "Share link copied",
    shareFailed: "Failed to copy share link",
    copyLabel: "Copy",
    branchLabel: "Branch",
    exportMd: "Export Markdown",
    exportJson: "Export JSON",
    deleteLabel: "Delete",
    share: "Share",
    selectAll: "Select all",
  },
} as const;

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function ChatCenter({ token, locale }: { token: string; locale: Locale }) {
  const text = TEXT[locale];
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [query, setQuery] = useState("");
  const [newSessionRoleId, setNewSessionRoleId] = useState("");
  const [newSessionPrompt, setNewSessionPrompt] = useState("");
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean | null>(null);
  const [reasoningBudget, setReasoningBudget] = useState("");
  const [showReasoning, setShowReasoning] = useState(true);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [reasoningExpanded, setReasoningExpanded] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState<string>(text.sessionReady);
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const answerQueueRef = useRef("");
  const reasoningQueueRef = useRef("");
  const drainTimerRef = useRef<number | null>(null);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const selectedAll = sessions.length > 0 && selectedSessionIds.length === sessions.length;

  const stopDrain = () => {
    if (drainTimerRef.current !== null) {
      window.clearInterval(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  };

  const flushQueues = () => {
    if (answerQueueRef.current) {
      const rest = answerQueueRef.current;
      answerQueueRef.current = "";
      setStreamingAnswer((prev) => prev + rest);
    }
    if (reasoningQueueRef.current) {
      const rest = reasoningQueueRef.current;
      reasoningQueueRef.current = "";
      setStreamingReasoning((prev) => prev + rest);
    }
  };

  const startDrain = () => {
    stopDrain();
    drainTimerRef.current = window.setInterval(() => {
      if (answerQueueRef.current.length > 0) {
        const chunk = answerQueueRef.current.slice(0, 14);
        answerQueueRef.current = answerQueueRef.current.slice(14);
        setStreamingAnswer((prev) => prev + chunk);
      }
      if (reasoningQueueRef.current.length > 0) {
        const chunk = reasoningQueueRef.current.slice(0, 16);
        reasoningQueueRef.current = reasoningQueueRef.current.slice(16);
        setStreamingReasoning((prev) => prev + chunk);
      }
    }, 40);
  };

  const loadSessions = async () => {
    try {
      const [sessionRes, mcpRes, roleRes] = await Promise.all([
        api.listChatSessions(token),
        api.listMcpServers(token),
        api.listAgentRoles(token),
      ]);
      setSessions(sessionRes.items);
      setMcpServers(mcpRes.items);
      setRoles(roleRes.items);
      const fromUrl = new URLSearchParams(window.location.search).get("session");
      if (fromUrl && sessionRes.items.some((x) => x.id === fromUrl)) {
        setActiveSessionId(fromUrl);
      } else if (!activeSessionId && sessionRes.items.length > 0) {
        setActiveSessionId(sessionRes.items[0].id);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadSessionsFailed);
    }
  };

  useEffect(() => {
    void loadSessions();
    return () => {
      stopDrain();
    };
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
      } catch (error) {
        setMessage(error instanceof ApiError ? error.message : text.loadMessagesFailed);
      }
    };
    void loadMessages();
  }, [activeSessionId, token, text.loadMessagesFailed]);

  useEffect(() => {
    if (!activeSession) {
      setSelectedMcpIds([]);
      return;
    }
    setSelectedMcpIds(activeSession.default_enabled_mcp_ids);
  }, [activeSession]);

  const createSession = async () => {
    try {
      const session = await api.createChatSession(
        {
          title: `Chat ${new Date().toLocaleTimeString()}`,
          runtime_profile_id: null,
          role_id: newSessionRoleId || null,
          background_prompt: newSessionPrompt.trim() || null,
          reasoning_enabled: reasoningEnabled,
          reasoning_budget: reasoningBudget.trim() ? Number(reasoningBudget) : null,
          show_reasoning: showReasoning,
          default_enabled_mcp_ids: selectedMcpIds,
        },
        token,
      );
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
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
      setMessage(error instanceof ApiError ? error.message : text.copyFailed);
    }
  };

  const branchSession = async (sessionId: string) => {
    try {
      const row = await api.branchChatSession(sessionId, token);
      setSessions((prev) => [row, ...prev]);
      setMessage(text.branched);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.branchFailed);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await api.deleteChatSession(sessionId, token);
      setSessions((prev) => prev.filter((x) => x.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId("");
      }
      setMessage(text.deleted);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.deleteFailed);
    }
  };

  const exportSession = async (sessionId: string, format: "json" | "md") => {
    try {
      const blob = await api.exportChatSession(sessionId, format, token);
      downloadBlob(blob, `${sessionId}.${format}`);
      setMessage(text.exported);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.exportFailed);
    }
  };

  const shareSession = async (sessionId: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("session", sessionId);
      await navigator.clipboard.writeText(url.toString());
      setMessage(text.shareDone);
    } catch {
      setMessage(text.shareFailed);
    }
  };

  const bulkExport = async () => {
    if (!selectedSessionIds.length) {
      setMessage(text.selectFirst);
      return;
    }
    try {
      const blob = await api.bulkExportChatSessions(selectedSessionIds, token);
      downloadBlob(blob, "chat-sessions-export.zip");
      setMessage(text.bulkExportDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.bulkExportFailed);
    }
  };

  const bulkDelete = async () => {
    if (!selectedSessionIds.length) {
      setMessage(text.selectFirst);
      return;
    }
    try {
      await api.bulkDeleteChatSessions(selectedSessionIds, token);
      setSessions((prev) => prev.filter((x) => !selectedSessionIds.includes(x.id)));
      setSelectedSessionIds([]);
      if (activeSessionId && selectedSessionIds.includes(activeSessionId)) {
        setActiveSessionId("");
      }
      setMessage(text.bulkDeleteDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.bulkDeleteFailed);
    }
  };

  const persistSessionMcp = async () => {
    if (!activeSessionId) {
      return;
    }
    try {
      const updated = await api.updateChatSession(
        activeSessionId,
        {
          default_enabled_mcp_ids: selectedMcpIds,
          reasoning_enabled: reasoningEnabled,
          reasoning_budget: reasoningBudget.trim() ? Number(reasoningBudget) : null,
          show_reasoning: showReasoning,
        },
        token,
      );
      setSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(text.saveDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.saveFailed);
    }
  };

  const sendQa = async () => {
    const normalized = query.trim();
    if (!activeSessionId) {
      return;
    }
    if (!normalized && attachmentIds.length === 0) {
      setMessage(text.enterQuestion);
      return;
    }

    setStreamingAnswer("");
    setStreamingReasoning("");
    answerQueueRef.current = "";
    reasoningQueueRef.current = "";
    setReasoningExpanded(true);
    setIsStreaming(true);
    startDrain();

    try {
      await api.qaStream(
        {
          session_id: activeSessionId,
          query: normalized,
          enabled_mcp_ids: selectedMcpIds,
          attachments_ids: attachmentIds,
        },
        token,
        (evt: StreamEvent) => {
          if (evt.type === "message") {
            answerQueueRef.current += evt.delta ?? "";
          } else if (evt.type === "reasoning") {
            reasoningQueueRef.current += evt.delta ?? "";
          } else if (evt.type === "error") {
            setMessage(evt.message ?? text.sendFailed);
          } else if (evt.type === "done") {
            if (evt.assistant_answer) {
              answerQueueRef.current += evt.assistant_answer;
            }
            if (evt.reasoning_content) {
              reasoningQueueRef.current += evt.reasoning_content;
            }
          }
        },
      );
      flushQueues();
      stopDrain();
      setIsStreaming(false);
      setReasoningExpanded(false);
      setQuery("");
      setAttachmentIds([]);
      const res = await api.listMessages(activeSessionId, token);
      setMessages(res.items);
      setMessage(text.streamDone);
      setStreamingAnswer("");
      setStreamingReasoning("");
    } catch (error) {
      stopDrain();
      setIsStreaming(false);
      setMessage(error instanceof ApiError ? error.message : text.sendFailed);
      setStreamingAnswer("");
      setStreamingReasoning("");
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !activeSessionId) {
      return;
    }
    try {
      const res = await api.uploadAttachment(activeSessionId, file, token);
      setAttachmentIds((prev) => [...prev, res.id]);
      setMessage(`${text.uploadDone}: ${file.name}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.uploadFailed);
    }
  };

  return (
    <section className="chat-grid">
      <div className="panel">
        <div className="row-between">
          <h3>{text.sessions}</h3>
          <button type="button" onClick={createSession}>
            {text.newSession}
          </button>
        </div>

        <label>
          {text.role}
          <select value={newSessionRoleId} onChange={(e) => setNewSessionRoleId(e.target.value)}>
            <option value="">{text.noRole}</option>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.customPrompt}
          <textarea
            value={newSessionPrompt}
            onChange={(e) => setNewSessionPrompt(e.target.value)}
            placeholder={text.customPromptPlaceholder}
          />
        </label>

        <label>
          {text.reasoningSwitch}
          <select
            value={reasoningEnabled === null ? "auto" : reasoningEnabled ? "on" : "off"}
            onChange={(e) =>
              setReasoningEnabled(e.target.value === "auto" ? null : e.target.value === "on")
            }
          >
            <option value="auto">{text.auto}</option>
            <option value="on">{text.on}</option>
            <option value="off">{text.off}</option>
          </select>
        </label>
        <label>
          {text.reasoningBudget}
          <input value={reasoningBudget} onChange={(e) => setReasoningBudget(e.target.value)} placeholder="e.g. 2048" />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={showReasoning} onChange={(e) => setShowReasoning(e.target.checked)} />
          {text.showReasoning}
        </label>

        <div className="row-between">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={selectedAll}
              onChange={(e) => setSelectedSessionIds(e.target.checked ? sessions.map((x) => x.id) : [])}
            />
            {text.selectAll}
          </label>
          <div className="actions">
            <button type="button" onClick={bulkExport}>{text.bulkExport}</button>
            <button type="button" className="ghost" onClick={bulkDelete}>{text.bulkDelete}</button>
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
                      e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className={item.id === activeSessionId ? "session-item active" : "session-item"}
                onClick={() => setActiveSessionId(item.id)}
              >
                <strong>{item.title}</strong>
                <small>{new Date(item.updated_at).toLocaleString()}</small>
              </button>
              <div className="icon-actions">
                <button type="button" className="icon-btn" title={text.copyLabel} onClick={() => void copySession(item.id)}>
                  <Icon d="M9 9h10v10H9zM5 5h10v10" />
                </button>
                <button type="button" className="icon-btn" title={text.branchLabel} onClick={() => void branchSession(item.id)}>
                  <Icon d="M7 3v7a4 4 0 0 0 4 4h6M13 21l4-4-4-4" />
                </button>
                <button type="button" className="icon-btn" title={text.exportMd} onClick={() => void exportSession(item.id, "md")}>
                  <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                </button>
                <button type="button" className="icon-btn" title={text.exportJson} onClick={() => void exportSession(item.id, "json")}>
                  <Icon d="M8 5L4 12l4 7M16 5l4 7-4 7" />
                </button>
                <button type="button" className="icon-btn" title={text.share} onClick={() => void shareSession(item.id)}>
                  <Icon d="M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM6 14a3 3 0 1 0 3 3 3 3 0 0 0-3-3zm12 2a3 3 0 1 0 3 3 3 3 0 0 0-3-3zM8.7 14.9l6.6-3.8M8.7 19.1l6.6 3.8" />
                </button>
                <button type="button" className="icon-btn danger" title={text.deleteLabel} onClick={() => void deleteSession(item.id)}>
                  <Icon d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v7M14 10v7" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel message-flow">
        <h3>{text.messageFlow}</h3>
        <div className="messages">
          {messages.length === 0 && <p className="muted">{text.noMessages}</p>}
          {messages.map((item) => (
            <article key={item.id} className={item.role === "assistant" ? "bubble assistant" : "bubble user"}>
              <header>{item.role}</header>
              <p>{item.content}</p>
            </article>
          ))}
          {streamingReasoning && showReasoning && (
            <details
              className="bubble assistant reasoning-box"
              open={isStreaming ? true : reasoningExpanded}
              onToggle={(e) => setReasoningExpanded((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                {text.reasoning} {isStreaming ? `(${text.streaming})` : `(${text.collapsed})`}
              </summary>
              <p>{streamingReasoning}</p>
            </details>
          )}
          {streamingAnswer && (
            <article className="bubble assistant">
              <header>{text.streaming}</header>
              <p>{streamingAnswer}</p>
            </article>
          )}
        </div>
        <div className="composer">
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.queryPlaceholder} />
          <button type="button" onClick={sendQa} disabled={!activeSessionId || isStreaming}>
            {text.send}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>{text.tools}</h3>
        <label>
          {text.mcpRequest}
          <select
            multiple
            value={selectedMcpIds}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions).map((x) => x.value);
              setSelectedMcpIds(values);
            }}
          >
            {mcpServers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={persistSessionMcp} disabled={!activeSessionId}>
          {text.saveConfig}
        </button>

        <label>
          {text.upload}
          <input type="file" onChange={(e) => void upload(e.target.files?.[0] ?? null)} />
        </label>
        <p className="muted">{text.pendingAttachment}: {attachmentIds.join(",") || text.none}</p>

        <div className="inline-message">{message}</div>
      </div>
    </section>
  );
}
