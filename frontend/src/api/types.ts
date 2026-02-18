export type ApiEnvelope<T> = {
  code: number;
  data: T;
  message: string;
  trace_id: string;
};

export type AuthLoginData = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: "owner" | "admin" | "member" | "viewer";
  user_id: string;
};

export type UserSession = {
  token: string;
  role: "owner" | "admin" | "member" | "viewer";
  userId: string;
};

export type Provider = {
  id: string;
  provider_name: string;
  base_url: string;
  enabled: boolean;
  last_refresh_at: string | null;
  updated_at: string;
};

export type ProviderPreset = {
  provider_name: string;
  label: string;
  base_url: string;
};

export type ModelCatalog = {
  id: string;
  provider_id: string;
  model_name: string;
  model_type: "llm" | "embedding" | "reranker";
  capabilities: Record<string, unknown>;
  updated_at: string;
};

export type RuntimeProfile = {
  id: string;
  name: string;
  llm_model_id: string | null;
  embedding_model_id: string | null;
  reranker_model_id: string | null;
  params: Record<string, unknown>;
  is_default: boolean;
  updated_at: string;
};

export type McpServer = {
  id: string;
  name: string;
  endpoint: string;
  auth_type: string;
  enabled: boolean;
  timeout_ms: number;
  updated_at: string;
};

export type ChatSession = {
  id: string;
  title: string;
  archived: boolean;
  runtime_profile_id: string | null;
  default_enabled_mcp_ids: string[];
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  member_scope: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k: number;
  rerank_top_n: number;
  embedding_model_id: string | null;
  reranker_model_id: string | null;
  status: string;
  updated_at: string;
};

export type ExportJob = {
  id: string;
  status: string;
  member_scope: string;
  export_types: string[];
  archive_path: string | null;
  created_at: string;
  updated_at: string;
};
