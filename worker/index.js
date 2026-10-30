// 入口。/ws は「部屋」につなぎ、それ以外のファイルは site/ から自動で配られる。
import { VERSION } from "../site/js/version.js";

export { Room } from "./room.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      // 今は部屋が1つだけ("main")。人数が増えたら、ここで振り分ける。
      const id = env.ROOM.idFromName("main");
      return env.ROOM.get(id).fetch(request);
    }
    if (url.pathname === "/api/version") return Response.json({ version: VERSION });
    return new Response("Not found", { status: 404 });
  },
};
