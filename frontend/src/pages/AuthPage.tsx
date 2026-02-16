import { FormEvent, useState } from "react";

import { api, ApiError } from "../api/client";
import type { UserSession } from "../api/types";

type AuthMode = "login" | "bootstrap" | "register";

export function AuthPage({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("OwnerPass123");
  const [displayName, setDisplayName] = useState("Owner");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api.login({ username, password });
      onLogin({ token: data.access_token, role: data.role, userId: data.user_id });
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (code=${error.code})`);
      } else {
        setMessage("登录失败，请检查服务状态。");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitBootstrap = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await api.bootstrapOwner({
        username,
        password,
        display_name: displayName,
      });
      setMode("login");
      setMessage("Owner 初始化成功，请直接登录。");
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (code=${error.code})`);
      } else {
        setMessage("初始化失败，请稍后重试。");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await api.register({ username, password, display_name: displayName });
      setMode("login");
      setMessage("注册成功，请登录。");
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (code=${error.code})`);
      } else {
        setMessage("注册失败，请稍后重试。");
      }
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "家庭内网登录" : mode === "bootstrap" ? "首次 Owner 初始化" : "新用户注册";
  const desc =
    mode === "login"
      ? "登录后进入四中心工作区。"
      : mode === "bootstrap"
        ? "仅首次部署时使用，完成后请切回登录。"
        : "新用户注册成功后即可登录。";

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h2>{title}</h2>
        <p>{desc}</p>

        <form
          onSubmit={
            mode === "login" ? submitLogin : mode === "bootstrap" ? submitBootstrap : submitRegister
          }
        >
          <label>
            用户名
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            密码
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
            />
          </label>

          {mode !== "login" && (
            <label>
              显示名称
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
          )}

          {message && <div className="inline-message">{message}</div>}

          <button type="submit" disabled={loading}>
            {loading
              ? "处理中..."
              : mode === "login"
                ? "登录"
                : mode === "bootstrap"
                  ? "初始化"
                  : "注册"}
          </button>
        </form>

        <div className="actions">
          <button type="button" className="ghost" onClick={() => setMode("register")}>
            去注册
          </button>
          <button type="button" className="ghost" onClick={() => setMode("login")}>
            去登录
          </button>
          <button type="button" className="ghost" onClick={() => setMode("bootstrap")}>
            初始化 Owner
          </button>
        </div>
      </section>
    </div>
  );
}
