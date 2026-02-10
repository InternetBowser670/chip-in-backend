import info from "./static/info.html";

interface SocketData {
  route: string;
}

function broadcastCounts(server: any, route: string) {
  const globalCount = server.subscriberCount("global-room");
  const pageCount = server.subscriberCount(route);

  server.publish(
    route,
    JSON.stringify({
      pageCount: pageCount,
      globalCount: globalCount,
    }),
  );

  server.publish(
    "global-room",
    JSON.stringify({
      globalCount: globalCount,
    }),
  );
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
    idleTimeout: 30,

    open(ws) {
      const { route } = ws.data;
      ws.subscribe(route);
      ws.subscribe("global-room");

      broadcastCounts(server, route);
    },
    close(ws) {
      const { route } = ws.data;

      ws.unsubscribe(route);
      ws.unsubscribe("global-room");

      broadcastCounts(server, route);

      // delay is necessary to make sure that the user is counted as "left"
      setTimeout(() => broadcastCounts(server, ws.data.route), 50);
    },
    message() {},
  },
});

console.log(`Listening on ${server.url}`);
