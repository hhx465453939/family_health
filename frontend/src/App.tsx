import { useEffect, useMemo, useState } from "react";

import { AUTH_EXPIRED_EVENT, api, setApiLocale } from "./api/client";
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

function loadSession(): UserSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as UserSession;
    if (!parsed?.token || !parsed?.role || !parsed?.userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: UserSession | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  const [authMessage, setAuthMessage] = useState("");
  const [activeNav, setActiveNav] = useState<NavKey>("chat");
  const [health, setHealth] = useState<"online" | "offline">("offline");
  const [locale, setLocale] = useState<Locale>(() => loadLocale());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());

  const text = TEXT[locale];

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    setApiLocale(locale);
  }, [locale]);

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
      saveSession(null);
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

  const handleLogin = (next: UserSession) => {
    setSession(next);
    saveSession(next);
    setAuthMessage("");
  };

  const logout = () => {
    setSession(null);
    saveSession(null);
  };

  if (!session) {
    return <AuthPage onLogin={handleLogin} initialMessage={authMessage} locale={locale} onLocaleChange={setLocale} />;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand">
          <h1>Aurelia Health</h1>
          <p>{text.brandSub}</p>
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
          <div>
            <strong>
              {text.currentRole}: {session.role}
            </strong>
            <span className={health === "online" ? "status-online" : "status-offline"}>
              {health === "online" ? text.online : text.offline}
            </span>
          </div>
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
