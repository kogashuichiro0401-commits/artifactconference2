// 入り口。/ws は部屋(Room)へ、/api は artifact学会の本体へ(許可した操作だけ)取り次ぐ。
import { VERSION } from "../site/js/version.js";
import { callSite } from "./site.js";
export { Room } from "./room.js";

// ゲームから使ってよい、artifact学会の操作。ここにないものは通さない(書き込み系は通さない)
const ALLOW = new Set(["login", "logout", "me", "list", "listTweets"]);

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function api(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const text = await request.text();
  if (text.length > 2000) return json({ ok: false, error: "too_large" }, 413);
  let p;
  try { p = JSON.parse(text); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }
  if (!p || typeof p.action !== "string" || !ALLOW.has(p.action)) return json({ ok: false, error: "not_allowed" }, 403);
  const clean = { action: p.action };
  for (const k of ["username", "password", "token"]) if (typeof p[k] === "string") clean[k] = p[k].slice(0, 300);
  const j = await callSite(env, clean);
  if (!j) return json({ ok: false, error: "site_unavailable" }, 503);
  return json(j);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return env.ROOM.get(env.ROOM.idFromName("main")).fetch(request);
    if (url.pathname === "/api/version") return json({ version: VERSION });
    if (url.pathname === "/api") return api(request, env);
    return new Response("見つかりません", { status: 404 });
  },
};
