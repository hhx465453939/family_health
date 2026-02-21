import { useEffect, useMemo, useRef, useState } from "react";

import { AUTH_EXPIRED_EVENT, api, refreshAuth, setApiLocale, setSessionAccessor } from "./api/client";
import type { UserSession } from "./api/types";
import { AuthPage } from "./pages/AuthPage";
import { ChatCenter } from "./pages/ChatCenter";
import { ExportCenter } from "./pages/ExportCenter";
import { KnowledgeBaseCenter } from "./pages/KnowledgeBaseCenter";
import { SettingsCenter } from "./pages/SettingsCenter";

type NavKey = "settings" | "chat" | "kb" | "export";
type Locale = "zh" | "en";
type Theme = "light" | "dark";

const SESSION_KEY = "fh_session";
const LOCALE_KEY = "fh_locale";
const THEME_KEY = "fh_theme";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

function readSession(storage: Storage): UserSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed?.token || !parsed?.role || !parsed?.userId) {
      return null;
    }
    if (parsed.expires_at && Date.now() > parsed.expires_at) {
      storage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadSession(): UserSession | null {
  return readSession(localStorage) ?? readSession(sessionStorage);
}

function saveSession(session: UserSession | null, remember: boolean): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  if (remember) {
    const payload: UserSession = { ...session, expires_at: Date.now() + SESSION_TTL_MS };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    const payload: UserSession = { ...session };
    delete payload.expires_at;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadLocale(): Locale {
  return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "zh";
}

function loadTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

const TEXT = {
  zh: {
    authExpired: "登录状态已失效，请重新登录。",
    brandSub: "家庭健康管理中台",
    nav: {
      settings: "设置中心",
      chat: "聊天中心",
      kb: "知识库中心",
      export: "导出中心",
    },
    currentRole: "当前角色",
    online: "服务在线",
    offline: "服务离线",
    searchPlaceholder: "全局搜索（预留）",
    logout: "退出登录",
    lang: "中文",
    themeLight: "亮色",
    themeDark: "暗色",
  },
  en: {
    authExpired: "Authentication expired. Please sign in again.",
    brandSub: "Family Health Workspace",
    nav: {
      settings: "Settings",
      chat: "Chat",
      kb: "Knowledge Base",
      export: "Export",
    },
    currentRole: "Role",
    online: "Service Online",
    offline: "Service Offline",
    searchPlaceholder: "Global search (reserved)",
    logout: "Sign out",
    lang: "English",
    themeLight: "Light",
    themeDark: "Dark",
  },
} as const;

export function App() {
  const [session, setSession] = useState<UserSession | null>(() => loadSession());
  const sessionRef = useRef<UserSession | null>(session);
  const [authMessage, setAuthMessage] = useState("");
  const [activeNav, setActiveNav] = useState<NavKey>("chat");
  const [health, setHealth] = useState<"online" | "offline">("offline");
  const [locale, setLocale] = useState<Locale>(() => loadLocale());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [navCollapsed, setNavCollapsed] = useState(false);

  const text = TEXT[locale];

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setSessionAccessor({
      get: () => sessionRef.current,
      set: (next) => {
        setSession((prev) => {
          if (!next) {
            saveSession(null, true);
            return null;
          }
          const merged: UserSession = {
            ...prev,
            ...next,
            expires_at: prev?.expires_at ?? next.expires_at,
          };
          const remember = Boolean(merged.expires_at);
          saveSession(merged, remember);
          return merged;
        });
      },
    });
    return () => {
      setSessionAccessor(null);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    setApiLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!session?.refreshToken) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshAuth();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [session?.refreshToken]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      try {
        await api.health();
        if (!disposed) {
          setHealth("online");
        }
      } catch {
        if (!disposed) {
          setHealth("offline");
        }
      }
    };
    poll();
    const timer = window.setInterval(poll, 10000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setSession(null);
      saveSession(null, true);
      setAuthMessage(text.authExpired);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    };
  }, [text.authExpired]);

  const navItems: Array<{ key: NavKey; label: string }> = useMemo(() => {
    if (!session) {
      return [];
    }
    return [
      { key: "settings", label: text.nav.settings },
      { key: "chat", label: text.nav.chat },
      { key: "kb", label: text.nav.kb },
      { key: "export", label: text.nav.export },
    ];
  }, [session, text.nav.chat, text.nav.export, text.nav.kb, text.nav.settings]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const isVisible = navItems.some((item) => item.key === activeNav);
    if (!isVisible && navItems.length > 0) {
      setActiveNav(navItems[0].key);
    }
  }, [activeNav, navItems, session]);

  const handleLogin = (next: UserSession, remember: boolean) => {
    setSession(next);
    saveSession(next, remember);
    setAuthMessage("");
  };

  const logout = () => {
    setSession(null);
    saveSession(null, true);
  };

  if (!session) {
    return <AuthPage onLogin={handleLogin} initialMessage={authMessage} locale={locale} onLocaleChange={setLocale} />;
  }

  return (
    <div className={navCollapsed ? "app-shell nav-collapsed" : "app-shell"}>
      <aside className={navCollapsed ? "side-nav collapsed" : "side-nav"}>
        <div className="brand">
          <div className="brand-row">
            <div>
              <h1>Aurelia Health</h1>
              <p>{text.brandSub}</p>
            </div>
            <button
              type="button"
              className="nav-toggle"
              onClick={() => setNavCollapsed(true)}
              title={locale === "zh" ? "收起侧边栏" : "Collapse sidebar"}
              aria-label={locale === "zh" ? "收起侧边栏" : "Collapse sidebar"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5z" fill="currentColor" opacity="0.18" />
                <path d="M19 4v16M13 8l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeNav === item.key ? "nav-item active" : "nav-item"}
              onClick={() => setActiveNav(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            {navCollapsed && (
              <button
                type="button"
                className="nav-toggle"
                onClick={() => setNavCollapsed(false)}
                title={locale === "zh" ? "展开侧边栏" : "Expand sidebar"}
                aria-label={locale === "zh" ? "展开侧边栏" : "Expand sidebar"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9z" fill="currentColor" opacity="0.18" />
                  <path d="M5 4v16M11 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <strong>
              {text.currentRole}: {session.role}
            </strong>
            <span className={health === "online" ? "status-online" : "status-offline"}>
              {health === "online" ? text.online : text.offline}
            </span>
          </div>
          <div id="chat-pill-slot" className="topbar-pill-slot" />
          <div className="topbar-actions">
            <div className="segmented">
              <button type="button" className={locale === "zh" ? "" : "ghost"} onClick={() => setLocale("zh")}>
                中文
              </button>
              <button type="button" className={locale === "en" ? "" : "ghost"} onClick={() => setLocale("en")}>
                EN
              </button>
            </div>
            <div className="segmented">
              <button type="button" className={theme === "light" ? "" : "ghost"} onClick={() => setTheme("light")}>
                {text.themeLight}
              </button>
              <button type="button" className={theme === "dark" ? "" : "ghost"} onClick={() => setTheme("dark")}>
                {text.themeDark}
              </button>
            </div>
            <input placeholder={text.searchPlaceholder} />
            <button type="button" onClick={logout}>
              {text.logout}
            </button>
          </div>
        </header>

        {activeNav === "settings" && <SettingsCenter token={session.token} locale={locale} />}
        {activeNav === "chat" && <ChatCenter token={session.token} locale={locale} />}
        {activeNav === "kb" && <KnowledgeBaseCenter token={session.token} role={session.role} locale={locale} />}
        {activeNav === "export" && <ExportCenter token={session.token} locale={locale} />}
      </main>
    </div>
  );
}
