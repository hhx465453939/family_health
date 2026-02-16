import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "../api/client";
import type { McpServer, ModelCatalog, Provider, RuntimeProfile } from "../api/types";

type TabKey = "providers" | "runtime" | "mcp";

export function SettingsCenter({ token }: { token: string }) {
  const [tab, setTab] = useState<TabKey>("providers");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog[]>([]);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [message, setMessage] = useState("准备就绪");

  const [providerFilter, setProviderFilter] = useState("");
  const [providerForm, setProviderForm] = useState({
    provider_name: "gemini",
    base_url: "https://example.local/gemini",
    api_key: "",
    enabled: true,
  });
  const [manualModels, setManualModels] = useState("gemini-custom");
  const [profileForm, setProfileForm] = useState({
    name: "default-profile",
    llm_model_id: "",
    embedding_model_id: "",
    reranker_model_id: "",
    params: '{"temperature":0.2}',
    is_default: true,
  });

  const [mcpForm, setMcpForm] = useState({
    name: "tool-a",
    endpoint: "mock://tool-a",
    auth_type: "none",
    auth_payload: "",
    enabled: true,
    timeout_ms: 8000,
  });
  const [bindingIds, setBindingIds] = useState<string[]>([]);
  const [mcpTemplate, setMcpTemplate] = useState(`{
  "mcpServers": {
    "mcp-pubmed-llm-server": {
      "command": "npx",
      "args": ["mcp-pubmed-llm-server"]
    }
  }
}`);

  const llmModels = useMemo(() => catalog.filter((item) => item.model_type === "llm"), [catalog]);
  const embeddingModels = useMemo(() => catalog.filter((item) => item.model_type === "embedding"), [catalog]);
  const rerankerModels = useMemo(() => catalog.filter((item) => item.model_type === "reranker"), [catalog]);

  const filteredProviders = useMemo(() => {
    const q = providerFilter.trim().toLowerCase();
    if (!q) {
      return providers;
    }
    return providers.filter(
      (item) =>
        item.provider_name.toLowerCase().includes(q) ||
        item.base_url.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q),
    );
  }, [providerFilter, providers]);

  const loadData = async () => {
    try {
      const [providerRes, catalogRes, profileRes, mcpRes] = await Promise.all([
        api.listProviders(token),
        api.listCatalog(token),
        api.listRuntimeProfiles(token),
        api.listMcpServers(token),
      ]);
      setProviders(providerRes.items);
      setCatalog(catalogRes.items);
      setProfiles(profileRes.items);
      setMcpServers(mcpRes.items);
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "加载设置数据失败";
      setMessage(text);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const createProvider = async () => {
    try {
      await api.createProvider(providerForm, token);
      setMessage("Provider 已保存");
      setProviderForm((prev) => ({ ...prev, api_key: "" }));
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Provider 保存失败");
    }
  };

  const updateProvider = async (provider: Provider) => {
    try {
      await api.updateProvider(
        provider.id,
        {
          base_url: provider.base_url,
          enabled: provider.enabled,
          api_key: providerForm.api_key || undefined,
        },
        token,
      );
      setMessage(`Provider 已更新: ${provider.provider_name}`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Provider 更新失败");
    }
  };

  const deleteProvider = async (providerId: string) => {
    try {
      await api.deleteProvider(providerId, token);
      setMessage("Provider 已删除");
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Provider 删除失败");
    }
  };

  const refreshProvider = async (providerId: string) => {
    try {
      await api.refreshProviderModels(
        providerId,
        {
          manual_models: manualModels
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
        token,
      );
      setMessage("模型目录已刷新");
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "模型刷新失败");
    }
  };

  const createProfile = async () => {
    try {
      const params = JSON.parse(profileForm.params) as Record<string, unknown>;
      await api.createRuntimeProfile(
        {
          name: profileForm.name,
          llm_model_id: profileForm.llm_model_id || null,
          embedding_model_id: profileForm.embedding_model_id || null,
          reranker_model_id: profileForm.reranker_model_id || null,
          params,
          is_default: profileForm.is_default,
        },
        token,
      );
      setMessage("Runtime Profile 已创建");
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Runtime Profile 创建失败");
    }
  };

  const createMcp = async () => {
    try {
      await api.createMcpServer(
        {
          ...mcpForm,
          auth_payload: mcpForm.auth_payload || undefined,
        },
        token,
      );
      setMessage("MCP Server 已创建");
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "MCP 创建失败");
    }
  };

  const deleteMcp = async (serverId: string) => {
    try {
      await api.deleteMcpServer(serverId, token);
      setMessage("MCP Server 已删除");
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "MCP 删除失败");
    }
  };

  const importMcpTemplate = async () => {
    try {
      const parsed = JSON.parse(mcpTemplate) as {
        mcpServers?: Record<string, { command?: string; args?: string[] }>;
      };
      const servers = parsed.mcpServers ?? {};
      const entries = Object.entries(servers);
      if (entries.length === 0) {
        setMessage("模板中没有 mcpServers 配置");
        return;
      }
      for (const [name, cfg] of entries) {
        const args = (cfg.args ?? []).join(" ");
        const endpoint = `command://${cfg.command ?? "npx"} ${args}`.trim();
        await api.createMcpServer(
          {
            name,
            endpoint,
            auth_type: "none",
            enabled: true,
            timeout_ms: 8000,
          },
          token,
        );
      }
      setMessage(`已导入 ${entries.length} 个 MCP 工具`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "MCP 模板解析或导入失败");
    }
  };

  const bindQa = async () => {
    try {
      await api.bindQaMcpServers(bindingIds, token);
      setMessage("QA Agent MCP 绑定已更新");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "绑定失败");
    }
  };

  return (
    <section className="page-grid two-cols">
      <div className="panel">
        <h3>设置中心</h3>
        <div className="actions">
          <button type="button" className={tab === "providers" ? "" : "ghost"} onClick={() => setTab("providers")}>
            供应商
          </button>
          <button type="button" className={tab === "runtime" ? "" : "ghost"} onClick={() => setTab("runtime")}>
            模型选择
          </button>
          <button type="button" className={tab === "mcp" ? "" : "ghost"} onClick={() => setTab("mcp")}>
            MCP 工具
          </button>
        </div>

        {tab === "providers" && (
          <>
            <p className="muted">支持多供应商管理（新增/编辑/删除/刷新）。</p>
            <label>
              搜索供应商
              <input value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} />
            </label>
            <label>
              Provider
              <input
                value={providerForm.provider_name}
                onChange={(e) => setProviderForm((s) => ({ ...s, provider_name: e.target.value }))}
              />
            </label>
            <label>
              Base URL
              <input
                value={providerForm.base_url}
                onChange={(e) => setProviderForm((s) => ({ ...s, base_url: e.target.value }))}
              />
            </label>
            <label>
              API Key（更新时可填）
              <input
                value={providerForm.api_key}
                onChange={(e) => setProviderForm((s) => ({ ...s, api_key: e.target.value }))}
                type="password"
              />
            </label>
            <button type="button" onClick={createProvider}>
              新增 Provider
            </button>

            <label>
              手动补充模型(逗号分隔)
              <input value={manualModels} onChange={(e) => setManualModels(e.target.value)} />
            </label>

            <div className="list">
              {filteredProviders.map((item) => (
                <div key={item.id} className="list-item">
                  <div>
                    <strong>{item.provider_name}</strong>
                    <small>{item.base_url}</small>
                  </div>
                  <div className="actions">
                    <button type="button" onClick={() => void refreshProvider(item.id)}>
                      刷新模型
                    </button>
                    <button type="button" className="ghost" onClick={() => void updateProvider(item)}>
                      更新
                    </button>
                    <button type="button" className="ghost" onClick={() => void deleteProvider(item.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "runtime" && (
          <>
            <p className="muted">从模型目录下拉选择 LLM/Embedding/Reranker。</p>
            <label>
              Profile 名称
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm((s) => ({ ...s, name: e.target.value }))}
              />
            </label>
            <label>
              LLM 模型
              <select
                value={profileForm.llm_model_id}
                onChange={(e) => setProfileForm((s) => ({ ...s, llm_model_id: e.target.value }))}
              >
                <option value="">请选择</option>
                {llmModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.model_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Embedding 模型
              <select
                value={profileForm.embedding_model_id}
                onChange={(e) =>
                  setProfileForm((s) => ({ ...s, embedding_model_id: e.target.value }))
                }
              >
                <option value="">请选择</option>
                {embeddingModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.model_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reranker 模型
              <select
                value={profileForm.reranker_model_id}
                onChange={(e) =>
                  setProfileForm((s) => ({ ...s, reranker_model_id: e.target.value }))
                }
              >
                <option value="">请选择</option>
                {rerankerModels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.model_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Params(JSON)
              <textarea
                value={profileForm.params}
                onChange={(e) => setProfileForm((s) => ({ ...s, params: e.target.value }))}
              />
            </label>
            <button type="button" onClick={createProfile}>
              创建 Runtime Profile
            </button>
            <div className="list">
              {profiles.map((item) => (
                <div key={item.id} className="list-item">
                  <strong>{item.name}</strong>
                  <small>default={String(item.is_default)}</small>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "mcp" && (
          <>
            <p className="muted">支持手工新增和 JSON 模板批量导入，当前共 {mcpServers.length} 个工具。</p>
            <label>
              MCP 名称
              <input
                value={mcpForm.name}
                onChange={(e) => setMcpForm((s) => ({ ...s, name: e.target.value }))}
              />
            </label>
            <label>
              MCP Endpoint
              <input
                value={mcpForm.endpoint}
                onChange={(e) => setMcpForm((s) => ({ ...s, endpoint: e.target.value }))}
              />
            </label>
            <button type="button" onClick={createMcp}>
              创建 MCP Server
            </button>

            <label>
              MCP JSON 模板导入
              <textarea value={mcpTemplate} onChange={(e) => setMcpTemplate(e.target.value)} rows={8} />
            </label>
            <button type="button" onClick={importMcpTemplate}>
              批量导入模板
            </button>

            <label>
              QA 全局 MCP 绑定
              <select
                multiple
                value={bindingIds}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setBindingIds(values);
                }}
              >
                {mcpServers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={bindQa}>
              更新 QA 绑定
            </button>

            <div className="list">
              {mcpServers.map((item) => (
                <div key={item.id} className="list-item">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.endpoint}</small>
                  </div>
                  <button type="button" className="ghost" onClick={() => void deleteMcp(item.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="inline-message">{message}</p>
      </div>

      <div className="panel">
        <h3>配置概览</h3>
        <div className="mini-grid">
          <div>
            <h4>Provider 数量</h4>
            <p>{providers.length}</p>
          </div>
          <div>
            <h4>MCP 数量</h4>
            <p>{mcpServers.length}</p>
          </div>
          <div>
            <h4>模型目录条目</h4>
            <p>{catalog.length}</p>
          </div>
          <div>
            <h4>Runtime Profile</h4>
            <p>{profiles.length}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
