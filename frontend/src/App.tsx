import { useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import type { UserSession } from "./api/types";
import { AuthPage } from "./pages/AuthPage";
import { ChatCenter } from "./pages/ChatCenter";
import { ExportCenter } from "./pages/ExportCenter";
import { KnowledgeBaseCenter } from "./pages/KnowledgeBaseCenter";
import { SettingsCenter } from "./pages/SettingsCenter";

type NavKey = "settings" | "chat" | "kb" | "export";

const SESSION_KEY = "fh_session";

function loadSession(): UserSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserSession;
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

export function App() {
  const [session, setSession] = useState<UserSession | null>(() => loadSession());
  const [activeNav, setActiveNav] = useState<NavKey>("chat");
  const [health, setHealth] = useState<"online" | "offline">("offline");

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

  const navItems: Array<{ key: NavKey; label: string }> = useMemo(() => {
    if (!session) {
      return [];
    }
    return [
      { key: "settings", label: "设置中心" },
      { key: "chat", label: "聊天中心" },
      { key: "kb", label: "知识库中心" },
      { key: "export", label: "导出中心" },
    ];
  }, [session]);

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
  };

  const logout = () => {
    setSession(null);
    saveSession(null);
  };

  if (!session) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand">
          <h1>Aurelia Health</h1>
          <p>家庭健康管理中台</p>
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
            <strong>当前角色: {session.role}</strong>
            <span className={health === "online" ? "status-online" : "status-offline"}>
              {health === "online" ? "服务在线" : "服务离线"}
            </span>
          </div>
          <div className="topbar-actions">
            <input placeholder="全局搜索（预留）" />
            <button type="button" onClick={logout}>
              退出登录
            </button>
          </div>
        </header>

        {activeNav === "settings" && <SettingsCenter token={session.token} />}
        {activeNav === "chat" && <ChatCenter token={session.token} />}
        {activeNav === "kb" && <KnowledgeBaseCenter token={session.token} role={session.role} />}
        {activeNav === "export" && <ExportCenter token={session.token} />}
      </main>
    </div>
  );
}
