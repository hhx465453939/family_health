import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError } from "../api/client";
import type { DesensitizationPreset, DesensitizationRule, FilePreview } from "../api/types";

type Locale = "zh" | "en";

const TEXT = {
  zh: {
    title: "脱敏预览",
    loading: "加载中...",
    preview: "文件预览",
    search: "搜索",
    next: "下一个命中",
    prev: "上一个命中",
    nextDoc: "下一份",
    prevDoc: "上一份",
    selection: "当前选中",
    copySelection: "复制选中",
    useSelection: "选中即建规则",
    preset: "预设模板",
    tag: "标签",
    filterTag: "标签筛选",
    ruleType: "规则类型",
    pattern: "匹配内容",
    replacement: "替换标记",
    addRule: "添加规则",
    updateRule: "更新规则",
    cancelEdit: "取消编辑",
    rules: "脱敏规则",
    manageRules: "规则管理",
    enabled: "启用",
    disabled: "停用",
    edit: "编辑",
    remove: "删除",
    importRules: "导入规则",
    exportRules: "导出规则",
    toggleRules: "展开规则列表",
    hideRules: "收起规则列表",
    switched: "已切换",
    selectRule: "选择规则",
    applyRule: "加载到表单",
    deleteRule: "删除所选",
    toggleRule: "启用/停用",
    newRule: "新建规则",
    close: "取消",
    confirm: "确认继续",
    noPreview: "暂无预览内容",
  },
  en: {
    title: "Desensitization Preview",
    loading: "Loading...",
    preview: "Preview",
    search: "Search",
    next: "Next hit",
    prev: "Prev hit",
    nextDoc: "Next file",
    prevDoc: "Prev file",
    selection: "Selection",
    copySelection: "Copy selection",
    useSelection: "Create rule from selection",
    preset: "Preset",
    tag: "Tag",
    filterTag: "Tag filter",
    ruleType: "Rule type",
    pattern: "Pattern",
    replacement: "Replacement token",
    addRule: "Add rule",
    updateRule: "Update rule",
    cancelEdit: "Cancel edit",
    rules: "Rules",
    manageRules: "Manage rules",
    enabled: "Enabled",
    disabled: "Disabled",
    edit: "Edit",
    remove: "Remove",
    importRules: "Import rules",
    exportRules: "Export rules",
    toggleRules: "Show rules",
    hideRules: "Hide rules",
    switched: "Switched",
    selectRule: "Select rule",
    applyRule: "Load to form",
    deleteRule: "Delete selected",
    toggleRule: "Enable/Disable",
    newRule: "New rule",
    close: "Cancel",
    confirm: "Confirm",
    noPreview: "No preview content",
  },
} as const;

type Props = {
  open: boolean;
  token: string;
  locale: Locale;
  title?: string;
  file?: File | null;
  previewText?: string;
  previewName?: string;
  docIndex?: number;
  docTotal?: number;
  onPrevDoc?: () => void;
  onNextDoc?: () => void;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  extraControls?: React.ReactNode;
};

export function DesensitizationModal({
  open,
  token,
  locale,
  title,
  file,
  previewText,
  previewName,
  docIndex,
  docTotal,
  onPrevDoc,
  onNextDoc,
  confirmLabel,
  onConfirm,
  onCancel,
  extraControls,
}: Props) {
  const text = TEXT[locale];
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [rules, setRules] = useState<DesensitizationRule[]>([]);
  const [presets, setPresets] = useState<DesensitizationPreset[]>([]);
  const [selection, setSelection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [ruleFilter, setRuleFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [showRuleList, setShowRuleList] = useState(false);
  const [notice, setNotice] = useState("");
  const [docSwitching, setDocSwitching] = useState(false);
  const [docBanner, setDocBanner] = useState("");
  const [quickAction, setQuickAction] = useState<{
    visible: boolean;
    x: number;
    y: number;
    mode: "selection" | "rule";
    ruleId?: string;
  }>({ visible: false, x: 0, y: 0, mode: "selection" });
  const [ruleForm, setRuleForm] = useState({
    id: "",
    member_scope: "global",
    rule_type: "literal",
    pattern: "",
    replacement_token: "",
    tag: "",
    enabled: true,
  });
  const previewRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const rulePaneRef = useRef<HTMLDivElement | null>(null);
  const ruleListRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const bannerTimerRef = useRef<number | null>(null);

  const previewLabel = useMemo(() => {
    if (preview?.file_name) return preview.file_name;
    if (previewName) return previewName;
    if (file?.name) return file.name;
    return "";
  }, [file?.name, preview?.file_name, previewName]);

  const maskedPreview = useMemo(() => {
    if (!preview?.text) {
      return { text: "", counts: [] as Array<{ id: string; count: number }> };
    }
    let text = preview.text;
    const counts: Array<{ id: string; count: number }> = [];
    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }
      try {
        const regex =
          rule.rule_type === "literal"
            ? new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
            : new RegExp(rule.pattern, "g");
        const matches = text.match(regex);
        const count = matches ? matches.length : 0;
        if (count > 0) {
          text = text.replace(regex, rule.replacement_token);
        }
        counts.push({ id: rule.id, count });
      } catch {
        counts.push({ id: rule.id, count: 0 });
      }
    }
    return { text, counts };
  }, [preview?.text, rules]);

  const ruleHitInfo = useMemo(() => {
    const info = new Map<string, { count: number; firstIndex: number; firstLength: number }>();
    const source = preview?.text ?? "";
    if (!source) return info;
    for (const rule of rules) {
      if (!rule.pattern) {
        info.set(rule.id, { count: 0, firstIndex: -1, firstLength: 0 });
        continue;
      }
      try {
        const regex =
          rule.rule_type === "literal"
            ? new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
            : new RegExp(rule.pattern, "g");
        let match: RegExpExecArray | null = null;
        let count = 0;
        let firstIndex = -1;
        let firstLength = 0;
        while ((match = regex.exec(source)) !== null) {
          if (match.index === regex.lastIndex) {
            regex.lastIndex += 1;
          }
          if (count === 0) {
            firstIndex = match.index;
            firstLength = match[0]?.length ?? 0;
          }
          count += 1;
        }
        info.set(rule.id, { count, firstIndex, firstLength });
      } catch {
        info.set(rule.id, { count: 0, firstIndex: -1, firstLength: 0 });
      }
    }
    return info;
  }, [preview?.text, rules]);

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const buildHighlightHtml = (text: string) => {
    if (!text) return "";
    const matches: Array<{ start: number; end: number; token: string; ruleId: string }> = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        const regex =
          rule.rule_type === "literal"
            ? new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
            : new RegExp(rule.pattern, "g");
        let match: RegExpExecArray | null = null;
        while ((match = regex.exec(text)) !== null) {
          if (match.index === regex.lastIndex) {
            regex.lastIndex += 1;
          }
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            token: rule.replacement_token,
            ruleId: rule.id,
          });
        }
      } catch {
        // Ignore invalid regex for preview highlight.
      }
    }
    if (matches.length === 0) {
      return escapeHtml(text);
    }
    matches.sort((a, b) => a.start - b.start || a.end - b.end);
    const output: string[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start < cursor) {
        continue;
      }
      output.push(escapeHtml(text.slice(cursor, match.start)));
      const raw = escapeHtml(text.slice(match.start, match.end));
      output.push(`<mark data-token="${escapeHtml(match.token)}" data-rule-id="${escapeHtml(match.ruleId)}">${raw}</mark>`);
      cursor = match.end;
    }
    output.push(escapeHtml(text.slice(cursor)));
    return output.join("");
  };

  const highlightedOriginal = useMemo(
    () => buildHighlightHtml(preview?.text ?? ""),
    [preview?.text, rules],
  );
  const highlightedMasked = useMemo(
    () => buildHighlightHtml(maskedPreview.text),
    [maskedPreview.text, rules],
  );

  useEffect(() => {
    if (!open) return;
    setSelection("");
    setSearchQuery("");
    setSearchHits([]);
    setSearchIndex(0);
    setRuleFilter("");
    setTagFilter("");
    setSelectedRuleIds([]);
    setShowRuleList(false);
    setNotice("");
    setQuickAction({ visible: false, x: 0, y: 0, mode: "selection" });
    setDocSwitching(false);
    setDocBanner("");
    const load = async () => {
      setLoading(true);
      try {
        const [rulesRes, presetsRes] = await Promise.all([
          api.listDesensitizationRules(token, false),
          api.listDesensitizationPresets(token),
        ]);
        setRules(rulesRes.items);
        setPresets(presetsRes.items);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    if (previewText !== undefined) {
      setPreview({ file_name: previewName || "", text: previewText });
      return;
    }
    if (!file) {
      setPreview(null);
      return;
    }
    const loadPreview = async () => {
      setLoading(true);
      try {
        const res = await api.previewFile(file, token);
        setPreview(res);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : text.noPreview;
        setPreview({ file_name: file.name, text: message });
      } finally {
        setLoading(false);
      }
    };
    void loadPreview();
  }, [file, open, previewName, previewText, text.noPreview, token]);

  useEffect(() => {
    if (!open) return;
    if (!previewLabel) return;
    setDocSwitching(true);
    const timer = window.setTimeout(() => setDocSwitching(false), 240);
    return () => window.clearTimeout(timer);
  }, [open, previewLabel]);

  useEffect(() => {
    if (!open || !previewLabel) return;
    setDocBanner(`${text.switched}: ${previewLabel}`);
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = window.setTimeout(() => {
      setDocBanner("");
      bannerTimerRef.current = null;
    }, 1600);
  }, [open, previewLabel, text.switched]);

  useEffect(() => {
    if (!open) return;
    previewRef.current?.scrollTo({ top: 0 });
  }, [open, previewLabel]);

  useEffect(() => {
    if (!preview?.text) {
      setSearchHits([]);
      setSearchIndex(0);
      return;
    }
    if (!searchQuery) {
      setSearchHits([]);
      setSearchIndex(0);
      return;
    }
    const hits: number[] = [];
    const lowerText = preview.text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    let idx = lowerText.indexOf(lowerQuery);
    while (idx !== -1) {
      hits.push(idx);
      idx = lowerText.indexOf(lowerQuery, idx + lowerQuery.length);
    }
    setSearchHits(hits);
    setSearchIndex(0);
  }, [preview?.text, searchQuery]);

  const scrollToIndex = (index: number, length: number) => {
    const container = previewRef.current;
    if (!container) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let count = 0;
    while (current) {
      const text = current.textContent ?? "";
      const next = count + text.length;
      if (index >= count && index <= next) {
        const range = document.createRange();
        const startOffset = index - count;
        const endOffset = Math.min(startOffset + length, text.length);
        range.setStart(current, startOffset);
        range.setEnd(current, endOffset);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        (current.parentElement ?? container).scrollIntoView({ block: "center" });
        setSelection(range.toString());
        break;
      }
      count = next;
      current = walker.nextNode();
    }
  };

  const jumpToHit = (offset: number) => {
    if (!preview?.text || searchHits.length === 0) return;
    const nextIndex = (searchIndex + offset + searchHits.length) % searchHits.length;
    setSearchIndex(nextIndex);
    const start = searchHits[nextIndex];
    const end = start + searchQuery.length;
    scrollToIndex(start, end - start);
  };

  const captureSelection = () => {
    const sel = window.getSelection();
    const selected = sel?.toString() ?? "";
    setSelection(selected);
    if (!sel || !selected.trim() || sel.rangeCount === 0) {
      setQuickAction((prev) => ({ ...prev, visible: false }));
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      setQuickAction((prev) => ({ ...prev, visible: false }));
      return;
    }
    setQuickAction({
      visible: true,
      x: rect.right + 6,
      y: rect.top - 6,
      mode: "selection",
    });
  };

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest?.("mark") as HTMLElement | null;
    if (!mark) {
      return;
    }
    const ruleId = mark.getAttribute("data-rule-id");
    if (!ruleId) return;
    const rect = mark.getBoundingClientRect();
    setQuickAction({
      visible: true,
      x: rect.right + 6,
      y: rect.top - 6,
      mode: "rule",
      ruleId,
    });
  };

  const closeQuickAction = () => {
    setQuickAction((prev) => ({ ...prev, visible: false }));
  };

  const nextAutoToken = () => {
    const base = "MASK";
    const existing = rules
      .map((item) => item.replacement_token)
      .filter((token) => token.startsWith("[[") && token.endsWith("]]") && token.includes(base));
    return `[[${base}_${existing.length + 1}]]`;
  };

  const applySelectionToRule = async () => {
    if (!selection) return;
    const replacement = ruleForm.replacement_token || nextAutoToken();
    const res = await api.createDesensitizationRule(
      {
        member_scope: "global",
        rule_type: "literal",
        pattern: selection,
        replacement_token: replacement,
        tag: ruleForm.tag || null,
        enabled: true,
      },
      token,
    );
    setRules((prev) => [...prev, res]);
    setRuleForm((prev) => ({
      ...prev,
      pattern: selection,
      replacement_token: replacement,
      rule_type: "literal",
    }));
    setNotice(locale === "zh" ? "已自动创建规则并生效" : "Rule created and applied");
  };

  const selectPreset = (key: string) => {
    const preset = presets.find((item) => item.key === key);
    if (!preset) return;
    setRuleForm((prev) => ({
      ...prev,
      rule_type: preset.rule_type,
      pattern: preset.pattern,
      replacement_token: preset.replacement_token,
      tag: preset.tag || prev.tag,
    }));
    setNotice(locale === "zh" ? "已载入预设模板" : "Preset loaded");
  };

  const saveRule = async () => {
    if (!ruleForm.pattern || !ruleForm.replacement_token) return;
    if (ruleForm.id) {
      const res = await api.updateDesensitizationRule(
        ruleForm.id,
        {
          member_scope: ruleForm.member_scope,
          rule_type: ruleForm.rule_type,
          pattern: ruleForm.pattern,
          replacement_token: ruleForm.replacement_token,
          tag: ruleForm.tag || null,
          enabled: ruleForm.enabled,
        },
        token,
      );
      setRules((prev) => prev.map((item) => (item.id === res.id ? res : item)));
      setNotice(locale === "zh" ? "规则已更新并生效" : "Rule updated");
    } else {
      const res = await api.createDesensitizationRule(
        {
          member_scope: ruleForm.member_scope,
          rule_type: ruleForm.rule_type,
          pattern: ruleForm.pattern,
          replacement_token: ruleForm.replacement_token,
          tag: ruleForm.tag || null,
          enabled: ruleForm.enabled,
        },
        token,
      );
      setRules((prev) => [...prev, res]);
      setNotice(locale === "zh" ? "规则已添加并生效" : "Rule added");
    }
    setRuleForm({
      id: "",
      member_scope: "global",
      rule_type: "literal",
      pattern: "",
      replacement_token: "",
      tag: "",
      enabled: true,
    });
  };

  const startEdit = (rule: DesensitizationRule) => {
    setRuleForm({
      id: rule.id,
      member_scope: rule.member_scope,
      rule_type: rule.rule_type,
      pattern: rule.pattern,
      replacement_token: rule.replacement_token,
      tag: rule.tag ?? "",
      enabled: rule.enabled,
    });
    setNotice(locale === "zh" ? "已加载已有规则，可修改" : "Existing rule loaded");
  };

  const removeRule = async (ruleId: string) => {
    await api.deleteDesensitizationRule(ruleId, token);
    setRules((prev) => prev.filter((item) => item.id !== ruleId));
    setNotice(locale === "zh" ? "规则已删除" : "Rule removed");
  };

  const toggleRule = async (rule: DesensitizationRule) => {
    const res = await api.updateDesensitizationRule(rule.id, { enabled: !rule.enabled }, token);
    setRules((prev) => prev.map((item) => (item.id === res.id ? res : item)));
    setNotice(res.enabled ? (locale === "zh" ? "规则已启用" : "Rule enabled") : (locale === "zh" ? "规则已停用" : "Rule disabled"));
  };

  const jumpToRule = (ruleId: string) => {
    const hit = ruleHitInfo.get(ruleId);
    if (!hit || hit.count === 0 || hit.firstIndex < 0) {
      setNotice(locale === "zh" ? "该规则暂无命中" : "No matches for this rule");
      return;
    }
    scrollToIndex(hit.firstIndex, hit.firstLength);
  };

  const tagOptions = useMemo(() => {
    const baseTags = ["姓名", "电话", "邮箱", "身份证", "地址", "银行卡", "其他"];
    const extra = rules.map((rule) => rule.tag).filter((tag): tag is string => Boolean(tag));
    const presetTags = presets.map((preset) => preset.tag).filter((tag): tag is string => Boolean(tag));
    const hasUntagged = rules.some((rule) => !rule.tag);
    const untaggedLabel = locale === "zh" ? "未分类" : "Untagged";
    return Array.from(new Set([...baseTags, ...extra, ...presetTags, ...(hasUntagged ? [untaggedLabel] : [])]));
  }, [presets, rules]);

  const filteredGroups = useMemo(() => {
    const normalizedFilter = ruleFilter.trim().toLowerCase();
    const groups = new Map<string, DesensitizationRule[]>();
    for (const rule of rules) {
      const tag = rule.tag?.trim() || (locale === "zh" ? "未分类" : "Untagged");
      if (tagFilter && tag !== tagFilter) continue;
      if (normalizedFilter) {
        const haystack = `${rule.pattern} ${rule.replacement_token} ${rule.tag ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedFilter)) continue;
      }
      if (!groups.has(tag)) {
        groups.set(tag, []);
      }
      groups.get(tag)?.push(rule);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [locale, ruleFilter, rules, tagFilter]);

  const exportRules = () => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      rules: rules.map((rule) => ({
        member_scope: rule.member_scope,
        rule_type: rule.rule_type,
        pattern: rule.pattern,
        replacement_token: rule.replacement_token,
        tag: rule.tag ?? null,
        enabled: rule.enabled,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "desensitization-rules.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(locale === "zh" ? "规则已导出" : "Rules exported");
  };

  const importRules = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed as { rules?: unknown }).rules;
      if (!Array.isArray(items)) {
        setNotice(locale === "zh" ? "导入文件格式不正确" : "Invalid import file");
        return;
      }
      const created: DesensitizationRule[] = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const candidate = item as Partial<DesensitizationRule>;
        if (!candidate.pattern || !candidate.replacement_token) continue;
        const res = await api.createDesensitizationRule(
          {
            member_scope: candidate.member_scope ?? "global",
            rule_type: candidate.rule_type ?? "literal",
            pattern: candidate.pattern,
            replacement_token: candidate.replacement_token,
            tag: candidate.tag ?? null,
            enabled: candidate.enabled ?? true,
          },
          token,
        );
        created.push(res);
      }
      if (created.length > 0) {
        setRules((prev) => [...prev, ...created]);
      }
      setNotice(
        locale === "zh"
          ? `已导入 ${created.length} 条规则`
          : `Imported ${created.length} rules`,
      );
    } catch {
      setNotice(locale === "zh" ? "导入失败，请检查文件" : "Import failed");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div ref={modalRef} className="modal-card preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <div className="actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                rulePaneRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                rulePaneRef.current?.focus();
              }}
            >
              {text.manageRules}
            </button>
          </div>
          <h3>{title ?? text.title}</h3>
          <div className="actions">
          </div>
        </div>

        {docBanner && (
          <div className="doc-banner">
            {docBanner}
          </div>
        )}

        {extraControls}

        <div ref={rulePaneRef} className="rule-pane" tabIndex={-1}>
            <div className="rule-toolbar">
              <strong>{text.rules}</strong>
              <div className="actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const next = !showRuleList;
                    setShowRuleList(next);
                    if (next) {
                      window.setTimeout(() => ruleListRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 40);
                    }
                  }}
                >
                  {showRuleList ? text.hideRules : text.toggleRules}
                </button>
                <button type="button" className="ghost" onClick={() => exportRules()}>
                  {text.exportRules}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => importInputRef.current?.click()}
                >
                  {text.importRules}
                </button>
              </div>
            </div>
            <div className="rule-form">
              <div className="rule-quick">
                <label>
                  {text.selectRule}
                  <select
                    value={ruleForm.id}
                    onChange={(e) => {
                      const target = rules.find((rule) => rule.id === e.target.value);
                      if (!target) return;
                      startEdit(target);
                    }}
                  >
                    <option value="">{locale === "zh" ? "选择已有规则" : "Select existing rule"}</option>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.replacement_token || rule.pattern}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      if (!ruleForm.id) return;
                      const target = rules.find((rule) => rule.id === ruleForm.id);
                      if (target) startEdit(target);
                    }}
                  >
                    {text.applyRule}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      if (!ruleForm.id) return;
                      const target = rules.find((rule) => rule.id === ruleForm.id);
                      if (target) void toggleRule(target);
                    }}
                  >
                    {text.toggleRule}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      if (ruleForm.id) {
                        void removeRule(ruleForm.id);
                      }
                    }}
                  >
                    {text.deleteRule}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRuleForm({
                        id: "",
                        member_scope: "global",
                        rule_type: "literal",
                        pattern: "",
                        replacement_token: "",
                        tag: "",
                        enabled: true,
                      })
                    }
                  >
                    {text.newRule}
                  </button>
                </div>
              </div>
              <label>
                {text.preset}
                <select onChange={(e) => selectPreset(e.target.value)} defaultValue="">
                  <option value="">-</option>
                  {presets.map((preset) => (
                    <option key={preset.key} value={preset.key}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <label>
                {text.ruleType}
                <select value={ruleForm.rule_type} onChange={(e) => setRuleForm((prev) => ({ ...prev, rule_type: e.target.value }))}>
                  <option value="literal">literal</option>
                  <option value="regex">regex</option>
                </select>
              </label>
              <label>
                {text.tag}
                <input
                  value={ruleForm.tag}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, tag: e.target.value }))}
                  list="desensitization-tags"
                  placeholder={locale === "zh" ? "如：姓名/电话/邮箱" : "e.g. Phone/Email"}
                />
                <datalist id="desensitization-tags">
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </label>
              <label>
                {locale === "zh" ? "使用已有规则" : "Use existing rule"}
                <select
                  onChange={(e) => {
                    const target = rules.find((rule) => rule.id === e.target.value);
                    if (!target) return;
                    startEdit(target);
                  }}
                  value=""
                >
                  <option value="">{locale === "zh" ? "选择已有规则" : "Select existing rule"}</option>
                  {rules.map((rule) => (
                    <option key={rule.id} value={rule.id}>{rule.replacement_token}</option>
                  ))}
                </select>
              </label>
              <label>
                {text.pattern}
                <input value={ruleForm.pattern} onChange={(e) => setRuleForm((prev) => ({ ...prev, pattern: e.target.value }))} />
              </label>
              <label>
                {text.replacement}
                <input value={ruleForm.replacement_token} onChange={(e) => setRuleForm((prev) => ({ ...prev, replacement_token: e.target.value }))} />
              </label>
              <label className="inline-check">
                <input type="checkbox" checked={ruleForm.enabled} onChange={(e) => setRuleForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
                {text.enabled}
              </label>
              <div className="actions">
                <button type="button" onClick={() => void saveRule()}>
                  {ruleForm.id ? text.updateRule : text.addRule}
                </button>
                {ruleForm.id && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setRuleForm({
                        id: "",
                        member_scope: "global",
                        rule_type: "literal",
                        pattern: "",
                        replacement_token: "",
                        tag: "",
                        enabled: true,
                      })
                    }
                  >
                    {text.cancelEdit}
                  </button>
                )}
              </div>
            </div>
            <div ref={ruleListRef} className={`rule-list-wrap ${showRuleList ? "open" : ""}`}>
                <label>
                  {locale === "zh" ? "筛选规则" : "Filter"}
                  <input value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} />
                </label>
                <label>
                  {text.filterTag}
                  <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                    <option value="">{locale === "zh" ? "全部" : "All"}</option>
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setSelectedRuleIds(rules.map((rule) => rule.id));
                    }}
                  >
                    {locale === "zh" ? "全选" : "Select all"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setSelectedRuleIds([])}
                  >
                    {locale === "zh" ? "清空选择" : "Clear selection"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      if (selectedRuleIds.length === 0) return;
                      for (const ruleId of selectedRuleIds) {
                        await api.deleteDesensitizationRule(ruleId, token);
                      }
                      setRules((prev) => prev.filter((item) => !selectedRuleIds.includes(item.id)));
                      setSelectedRuleIds([]);
                      setNotice(locale === "zh" ? "已批量删除规则" : "Rules deleted");
                    }}
                  >
                    {locale === "zh" ? "批量删除" : "Batch delete"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      for (const rule of rules) {
                        await api.deleteDesensitizationRule(rule.id, token);
                      }
                      setRules([]);
                      setSelectedRuleIds([]);
                      setNotice(locale === "zh" ? "已清空全部规则" : "All rules cleared");
                    }}
                  >
                    {locale === "zh" ? "清空全部" : "Clear all"}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const targetFile = e.target.files?.[0];
                      if (targetFile) {
                        void importRules(targetFile);
                      }
                    }}
                    style={{ display: "none" }}
                  />
                </div>
                <div className="rule-list">
                  {rules.length === 0 && (
                    <div className="rule-empty">
                      {locale === "zh" ? "暂无规则，请在上方新增或从预设/导入开始。" : "No rules yet. Add one above or import presets."}
                    </div>
                  )}
                  {filteredGroups.map(([group, groupRules]) => (
                    <div key={group} className="rule-group">
                      <div className="rule-group-title">{group}</div>
                      {groupRules.map((rule) => {
                        const hit = ruleHitInfo.get(rule.id);
                        return (
                          <div key={rule.id} className="rule-item">
                            <label className="inline-check">
                              <input
                                type="checkbox"
                                checked={selectedRuleIds.includes(rule.id)}
                                onChange={(e) =>
                                  setSelectedRuleIds((prev) =>
                                    e.target.checked ? [...prev, rule.id] : prev.filter((x) => x !== rule.id),
                                  )
                                }
                              />
                            </label>
                            <div>
                              <div className="rule-tag">{rule.replacement_token}</div>
                              <small className="muted">{rule.pattern}</small>
                              <button type="button" className="link-button" onClick={() => jumpToRule(rule.id)}>
                                {locale === "zh" ? "命中" : "Hits"}: {hit?.count ?? 0}
                              </button>
                            </div>
                            <div className="actions">
                              <button type="button" className="ghost" onClick={() => toggleRule(rule)}>
                                {rule.enabled ? text.enabled : text.disabled}
                              </button>
                              <button type="button" className="ghost" onClick={() => startEdit(rule)}>{text.edit}</button>
                              <button type="button" className="ghost" onClick={() => void removeRule(rule.id)}>{text.remove}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
            </div>
        </div>

        <div className="preview-layout">
          <div className="preview-pane">
            <div className="row-between">
              <strong>{text.preview}</strong>
              <div className="doc-meta">
                <span className="muted">{previewLabel}</span>
                {typeof docTotal === "number" && docTotal > 0 && (
                  <span className="muted">
                    {(docIndex ?? 0) + 1}/{docTotal}
                  </span>
                )}
                {(onPrevDoc || onNextDoc) && (
                  <div className="actions">
                    <button type="button" className="ghost" onClick={onPrevDoc} disabled={!onPrevDoc || (docIndex ?? 0) <= 0}>
                      {text.prevDoc}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={onNextDoc}
                      disabled={!onNextDoc || (typeof docTotal === "number" ? (docIndex ?? 0) >= docTotal - 1 : false)}
                    >
                      {text.nextDoc}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="preview-toolbar">
              <label>
                {text.search}
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => jumpToHit(-1)}>{text.prev}</button>
                <button type="button" className="ghost" onClick={() => jumpToHit(1)}>{text.next}</button>
              </div>
            </div>
            <div className={`preview-compare ${docSwitching ? "doc-switch" : ""}`}>
              <div>
                <div className="preview-title">{locale === "zh" ? "原文高亮" : "Original (highlighted)"}</div>
                <div className="preview-shell">
                  <div
                    ref={previewRef}
                    className="preview-area preview-highlight"
                    onMouseUp={captureSelection}
                    onClick={handlePreviewClick}
                    onScroll={closeQuickAction}
                    onMouseDown={() => setQuickAction((prev) => ({ ...prev, visible: false }))}
                    dangerouslySetInnerHTML={{ __html: highlightedOriginal }}
                  />
                </div>
              </div>
              <div>
                <div className="preview-title">{locale === "zh" ? "脱敏后对比" : "Masked (compare)"}</div>
                <div
                  className="preview-area preview-highlight preview-sanitized"
                  dangerouslySetInnerHTML={{ __html: highlightedMasked }}
                />
              </div>
            </div>
            <div className="preview-selection">
              <span>{text.selection}: {selection ? selection.slice(0, 80) : "-"}</span>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => void navigator.clipboard.writeText(selection)} disabled={!selection}>
                  {text.copySelection}
                </button>
                <button type="button" onClick={() => void applySelectionToRule()} disabled={!selection}>
                  {text.useSelection}
                </button>
              </div>
            </div>
            {(onPrevDoc || onNextDoc) && (
              <div className="doc-footer">
                <div className="actions">
                  <button type="button" className="ghost" onClick={onPrevDoc} disabled={!onPrevDoc || (docIndex ?? 0) <= 0}>
                    {text.prevDoc}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={onNextDoc}
                    disabled={!onNextDoc || (typeof docTotal === "number" ? (docIndex ?? 0) >= docTotal - 1 : false)}
                  >
                    {text.nextDoc}
                  </button>
                </div>
                {typeof docTotal === "number" && docTotal > 0 && (
                  <span className="muted">
                    {(docIndex ?? 0) + 1}/{docTotal}
                  </span>
                )}
              </div>
            )}
          </div>

        </div>

        {loading && <div className="inline-message">{text.loading}</div>}
        {notice && <div className="inline-message">{notice}</div>}
        {quickAction.visible && (
          <div className="quick-action" style={{ top: quickAction.y, left: quickAction.x }}>
            {quickAction.mode === "selection" ? (
              <button
                type="button"
                className="quick-action-btn"
                onClick={() => {
                  void applySelectionToRule();
                  closeQuickAction();
                }}
                title={text.useSelection}
              >
                +
              </button>
            ) : (
              <div className="quick-action-menu">
                <button
                  type="button"
                  onClick={() => {
                    const target = rules.find((rule) => rule.id === quickAction.ruleId);
                    if (target) {
                      startEdit(target);
                      rulePaneRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                    }
                    closeQuickAction();
                  }}
                >
                  {text.edit}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (quickAction.ruleId) {
                      void removeRule(quickAction.ruleId);
                    }
                    closeQuickAction();
                  }}
                >
                  {text.remove}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="actions">
          <button type="button" className="ghost" onClick={onCancel}>{text.close}</button>
          <button type="button" onClick={() => void onConfirm()}>{confirmLabel ?? text.confirm}</button>
        </div>
      </div>
    </div>
  );
}
