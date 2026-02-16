import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "../api/client";
import type { ChatMessage, ChatSession, McpServer } from "../api/types";

export function ChatCenter({ token }: { token: string }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [query, setQuery] = useState("");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [message, setMessage] = useState("会话已就绪");
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const loadSessions = async () => {
    try {
      const [sessionRes, mcpRes] = await Promise.all([
        api.listChatSessions(token),
        api.listMcpServers(token),
      ]);
      setSessions(sessionRes.items);
      setMcpServers(mcpRes.items);
      if (!activeSessionId && sessionRes.items.length > 0) {
        setActiveSessionId(sessionRes.items[0].id);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "会话加载失败");
    }
  };

  useEffect(() => {
    void loadSessions();
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
        setMessage(error instanceof ApiError ? error.message : "消息读取失败");
      }
    };
    void loadMessages();
  }, [activeSessionId, token]);

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
          title: `对话 ${new Date().toLocaleTimeString()}`,
          runtime_profile_id: null,
          default_enabled_mcp_ids: selectedMcpIds,
        },
        token,
      );
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessage("新会话已创建");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "创建会话失败");
    }
  };

  const persistSessionMcp = async () => {
    if (!activeSessionId) {
      return;
    }
    try {
      const updated = await api.updateChatSession(
        activeSessionId,
        { default_enabled_mcp_ids: selectedMcpIds },
        token,
      );
      setSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("会话默认 MCP 已保存");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "保存会话 MCP 失败");
    }
  };

  const sendQa = async () => {
    const normalized = query.trim();
    if (!activeSessionId) {
      return;
    }
    if (!normalized && attachmentIds.length === 0) {
      setMessage("请输入问题，或上传附件后以附件模式发送");
      return;
    }
    try {
      await api.qa(
        {
          session_id: activeSessionId,
          query: normalized,
          background_prompt: backgroundPrompt.trim() || undefined,
          enabled_mcp_ids: selectedMcpIds,
          attachments_ids: attachmentIds,
        },
        token,
      );
      setQuery("");
      setAttachmentIds([]);
      const res = await api.listMessages(activeSessionId, token);
      setMessages(res.items);
      setMessage("Agent 已返回结果");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "发送失败");
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !activeSessionId) {
      return;
    }
    try {
      const res = await api.uploadAttachment(activeSessionId, file, token);
      setAttachmentIds((prev) => [...prev, res.id]);
      setMessage(`附件已脱敏入库: ${file.name}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "附件上传失败");
    }
  };

  return (
    <section className="chat-grid">
      <div className="panel">
        <div className="row-between">
          <h3>会话列表</h3>
          <button type="button" onClick={createSession}>
            新建
          </button>
        </div>
        <div className="list">
          {sessions.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeSessionId ? "session-item active" : "session-item"}
              onClick={() => setActiveSessionId(item.id)}
            >
              <strong>{item.title}</strong>
              <small>{new Date(item.updated_at).toLocaleString()}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="panel message-flow">
        <h3>消息流</h3>
        <div className="messages">
          {messages.length === 0 && <p className="muted">暂无消息，发送第一条问题开始。</p>}
          {messages.map((item) => (
            <article key={item.id} className={item.role === "assistant" ? "bubble assistant" : "bubble user"}>
              <header>{item.role}</header>
              <p>{item.content}</p>
            </article>
          ))}
        </div>
        <div className="composer">
          <label>
            背景提示词（角色上下文）
            <textarea
              value={backgroundPrompt}
              onChange={(e) => setBackgroundPrompt(e.target.value)}
              placeholder="例如：你是一名家庭医生，回答要先给风险等级再给建议。"
            />
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入健康问题；若留空但已上传附件，将按附件模式发送。"
          />
          <button type="button" onClick={sendQa} disabled={!activeSessionId}>
            发送到 Agent
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>工具与上下文</h3>
        <label>
          本轮启用 MCP
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
          保存为会话默认 MCP
        </button>

        <label>
          上传聊天附件
          <input type="file" onChange={(e) => void upload(e.target.files?.[0] ?? null)} />
        </label>
        <p className="muted">已暂存附件ID: {attachmentIds.join(",") || "无"}</p>

        <div className="inline-message">{message}</div>
      </div>
    </section>
  );
}
