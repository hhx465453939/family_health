import { FormEvent, useEffect, useState } from "react";

import { api, ApiError } from "../api/client";
import type { UserSession } from "../api/types";

type AuthMode = "login" | "bootstrap" | "register";
type Locale = "zh" | "en";

const TEXT = {
  zh: {
    loginFailed: "登录失败，请检查服务状态。",
    bootstrapDone: "Owner 初始化成功，请直接登录。",
    bootstrapFailed: "初始化失败，请稍后重试。",
    registerDone: "注册成功，请登录。",
    registerFailed: "注册失败，请稍后重试。",
    titleLogin: "家庭内网登录",
    titleBootstrap: "首次 Owner 初始化",
    titleRegister: "新用户注册",
    descLogin: "登录后进入四中心工作区。",
    descBootstrap: "仅首次部署时使用，完成后请切回登录。",
    descRegister: "新用户注册成功后即可登录。",
    noDefaultOwner: "系统没有默认 Owner 密码，首次初始化时由你自行设置。",
    username: "用户名",
    password: "密码",
    displayName: "显示名称",
    processing: "处理中...",
    login: "登录",
    register: "注册",
    bootstrap: "初始化",
    goRegister: "去注册",
    goLogin: "去登录",
    initOwner: "初始化 Owner",
  },
  en: {
    loginFailed: "Sign-in failed. Please check service status.",
    bootstrapDone: "Owner initialized. Please sign in.",
    bootstrapFailed: "Initialization failed. Try again later.",
    registerDone: "Registered. Please sign in.",
    registerFailed: "Registration failed. Try again later.",
    titleLogin: "Family Intranet Sign-In",
    titleBootstrap: "First-Time Owner Setup",
    titleRegister: "New User Sign-Up",
    descLogin: "Sign in to enter the workspace.",
    descBootstrap: "Use only once during first deployment.",
    descRegister: "Sign in after successful registration.",
    noDefaultOwner: "There is no default Owner password. Set it during first setup.",
    username: "Username",
    password: "Password",
    displayName: "Display Name",
    processing: "Processing...",
    login: "Sign in",
    register: "Sign up",
    bootstrap: "Initialize",
    goRegister: "Sign up",
    goLogin: "Sign in",
    initOwner: "Init Owner",
  },
} as const;

export function AuthPage({
  onLogin,
  initialMessage = "",
  locale,
  onLocaleChange,
}: {
  onLogin: (session: UserSession) => void;
  initialMessage?: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const text = TEXT[locale];

  useEffect(() => {
    if (!initialMessage) {
      return;
    }
    setMessage(initialMessage);
  }, [initialMessage]);

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
        setMessage(text.loginFailed);
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
      await api.bootstrapOwner({ username, password, display_name: displayName });
      setMode("login");
      setMessage(text.bootstrapDone);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (code=${error.code})`);
      } else {
        setMessage(text.bootstrapFailed);
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
      setMessage(text.registerDone);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(`${error.message} (code=${error.code})`);
      } else {
        setMessage(text.registerFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? text.titleLogin : mode === "bootstrap" ? text.titleBootstrap : text.titleRegister;
  const desc = mode === "login" ? text.descLogin : mode === "bootstrap" ? text.descBootstrap : text.descRegister;

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="row-between">
          <h2>{title}</h2>
          <div className="segmented">
            <button type="button" className={locale === "zh" ? "" : "ghost"} onClick={() => onLocaleChange("zh")}>
              中文
            </button>
            <button type="button" className={locale === "en" ? "" : "ghost"} onClick={() => onLocaleChange("en")}>
              EN
            </button>
          </div>
        </div>
        <p>{desc}</p>
        <p className="muted">{text.noDefaultOwner}</p>

        <form onSubmit={mode === "login" ? submitLogin : mode === "bootstrap" ? submitBootstrap : submitRegister}>
          <label>
            {text.username}
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            {text.password}
            <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" />
          </label>

          {mode !== "login" && (
            <label>
              {text.displayName}
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
          )}

          {message && <div className="inline-message">{message}</div>}

          <button type="submit" disabled={loading}>
            {loading ? text.processing : mode === "login" ? text.login : mode === "bootstrap" ? text.bootstrap : text.register}
          </button>
        </form>

        <div className="actions">
          <button type="button" className="ghost" onClick={() => setMode("register")}>
            {text.goRegister}
          </button>
          <button type="button" className="ghost" onClick={() => setMode("login")}>
            {text.goLogin}
          </button>
          <button type="button" className="ghost" onClick={() => setMode("bootstrap")}>
            {text.initOwner}
          </button>
        </div>
      </section>
    </div>
  );
}
