// artifact学会のアカウントでログインする。ゲーム側の /api を通して、本体に問い合わせる。
const TKEY = "craft-token";

export function getToken() { try { return localStorage.getItem(TKEY) || ""; } catch (e) { return ""; } }
function setToken(t) { try { if (t) localStorage.setItem(TKEY, t); else localStorage.removeItem(TKEY); } catch (e) { /* 保存できなくても動く */ } }

export async function api(payload) {
  try {
    const r = await fetch("/api", { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    return await r.json();
  } catch (e) {
    return { ok: false, error: "network" };
  }
}

// 保存してあるログインが、まだ有効か確かめる。有効ならユーザー情報、だめなら null
export async function restore() {
  const token = getToken();
  if (!token) return null;
  const j = await api({ action: "me", token });
  if (j && j.ok && j.user) return j.user;
  if (j && (j.error === "network" || j.error === "site_unavailable")) return undefined;   // つながらない(ログインは消さない)
  setToken("");
  return null;
}

export async function login(username, password) {
  const j = await api({ action: "login", username: String(username || "").trim(), password: String(password || "") });
  if (j && j.ok && j.token && j.user) { setToken(j.token); return { user: j.user }; }
  const msg = j && j.message ? j.message : j && j.error === "network" ? "通信できませんでした" : j && j.error === "site_unavailable" ? "artifact学会につながりません" : "チャンネルIDまたはパスワードが違います。";
  return { error: msg };
}

export async function logout() {
  const token = getToken();
  setToken("");
  if (token) await api({ action: "logout", token });
}
