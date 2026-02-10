import info from "./static/info.html";

interface SocketData {
  route: string;
}

const server = Bun.serve<SocketData>({
  port: 6741,
  routes: {
    "/": info,
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/live-user-count") {
      const route = url.searchParams.get("route") || "global";
      const upgraded = server.upgrade(req, { data: { route } });
      if (upgraded) return undefined;
    }
    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const { route } = ws.data;
      ws.subscribe(route);
      server.publish(
        route,
        JSON.stringify({
          count: server.subscriberCount(route),
        }),
      );
    },
    close(ws) {
      const { route } = ws.data;
      ws.unsubscribe(route);

      server.publish(
        route,
        JSON.stringify({
          count: server.subscriberCount(route),
        }),
      );
    },
    message() {},
  },
});

console.log(`Listening on ${server.url}`);
