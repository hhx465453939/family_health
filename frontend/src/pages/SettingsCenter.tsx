import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "../api/client";
import type { McpServer, ModelCatalog, Provider, ProviderPreset, RuntimeProfile } from "../api/types";

type TabKey = "providers" | "runtime" | "mcp";
type Locale = "zh" | "en";

const TEXT = {
  zh: {
    ready: "准备就绪",
    loadFailed: "加载设置数据失败",
    tabProviders: "供应商",
    tabRuntime: "模型选择",
    tabMcp: "MCP 工具",
    title: "设置中心",
    providerHelp: "支持预置端点一键填充和自定义完整端点（可持续新增）。",
    providerSearch: "搜索供应商",
    providerPreset: "预置供应商",
    providerName: "Provider",
    baseUrl: "Base URL",
    apiKey: "API Key（更新时可填）",
    addProvider: "新增 Provider",
    manualModels: "手动补充模型（逗号分隔）",
    refreshModels: "刷新模型",
    update: "更新",
    delete: "删除",
    providerRequired: "请填写 Provider、Base URL、API Key",
    providerSaved: "Provider 已保存",
    providerSaveFailed: "Provider 保存失败",
    providerUpdated: "Provider 已更新",
    providerUpdateFailed: "Provider 更新失败",
    providerDeleted: "Provider 已删除",
    providerDeleteFailed: "Provider 删除失败",
    catalogRefreshed: "模型目录已刷新",
    catalogRefreshFailed: "模型刷新失败",
    runtimeHelp: "从模型目录下拉选择 LLM/Embedding/Reranker。",
    profileName: "Profile 名称",
    llmModel: "LLM 模型",
    embeddingModel: "Embedding 模型",
    rerankerModel: "Reranker 模型",
    pleaseSelect: "请选择",
    paramsJson: "参数 JSON",
    createProfile: "创建 Runtime Profile",
    updateProfile: "更新 Runtime Profile",
    resetForm: "重置",
    viewLabel: "查看",
    editLabel: "编辑",
    deleteLabel: "删除",
    profileLoaded: "Runtime Profile 已加载",
    profileUpdated: "Runtime Profile 已更新",
    profileUpdateFailed: "Runtime Profile 更新失败",
    profileDeleted: "Runtime Profile 已删除",
    profileDeleteFailed: "Runtime Profile 删除失败",
    profileCreated: "Runtime Profile 已创建",
    profileCreateFailed: "Runtime Profile 创建失败",
    mcpHelpPrefix: "支持按 npx/命令参数自动生成配置，当前共",
    mcpHelpSuffix: "个工具。",
    mcpName: "MCP 名称",
    mcpCommand: "启动命令",
    mcpArgs: "启动参数（空格分隔）",
    createMcp: "创建 MCP Server",
    mcpTemplate: "MCP JSON 模板导入",
    importTemplate: "批量导入模板",
    qaBinding: "QA 全局 MCP 绑定",
    updateBinding: "更新 QA 绑定",
    mcpNeedNameCmd: "请填写 MCP 名称和启动命令",
    mcpCreated: "MCP Server 已创建",
    mcpCreateFailed: "MCP 创建失败",
    mcpDeleted: "MCP Server 已删除",
    mcpDeleteFailed: "MCP 删除失败",
    templateEmpty: "模板中没有 mcpServers 配置",
    templateImported: "已导入 MCP 工具数",
    templateImportFailed: "MCP 模板解析或导入失败",
    bindDone: "QA Agent MCP 绑定已更新",
    bindFailed: "绑定失败",
    overview: "配置概览",
    providerCount: "Provider 数量",
    mcpCount: "MCP 数量",
    catalogCount: "模型目录条目",
    profileCount: "Runtime Profile 数量",
    custom: "custom",
  },
  en: {
    ready: "Ready",
    loadFailed: "Failed to load settings",
    tabProviders: "Providers",
    tabRuntime: "Runtime",
    tabMcp: "MCP",
    title: "Settings",
    providerHelp: "Use provider presets or add custom full endpoints.",
    providerSearch: "Search providers",
    providerPreset: "Provider preset",
    providerName: "Provider",
    baseUrl: "Base URL",
    apiKey: "API Key (optional on update)",
    addProvider: "Add Provider",
    manualModels: "Manual models (comma-separated)",
    refreshModels: "Refresh Models",
    update: "Update",
    delete: "Delete",
    providerRequired: "Provider, Base URL and API Key are required",
    providerSaved: "Provider saved",
    providerSaveFailed: "Failed to save provider",
    providerUpdated: "Provider updated",
    providerUpdateFailed: "Failed to update provider",
    providerDeleted: "Provider deleted",
    providerDeleteFailed: "Failed to delete provider",
    catalogRefreshed: "Model catalog refreshed",
    catalogRefreshFailed: "Failed to refresh model catalog",
    runtimeHelp: "Select LLM/Embedding/Reranker from model catalog.",
    profileName: "Profile name",
    llmModel: "LLM model",
    embeddingModel: "Embedding model",
    rerankerModel: "Reranker model",
    pleaseSelect: "Select",
    paramsJson: "Params JSON",
    createProfile: "Create Runtime Profile",
    updateProfile: "Update Runtime Profile",
    resetForm: "Reset",
    viewLabel: "View",
    editLabel: "Edit",
    deleteLabel: "Delete",
    profileLoaded: "Runtime Profile loaded",
    profileUpdated: "Runtime Profile updated",
    profileUpdateFailed: "Failed to update Runtime Profile",
    profileDeleted: "Runtime Profile deleted",
    profileDeleteFailed: "Failed to delete Runtime Profile",
    profileCreated: "Runtime Profile created",
    profileCreateFailed: "Failed to create Runtime Profile",
    mcpHelpPrefix: "Auto-generate MCP config from command args. Total tools:",
    mcpHelpSuffix: "",
    mcpName: "MCP name",
    mcpCommand: "Launch command",
    mcpArgs: "Launch args (space-separated)",
    createMcp: "Create MCP Server",
    mcpTemplate: "Import MCP JSON template",
    importTemplate: "Import Template",
    qaBinding: "QA global MCP binding",
    updateBinding: "Update QA Binding",
    mcpNeedNameCmd: "MCP name and command are required",
    mcpCreated: "MCP Server created",
    mcpCreateFailed: "Failed to create MCP Server",
    mcpDeleted: "MCP Server deleted",
    mcpDeleteFailed: "Failed to delete MCP Server",
    templateEmpty: "No mcpServers found in template",
    templateImported: "Imported MCP tools",
    templateImportFailed: "Failed to parse/import MCP template",
    bindDone: "QA MCP binding updated",
    bindFailed: "Failed to update binding",
    overview: "Overview",
    providerCount: "Providers",
    mcpCount: "MCP Servers",
    catalogCount: "Catalog Items",
    profileCount: "Runtime Profiles",
    custom: "custom",
  },
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function SettingsCenter({ token, locale }: { token: string; locale: Locale }) {
  const text = TEXT[locale];
  const [tab, setTab] = useState<TabKey>("providers");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog[]>([]);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [message, setMessage] = useState<string>(text.ready);

  const [providerFilter, setProviderFilter] = useState("");
  const [providerForm, setProviderForm] = useState({
    provider_name: "gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/models",
    api_key: "",
    enabled: true,
  });
  const [providerPresetKey, setProviderPresetKey] = useState("gemini");
  const [manualModels, setManualModels] = useState("");
  const [profileForm, setProfileForm] = useState({
    name: "default-profile",
    llm_model_id: "",
    embedding_model_id: "",
    reranker_model_id: "",
    params: '{"temperature":0.2}',
    is_default: true,
  });
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileReadonly, setProfileReadonly] = useState(false);
  const [mcpForm, setMcpForm] = useState({
    name: "tool-a",
    command: "npx",
    args: "mcp-pubmed-llm-server",
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

  const buildCommandEndpoint = (command: string, args: string[]): string => `command://${command} ${args.join(" ")}`.trim();
  const splitArgs = (raw: string): string[] => raw.split(" ").map((item) => item.trim()).filter(Boolean);

  const loadData = async () => {
    try {
      const [presetRes, providerRes, catalogRes, profileRes, mcpRes] = await Promise.all([
        api.listProviderPresets(token),
        api.listProviders(token),
        api.listCatalog(token),
        api.listRuntimeProfiles(token),
        api.listMcpServers(token),
      ]);
      setProviderPresets(presetRes.items);
      setProviders(providerRes.items);
      setCatalog(catalogRes.items);
      setProfiles(profileRes.items);
      setMcpServers(mcpRes.items);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.loadFailed);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const preset = providerPresets.find((item) => item.provider_name === providerPresetKey);
    if (!preset || providerPresetKey === text.custom) {
      return;
    }
    setProviderForm((prev) => ({ ...prev, provider_name: preset.provider_name, base_url: preset.base_url }));
  }, [providerPresetKey, providerPresets, text.custom]);

  const createProvider = async () => {
    if (!providerForm.provider_name.trim() || !providerForm.base_url.trim() || !providerForm.api_key.trim()) {
      setMessage(text.providerRequired);
      return;
    }
    try {
      await api.createProvider(
        {
          ...providerForm,
          provider_name: providerForm.provider_name.trim(),
          base_url: providerForm.base_url.trim(),
          api_key: providerForm.api_key.trim(),
        },
        token,
      );
      setMessage(text.providerSaved);
      setProviderForm((prev) => ({ ...prev, api_key: "" }));
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.providerSaveFailed);
    }
  };

  const updateProvider = async (provider: Provider) => {
    try {
      await api.updateProvider(
        provider.id,
        { base_url: provider.base_url, enabled: provider.enabled, api_key: providerForm.api_key || undefined },
        token,
      );
      setMessage(`${text.providerUpdated}: ${provider.provider_name}`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.providerUpdateFailed);
    }
  };

  const deleteProvider = async (providerId: string) => {
    try {
      await api.deleteProvider(providerId, token);
      setMessage(text.providerDeleted);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.providerDeleteFailed);
    }
  };

  const refreshProvider = async (providerId: string) => {
    try {
      await api.refreshProviderModels(
        providerId,
        {
          manual_models: manualModels.split(",").map((x) => x.trim()).filter(Boolean),
        },
        token,
      );
      setMessage(text.catalogRefreshed);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.catalogRefreshFailed);
    }
  };

  const fillProfileForm = (item: RuntimeProfile, readonly: boolean) => {
    setEditingProfileId(item.id);
    setProfileReadonly(readonly);
    setProfileForm({
      name: item.name,
      llm_model_id: item.llm_model_id || "",
      embedding_model_id: item.embedding_model_id || "",
      reranker_model_id: item.reranker_model_id || "",
      params: JSON.stringify(item.params ?? {}, null, 2),
      is_default: item.is_default,
    });
    setMessage(text.profileLoaded);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileReadonly(false);
    setProfileForm({
      name: "default-profile",
      llm_model_id: "",
      embedding_model_id: "",
      reranker_model_id: "",
      params: '{"temperature":0.2}',
      is_default: true,
    });
  };

  const submitProfile = async () => {
    if (profileReadonly) {
      return;
    }
    try {
      const params = JSON.parse(profileForm.params) as Record<string, unknown>;
      if (editingProfileId) {
        await api.updateRuntimeProfile(
          editingProfileId,
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
        setMessage(text.profileUpdated);
      } else {
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
        setMessage(text.profileCreated);
      }
      resetProfileForm();
      await loadData();
    } catch (error) {
      if (editingProfileId) {
        setMessage(error instanceof ApiError ? error.message : text.profileUpdateFailed);
      } else {
        setMessage(error instanceof ApiError ? error.message : text.profileCreateFailed);
      }
    }
  };

  const removeProfile = async (profileId: string) => {
    try {
      await api.deleteRuntimeProfile(profileId, token);
      if (editingProfileId === profileId) {
        resetProfileForm();
      }
      setMessage(text.profileDeleted);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.profileDeleteFailed);
    }
  };

  const createMcp = async () => {
    if (!mcpForm.name.trim() || !mcpForm.command.trim()) {
      setMessage(text.mcpNeedNameCmd);
      return;
    }
    try {
      const args = splitArgs(mcpForm.args);
      await api.createMcpServer(
        {
          name: mcpForm.name.trim(),
          endpoint: buildCommandEndpoint(mcpForm.command.trim(), args),
          auth_type: mcpForm.auth_type,
          auth_payload: mcpForm.auth_payload || undefined,
          enabled: mcpForm.enabled,
          timeout_ms: mcpForm.timeout_ms,
        },
        token,
      );
      setMessage(text.mcpCreated);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.mcpCreateFailed);
    }
  };

  const deleteMcp = async (serverId: string) => {
    try {
      await api.deleteMcpServer(serverId, token);
      setMessage(text.mcpDeleted);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.mcpDeleteFailed);
    }
  };

  const importMcpTemplate = async () => {
    try {
      const parsed = JSON.parse(mcpTemplate) as { mcpServers?: Record<string, { command?: string; args?: string[] }> };
      const servers = parsed.mcpServers ?? {};
      const entries = Object.entries(servers);
      if (entries.length === 0) {
        setMessage(text.templateEmpty);
        return;
      }
      for (const [name, cfg] of entries) {
        const args = Array.isArray(cfg.args) ? cfg.args : [];
        const endpoint = buildCommandEndpoint(cfg.command ?? "npx", args);
        await api.createMcpServer(
          { name, endpoint, auth_type: "none", enabled: true, timeout_ms: 8000 },
          token,
        );
      }
      setMessage(`${text.templateImported}: ${entries.length}`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.templateImportFailed);
    }
  };

  const bindQa = async () => {
    try {
      await api.bindQaMcpServers(bindingIds, token);
      setMessage(text.bindDone);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : text.bindFailed);
    }
  };

  return (
    <section className="page-grid two-cols">
      <div className="panel">
        <h3>{text.title}</h3>
        <div className="actions">
          <button type="button" className={tab === "providers" ? "" : "ghost"} onClick={() => setTab("providers")}>{text.tabProviders}</button>
          <button type="button" className={tab === "runtime" ? "" : "ghost"} onClick={() => setTab("runtime")}>{text.tabRuntime}</button>
          <button type="button" className={tab === "mcp" ? "" : "ghost"} onClick={() => setTab("mcp")}>{text.tabMcp}</button>
        </div>

        {tab === "providers" && (
          <>
            <p className="muted">{text.providerHelp}</p>
            <label>
              {text.providerSearch}
              <input value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} />
            </label>
            <label>
              {text.providerPreset}
              <select value={providerPresetKey} onChange={(e) => setProviderPresetKey(e.target.value)}>
                {providerPresets.map((item) => (
                  <option key={item.provider_name} value={item.provider_name}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              {text.providerName}
              <input value={providerForm.provider_name} onChange={(e) => setProviderForm((s) => ({ ...s, provider_name: e.target.value }))} />
            </label>
            <label>
              {text.baseUrl}
              <input value={providerForm.base_url} onChange={(e) => setProviderForm((s) => ({ ...s, base_url: e.target.value }))} />
            </label>
            <label>
              {text.apiKey}
              <input value={providerForm.api_key} onChange={(e) => setProviderForm((s) => ({ ...s, api_key: e.target.value }))} type="password" />
            </label>
            <button type="button" onClick={createProvider}>{text.addProvider}</button>
            <label>
              {text.manualModels}
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
                    <button type="button" onClick={() => void refreshProvider(item.id)}>{text.refreshModels}</button>
                    <button type="button" className="ghost" onClick={() => void updateProvider(item)}>{text.update}</button>
                    <button type="button" className="ghost" onClick={() => void deleteProvider(item.id)}>{text.delete}</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "runtime" && (
          <>
            <p className="muted">{text.runtimeHelp}</p>
            <label>
              {text.profileName}
              <input value={profileForm.name} onChange={(e) => setProfileForm((s) => ({ ...s, name: e.target.value }))} disabled={profileReadonly} />
            </label>
            <label>
              {text.llmModel}
              <select value={profileForm.llm_model_id} onChange={(e) => setProfileForm((s) => ({ ...s, llm_model_id: e.target.value }))} disabled={profileReadonly}>
                <option value="">{text.pleaseSelect}</option>
                {llmModels.map((item) => (
                  <option key={item.id} value={item.id}>{item.model_name}</option>
                ))}
              </select>
            </label>
            <label>
              {text.embeddingModel}
              <select value={profileForm.embedding_model_id} onChange={(e) => setProfileForm((s) => ({ ...s, embedding_model_id: e.target.value }))} disabled={profileReadonly}>
                <option value="">{text.pleaseSelect}</option>
                {embeddingModels.map((item) => (
                  <option key={item.id} value={item.id}>{item.model_name}</option>
                ))}
              </select>
            </label>
            <label>
              {text.rerankerModel}
              <select value={profileForm.reranker_model_id} onChange={(e) => setProfileForm((s) => ({ ...s, reranker_model_id: e.target.value }))} disabled={profileReadonly}>
                <option value="">{text.pleaseSelect}</option>
                {rerankerModels.map((item) => (
                  <option key={item.id} value={item.id}>{item.model_name}</option>
                ))}
              </select>
            </label>
            <label>
              {text.paramsJson}
              <textarea value={profileForm.params} onChange={(e) => setProfileForm((s) => ({ ...s, params: e.target.value }))} disabled={profileReadonly} />
            </label>
            <div className="actions">
              <button type="button" onClick={submitProfile} disabled={profileReadonly}>
                {editingProfileId ? text.updateProfile : text.createProfile}
              </button>
              <button type="button" className="ghost" onClick={resetProfileForm}>{text.resetForm}</button>
            </div>
            <div className="list">
              {profiles.map((item) => (
                <div key={item.id} className="list-item profile-row">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.id}</small>
                    <small>default={String(item.is_default)}</small>
                  </div>
                  <div className="icon-actions">
                    <button type="button" className="icon-btn" title={text.viewLabel} onClick={() => fillProfileForm(item, true)}>
                      <Icon d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                    </button>
                    <button type="button" className="icon-btn" title={text.editLabel} onClick={() => fillProfileForm(item, false)}>
                      <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </button>
                    <button type="button" className="icon-btn danger" title={text.deleteLabel} onClick={() => void removeProfile(item.id)}>
                      <Icon d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v7M14 10v7" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "mcp" && (
          <>
            <p className="muted">{text.mcpHelpPrefix} {mcpServers.length} {text.mcpHelpSuffix}</p>
            <label>
              {text.mcpName}
              <input value={mcpForm.name} onChange={(e) => setMcpForm((s) => ({ ...s, name: e.target.value }))} />
            </label>
            <label>
              {text.mcpCommand}
              <input value={mcpForm.command} onChange={(e) => setMcpForm((s) => ({ ...s, command: e.target.value }))} placeholder="npx" />
            </label>
            <label>
              {text.mcpArgs}
              <input value={mcpForm.args} onChange={(e) => setMcpForm((s) => ({ ...s, args: e.target.value }))} placeholder="mcp-pubmed-llm-server" />
            </label>
            <button type="button" onClick={createMcp}>{text.createMcp}</button>

            <label>
              {text.mcpTemplate}
              <textarea value={mcpTemplate} onChange={(e) => setMcpTemplate(e.target.value)} rows={8} />
            </label>
            <button type="button" onClick={importMcpTemplate}>{text.importTemplate}</button>

            <label>
              {text.qaBinding}
              <select
                multiple
                value={bindingIds}
                onChange={(e) => setBindingIds(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
              >
                {mcpServers.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={bindQa}>{text.updateBinding}</button>

            <div className="list">
              {mcpServers.map((item) => (
                <div key={item.id} className="list-item">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.endpoint}</small>
                  </div>
                  <button type="button" className="ghost" onClick={() => void deleteMcp(item.id)}>{text.delete}</button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="inline-message">{message}</p>
      </div>

      <div className="panel">
        <h3>{text.overview}</h3>
        <div className="mini-grid">
          <div><h4>{text.providerCount}</h4><p>{providers.length}</p></div>
          <div><h4>{text.mcpCount}</h4><p>{mcpServers.length}</p></div>
          <div><h4>{text.catalogCount}</h4><p>{catalog.length}</p></div>
          <div><h4>{text.profileCount}</h4><p>{profiles.length}</p></div>
        </div>
      </div>
    </section>
  );
}
