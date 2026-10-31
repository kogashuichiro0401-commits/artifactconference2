// artifact学会の本体(Service Binding "SITE")への問い合わせ。
export async function callSite(env, payload) {
  if (!env.SITE) return null;
  try {
    const r = await env.SITE.fetch("https://site.internal/api", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    return null;
  }
}

// ログインの確認。正しければ { uid, name }、だめなら null。
// (動作確認用: DEV_FAKE_AUTH=1 のときだけ、"dev:名前" を通す。本番の設定には入れない)
export async function verifyToken(env, token) {
  if (typeof token !== "string" || token.length < 4 || token.length > 300) return null;
  if (env.DEV_FAKE_AUTH === "1" && token.startsWith("dev:")) { const nm = token.slice(4) || "dev"; return { uid: token, name: nm, admin: nm.startsWith("admin") }; }
  const j = await callSite(env, { action: "me", token });
  if (j && j.ok && j.user && j.user.uid) return { uid: String(j.user.uid), name: String(j.user.displayName || j.user.username || ""), admin: j.user.role === "admin" };
  return null;
}
