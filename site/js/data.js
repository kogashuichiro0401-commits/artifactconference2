// artifact学会の投稿一覧・掲示板を読み込んで、メーターの画面に出す。
import { api, getToken } from "./auth.js";

export function startData(gauges) {
  let timer = 0, busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    const token = getToken();
    const [a, b] = await Promise.all([api({ action: "list", token }), api({ action: "listTweets", token })]);
    busy = false;
    if (a && a.ok && Array.isArray(a.posts)) gauges.setPosts(a.posts.slice(0, 40).map((p) => ({ title: p.title, author: p.author, cat: p.cat })));
    else gauges.setMessage("読み込めませんでした");
    if (b && b.ok && Array.isArray(b.tweets)) {
      const us = b.users || {};
      gauges.setTweets(b.tweets.slice(0, 30).map((t) => {
        const u = us[t.uid] || {};
        return { name: u.name || u.displayName || u.handle || "だれか", text: t.text };
      }));
    }
  }
  return {
    start() { load(); clearInterval(timer); timer = setInterval(load, 60000); },
    stop() { clearInterval(timer); },
    reload: load,
  };
}
