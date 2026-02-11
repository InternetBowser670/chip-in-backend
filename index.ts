import info from "./static/info.html";

interface SocketData {
  route: string;
}

function broadcastCounts(server: any, route: string) {
  const counts: Record<string, number> = {
    globalCount: server.subscriberCount("global-room"),
    pageCount: server.subscriberCount(route),
  };

  counts.coinflipCount = server.subscriberCount("/play/coinflip");
  counts.minesCount = server.subscriberCount("/play/mines");
  counts.blackjackCount = server.subscriberCount("/play/blackjack");

  const payload = JSON.stringify(counts);

  server.publish(route, payload);
  server.publish("global-room", payload);
}

const server = Bun.serve<SocketData>({
  port: 6741,
  routes: { "/": info },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/live-user-count") {
      const route = url.searchParams.get("route") || "global";
      if (server.upgrade(req, { data: { route } })) return undefined;
    }
    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("global-room");
      ws.subscribe(ws.data.route);
      setTimeout(() => broadcastCounts(server, ws.data.route), 50);
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "CHANGE_ROUTE") {
          const oldRoute = ws.data.route;
          const newRoute = data.route;
          if (oldRoute !== newRoute) {
            ws.unsubscribe(oldRoute);
            ws.subscribe(newRoute);
            ws.data.route = newRoute;
            broadcastCounts(server, oldRoute);
            broadcastCounts(server, newRoute);
          }
        }
      } catch (e) {}
    },
    close(ws) {
      setTimeout(() => broadcastCounts(server, ws.data.route), 50);
    },
  },
});

console.log(`Listening on ${server.url}`);
