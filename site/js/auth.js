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

// ----- Googleでログイン(artifact学会本体と同じ。Googleの部品を読み込んで、ボタンを出す) -----
let gState = null;   // { clientId, ready, handler }
export function loginGoogle(credential) {
  return api({ action: "loginGoogle", credential }).then((j) => {
    if (j && j.ok && j.token && j.user) { setToken(j.token); return { user: j.user }; }
    const msg = j && j.message ? j.message : j && j.error === "network" ? "通信できませんでした" : "Googleでのログインに失敗しました。もう一度試してください。";
    return { error: msg };
  });
}
// host にGoogleのボタンを出す。cred が届いたら onCred(cred)。使えないとき(未設定・読み込み失敗)は onFail(理由)
export async function googleButton(host, onCred, onFail) {
  try {
    if (!gState) {
      const j = await api({ action: "getGoogleConfig" });
      gState = { clientId: j && j.ok ? String(j.clientId || "") : "", ready: false, handler: null };
    }
    if (!gState.clientId) { onFail("off"); return; }
    gState.handler = onCred;
    if (!window.google || !window.google.accounts) {
      await new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
    }
    if (!gState.ready) {
      window.google.accounts.id.initialize({ client_id: gState.clientId, callback: (r) => { if (r && r.credential && gState.handler) gState.handler(r.credential); }, auto_select: false, cancel_on_tap_outside: true });
      gState.ready = true;
    }
    window.google.accounts.id.renderButton(host, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "ja", width: 260 });
  } catch (e) { onFail("load"); }
}
