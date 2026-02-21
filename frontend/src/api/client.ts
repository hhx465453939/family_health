import type {
  ApiEnvelope,
  AuthLoginData,
  AgentRole,
  ChatMessage,
  ChatSession,
  ExportJob,
  KnowledgeBase,
  McpServer,
  ModelCatalog,
  ProviderPreset,
  Provider,
  RuntimeProfile,
  UserSession,
} from "./types";

const API_PREFIX = "/api/v1";
export const AUTH_EXPIRED_EVENT = "fh:auth-expired";
type UiLocale = "zh" | "en";
let uiLocale: UiLocale = "zh";

let authExpiredNotified = false;
let refreshInFlight: Promise<UserSession | null> | null = null;

type SessionAccessor = {
  get: () => UserSession | null;
  set: (next: UserSession | null) => void;
};

let sessionAccessor: SessionAccessor | null = null;

export function setApiLocale(locale: UiLocale): void {
  uiLocale = locale;
}

export function setSessionAccessor(accessor: SessionAccessor | null): void {
  sessionAccessor = accessor;
}

export async function refreshAuth(): Promise<boolean> {
  const refreshed = await refreshSession();
  if (!refreshed) {
    notifyAuthExpired();
    return false;
  }
  return true;
}

function notifyAuthExpired(): void {
  if (authExpiredNotified) {
    return;
  }
  authExpiredNotified = true;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly traceId: string,
  ) {
    super(message);
  }
}

async function refreshSession(): Promise<UserSession | null> {
  if (!sessionAccessor) {
    return null;
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const current = sessionAccessor.get();
  if (!current?.refreshToken) {
    return null;
  }
  refreshInFlight = (async () => {
    const response = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current.refreshToken }),
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    if (!isJson) {
      return null;
    }
    const body = (await response.json()) as ApiEnvelope<{
      access_token: string;
      refresh_token: string;
      token_type: string;
    }>;
    if (!response.ok || body.code !== 0) {
      return null;
    }
    const updated: UserSession = {
      ...current,
      token: body.data.access_token,
      refreshToken: body.data.refresh_token ?? current.refreshToken,
    };
    sessionAccessor?.set(updated);
    authExpiredNotified = false;
    return updated;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!isJson) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return undefined as T;
  }

  const body = (await response.json()) as ApiEnvelope<T>;
  const maybeEnvelope = body as Partial<ApiEnvelope<T>> & { detail?: string };
  if (!response.ok || maybeEnvelope.code !== 0) {
    let message =
      maybeEnvelope.message ?? maybeEnvelope.detail ?? `HTTP ${response.status}`;
    const shouldRefresh =
      allowRefresh &&
      response.status === 401 &&
      /missing bearer token|invalid token|invalid token type|user not found|not authenticated|invalid authentication credentials|unauthorized/i.test(message);
    if (shouldRefresh) {
      const refreshed = await refreshSession();
      if (refreshed?.token) {
        return request<T>(path, options, refreshed.token, false);
      }
    }
    if (response.status === 401) {
      message =
        uiLocale === "zh"
          ? "登录状态已失效，请重新登录后重试"
          : "Authentication expired. Please sign in again.";
      notifyAuthExpired();
    }
    throw new ApiError(message, maybeEnvelope.code ?? response.status, maybeEnvelope.trace_id ?? "unknown");
  }
  return maybeEnvelope.data as T;
}

export const api = {
  health: async (): Promise<{ status: string }> => {
    const response = await fetch("/health");
    return (await response.json()) as { status: string };
  },
  bootstrapOwner: (payload: {
    username: string;
    password: string;
    display_name: string;
  }): Promise<{ id: string; username: string; role: string }> =>
    request("/auth/bootstrap-owner", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: {
    username: string;
    password: string;
  }): Promise<AuthLoginData> =>
    request<AuthLoginData>("/auth/login", { method: "POST", body: JSON.stringify(payload) }).then((data) => {
      authExpiredNotified = false;
      return data;
    }),
  register: (payload: {
    username: string;
    password: string;
    display_name: string;
  }): Promise<{ id: string; username: string; role: string }> =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  createProvider: (
    payload: { provider_name: string; base_url: string; api_key: string; enabled: boolean },
    token: string,
  ): Promise<Provider> => request("/model-providers", { method: "POST", body: JSON.stringify(payload) }, token),
  listProviderPresets: (token: string): Promise<{ items: ProviderPreset[] }> =>
    request("/model-provider-presets", {}, token),
  listProviders: (token: string): Promise<{ items: Provider[] }> => request("/model-providers", {}, token),
  updateProvider: (
    providerId: string,
    payload: { base_url?: string; api_key?: string; enabled?: boolean },
    token: string,
  ): Promise<Provider> =>
    request(`/model-providers/${providerId}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  deleteProvider: (providerId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/model-providers/${providerId}`, { method: "DELETE" }, token),
  refreshProviderModels: (
    providerId: string,
    payload: { manual_models: string[] },
    token: string,
  ): Promise<{ items: ModelCatalog[] }> =>
    request(`/model-providers/${providerId}/refresh-models`, { method: "POST", body: JSON.stringify(payload) }, token),
  listCatalog: (token: string): Promise<{ items: ModelCatalog[] }> => request("/model-catalog", {}, token),
  createRuntimeProfile: (
    payload: {
      name: string;
      llm_model_id: string | null;
      embedding_model_id: string | null;
      reranker_model_id: string | null;
      params: Record<string, unknown>;
      is_default: boolean;
    },
    token: string,
  ): Promise<RuntimeProfile> => request("/runtime-profiles", { method: "POST", body: JSON.stringify(payload) }, token),
  updateRuntimeProfile: (
    profileId: string,
    payload: Partial<{
      name: string;
      llm_model_id: string | null;
      embedding_model_id: string | null;
      reranker_model_id: string | null;
      params: Record<string, unknown>;
      is_default: boolean;
    }>,
    token: string,
  ): Promise<RuntimeProfile> =>
    request(`/runtime-profiles/${profileId}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  listRuntimeProfiles: (token: string): Promise<{ items: RuntimeProfile[] }> => request("/runtime-profiles", {}, token),
  deleteRuntimeProfile: (profileId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/runtime-profiles/${profileId}`, { method: "DELETE" }, token),
  createMcpServer: (
    payload: {
      name: string;
      endpoint: string;
      auth_type: string;
      auth_payload?: string;
      enabled: boolean;
      timeout_ms: number;
    },
    token: string,
  ): Promise<McpServer> => request("/mcp/servers", { method: "POST", body: JSON.stringify(payload) }, token),
  listMcpServers: (token: string): Promise<{ items: McpServer[] }> => request("/mcp/servers", {}, token),
  deleteMcpServer: (serverId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/mcp/servers/${serverId}`, { method: "DELETE" }, token),
  bindQaMcpServers: (mcp_server_ids: string[], token: string): Promise<{ items: unknown[] }> =>
    request("/mcp/bindings/qa", { method: "PUT", body: JSON.stringify({ mcp_server_ids }) }, token),
  createChatSession: (
    payload: {
      title: string;
      runtime_profile_id: string | null;
      role_id?: string | null;
      background_prompt?: string | null;
      reasoning_enabled?: boolean | null;
      reasoning_budget?: number | null;
      show_reasoning?: boolean;
      context_message_limit?: number;
      default_enabled_mcp_ids: string[];
    },
    token: string,
  ): Promise<ChatSession> => request("/chat/sessions", { method: "POST", body: JSON.stringify(payload) }, token),
  listChatSessions: (token: string): Promise<{ total: number; items: ChatSession[] }> => request("/chat/sessions", {}, token),
  deleteChatSession: (sessionId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/chat/sessions/${sessionId}`, { method: "DELETE" }, token),
  updateChatSession: (
    sessionId: string,
    payload: Partial<{
      title: string;
      runtime_profile_id: string | null;
      role_id: string | null;
      background_prompt: string | null;
      reasoning_enabled: boolean | null;
      reasoning_budget: number | null;
      show_reasoning: boolean;
      context_message_limit: number;
      archived: boolean;
      default_enabled_mcp_ids: string[];
    }>,
    token: string,
  ): Promise<ChatSession> => request(`/chat/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  copyChatSession: (sessionId: string, token: string): Promise<ChatSession> =>
    request(`/chat/sessions/${sessionId}/copy`, { method: "POST" }, token),
  branchChatSession: (sessionId: string, token: string): Promise<ChatSession> =>
    request(`/chat/sessions/${sessionId}/branch`, { method: "POST" }, token),
  exportChatSession: async (sessionId: string, format: "md", includeReasoning: boolean, token: string): Promise<Blob> => {
    const response = await fetch(
      `${API_PREFIX}/chat/sessions/${sessionId}/export?fmt=${format}&include_reasoning=${includeReasoning ? "true" : "false"}`,
      {
      headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    return response.blob();
  },
  bulkExportChatSessions: async (session_ids: string[], token: string): Promise<Blob> => {
    const response = await fetch(`${API_PREFIX}/chat/sessions/bulk-export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session_ids }),
    });
    if (!response.ok) {
      throw new Error(`Bulk export failed: ${response.status}`);
    }
    return response.blob();
  },
  bulkDeleteChatSessions: (session_ids: string[], token: string): Promise<{ deleted: number }> =>
    request("/chat/sessions/bulk-delete", { method: "POST", body: JSON.stringify({ session_ids }) }, token),
  listAgentRoles: (token: string): Promise<{ items: AgentRole[] }> => request("/agent/roles", {}, token),
  getAgentRole: (roleId: string, token: string): Promise<{ id: string; prompt: string }> =>
    request(`/agent/roles/${roleId}`, {}, token),
  listMessages: (sessionId: string, token: string): Promise<{ items: ChatMessage[] }> =>
    request(`/chat/sessions/${sessionId}/messages`, {}, token),
  deleteChatMessage: (sessionId: string, messageId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/chat/sessions/${sessionId}/messages/${messageId}`, { method: "DELETE" }, token),
  bulkDeleteChatMessages: (sessionId: string, message_ids: string[], token: string): Promise<{ deleted: number }> =>
    request(`/chat/sessions/${sessionId}/messages/bulk-delete`, { method: "POST", body: JSON.stringify({ message_ids }) }, token),
  uploadAttachment: async (
    sessionId: string,
    file: File,
    token: string,
    options?: { kb_mode?: "context" | "chat_default" | "kb"; kb_id?: string },
  ): Promise<{ id: string; kb_id?: string | null }> => {
    const form = new FormData();
    form.append("file", file);
    if (options?.kb_mode) {
      form.append("kb_mode", options.kb_mode);
    }
    if (options?.kb_id) {
      form.append("kb_id", options.kb_id);
    }
    const runUpload = async (currentToken: string, allowRefresh = true) => {
      const response = await fetch(`${API_PREFIX}/chat/sessions/${sessionId}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
        body: form,
      });
      if (response.status === 401 && allowRefresh) {
        const refreshed = await refreshSession();
        if (refreshed?.token) {
          return runUpload(refreshed.token, false);
        }
      }
      return response;
    };
    const response = await runUpload(token);
    const body = (await response.json()) as ApiEnvelope<{ id: string; kb_id?: string | null }>;
    if (!response.ok || body.code !== 0) {
      if (response.status === 401) {
        notifyAuthExpired();
      }
      throw new ApiError(body.message, body.code ?? response.status, body.trace_id ?? "unknown");
    }
    return body.data;
  },
  previewFile: async (file: File, token: string): Promise<{ file_name: string; text: string }> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_PREFIX}/file-preview/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await response.json()) as ApiEnvelope<{ file_name: string; text: string }>;
    if (!response.ok || body.code !== 0) {
      throw new ApiError(body.message, body.code ?? response.status, body.trace_id ?? "unknown");
    }
    return body.data;
  },
  previewKbDocument: (docId: string, token: string, source: "raw" | "sanitized" = "raw"): Promise<{ file_name: string; text: string }> =>
    request(`/file-preview/kb-documents/${docId}?source=${source}`, {}, token),
  previewChatMessage: (messageId: string, token: string): Promise<{ file_name: string; text: string }> =>
    request(`/file-preview/chat-messages/${messageId}`, {}, token),
  listDesensitizationRules: (token: string, enabledOnly = false): Promise<{ items: Array<{ id: string; member_scope: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null; enabled: boolean }> }> =>
    request(`/desensitization/rules?enabled_only=${enabledOnly ? "true" : "false"}`, {}, token),
  createDesensitizationRule: (
    payload: { member_scope: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null; enabled: boolean },
    token: string,
  ): Promise<{ id: string; member_scope: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null; enabled: boolean }> =>
    request("/desensitization/rules", { method: "POST", body: JSON.stringify(payload) }, token),
  updateDesensitizationRule: (
    ruleId: string,
    payload: Partial<{ member_scope: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null; enabled: boolean }>,
    token: string,
  ): Promise<{ id: string; member_scope: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null; enabled: boolean }> =>
    request(`/desensitization/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  deleteDesensitizationRule: (ruleId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/desensitization/rules/${ruleId}`, { method: "DELETE" }, token),
  listDesensitizationPresets: (token: string): Promise<{ items: Array<{ key: string; label: string; rule_type: string; pattern: string; replacement_token: string; tag?: string | null }> }> =>
    request("/desensitization/presets", {}, token),
  listExportCandidates: (
    payload: { member_scope: string; export_types: string[]; include_raw_file: boolean; include_sanitized_text: boolean; filters: Record<string, unknown> },
    token: string,
  ): Promise<{ chat_messages: Array<{ id: string; role: string; created_at: string; preview: string }>; kb_documents: Array<{ id: string; kb_id: string; kb_name: string; status: string; source_path: string | null; masked_path: string | null; updated_at: string }> }> =>
    request("/exports/candidates", { method: "POST", body: JSON.stringify(payload) }, token),
  qa: (
    payload: {
      session_id: string;
      query?: string;
      kb_ids?: string[] | null;
      background_prompt?: string;
      enabled_mcp_ids?: string[];
      runtime_profile_id?: string | null;
      attachments_ids?: string[];
    },
    token: string,
  ): Promise<{
    session_id: string;
    assistant_answer: string;
    context: { enabled_mcp_ids: string[]; history_messages: number; attachment_chunks: number };
    tool_warnings: string[];
  }> => request("/agent/qa", { method: "POST", body: JSON.stringify(payload) }, token),
  qaStream: async (
    payload: {
      session_id: string;
      query?: string;
      kb_ids?: string[] | null;
      background_prompt?: string;
      enabled_mcp_ids?: string[];
      runtime_profile_id?: string | null;
      attachments_ids?: string[];
    },
    token: string,
    onEvent: (event: { type: string; delta?: string; assistant_answer?: string; reasoning_content?: string; message?: string }) => void,
  ): Promise<void> => {
    const runStream = async (currentToken: string, allowRefresh = true): Promise<Response> => {
      const response = await fetch(`${API_PREFIX}/agent/qa/stream`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401 && allowRefresh) {
        const refreshed = await refreshSession();
        if (refreshed?.token) {
          return runStream(refreshed.token, false);
        }
      }
      return response;
    };
    const response = await runStream(token);
    if (response.status === 401) {
      notifyAuthExpired();
      throw new ApiError(
        uiLocale === "zh" ? "登录状态已失效，请重新登录后重试" : "Authentication expired. Please sign in again.",
        401,
        "auth-expired",
      );
    }
    if (!response.ok || !response.body) {
      throw new Error(`Stream failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk
          .split("\n")
          .find((x) => x.startsWith("data:"));
        if (!line) {
          continue;
        }
        const raw = line.slice(5).trim();
        if (!raw) {
          continue;
        }
        onEvent(JSON.parse(raw) as { type: string; delta?: string; assistant_answer?: string; reasoning_content?: string; message?: string });
      }
    }
  },
  createKb: (
    payload: {
      name: string;
      chunk_size: number;
      chunk_overlap: number;
      top_k: number;
      rerank_top_n: number;
      member_scope: string;
      embedding_model_id?: string | null;
      reranker_model_id?: string | null;
      semantic_model_id?: string | null;
      use_global_defaults?: boolean;
      retrieval_strategy?: "keyword" | "semantic" | "hybrid";
      keyword_weight?: number;
      semantic_weight?: number;
      rerank_weight?: number;
      strategy_params?: Record<string, unknown> | null;
    },
    token: string,
  ): Promise<KnowledgeBase> => request("/knowledge-bases", { method: "POST", body: JSON.stringify(payload) }, token),
  listKb: (token: string): Promise<{ items: KnowledgeBase[] }> => request("/knowledge-bases", {}, token),
  getKbDefaults: (
    token: string,
  ): Promise<{
    embedding_model_id: string | null;
    reranker_model_id: string | null;
    semantic_model_id: string | null;
    retrieval_strategy: "keyword" | "semantic" | "hybrid";
    keyword_weight: number;
    semantic_weight: number;
    rerank_weight: number;
  }> => request("/knowledge-bases/defaults", {}, token),
  updateKb: (
    kbId: string,
    payload: Partial<{
      name: string;
      chunk_size: number;
      chunk_overlap: number;
      top_k: number;
      rerank_top_n: number;
      embedding_model_id: string | null;
      reranker_model_id: string | null;
      semantic_model_id: string | null;
      use_global_defaults: boolean;
      retrieval_strategy: "keyword" | "semantic" | "hybrid";
      keyword_weight: number;
      semantic_weight: number;
      rerank_weight: number;
      strategy_params: Record<string, unknown> | null;
    }>,
    token: string,
  ): Promise<KnowledgeBase> =>
    request(`/knowledge-bases/${kbId}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  deleteKb: (kbId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/knowledge-bases/${kbId}`, { method: "DELETE" }, token),
  buildKb: (
    kbId: string,
    documents: Array<{ title: string; content: string }>,
    token: string,
  ): Promise<{ documents: number; chunks: number; status: string }> =>
    request(`/knowledge-bases/${kbId}/build`, { method: "POST", body: JSON.stringify({ documents }) }, token),
  uploadKbDocument: async (kbId: string, file: File, token: string): Promise<{ document_id: string; chunks: number; status: string }> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_PREFIX}/knowledge-bases/${kbId}/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await response.json()) as ApiEnvelope<{ document_id: string; chunks: number; status: string }>;
    if (!response.ok || body.code !== 0) {
      throw new ApiError(body.message, body.code ?? response.status, body.trace_id ?? "unknown");
    }
    return body.data;
  },
  deleteKbDocument: (kbId: string, docId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/knowledge-bases/${kbId}/documents/${docId}`, { method: "DELETE" }, token),
  listKbDocuments: (kbId: string, token: string): Promise<{ items: Array<Record<string, unknown>>; stats: Record<string, number> }> =>
    request(`/knowledge-bases/${kbId}/documents`, {}, token),
  retrievalQuery: (
    payload: {
      kb_id: string;
      query: string;
      top_k: number;
      strategy?: "keyword" | "semantic" | "hybrid";
      keyword_weight?: number;
      semantic_weight?: number;
      rerank_weight?: number;
    },
    token: string,
  ): Promise<{ items: Array<Record<string, unknown>> }> =>
    request("/retrieval/query", { method: "POST", body: JSON.stringify(payload) }, token),
  createExportJob: (
    payload: {
      member_scope: string;
      export_types: string[];
      include_raw_file: boolean;
      include_sanitized_text: boolean;
      filters: Record<string, unknown>;
    },
    token: string,
  ): Promise<{ id: string; status: string; archive_path: string | null }> =>
    request("/exports/jobs", { method: "POST", body: JSON.stringify(payload) }, token),
  listExportJobs: (token: string): Promise<{ items: ExportJob[] }> => request("/exports/jobs", {}, token),
  getExportJob: (jobId: string, token: string): Promise<Record<string, unknown>> =>
    request(`/exports/jobs/${jobId}`, {}, token),
  deleteExportJob: (jobId: string, token: string): Promise<{ deleted: boolean }> =>
    request(`/exports/jobs/${jobId}`, { method: "DELETE" }, token),
  downloadExportJob: async (jobId: string, token: string): Promise<Blob> => {
    const response = await fetch(`${API_PREFIX}/exports/jobs/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    return response.blob();
  },
};
