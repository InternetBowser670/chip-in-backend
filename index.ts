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
      ws.subscribe(ws.data.route);
      ws.subscribe("global-room");
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
      } catch (e) {
        console.error("Error handling WS message:", e);
      }
    },
    close(ws) {
      setTimeout(() => broadcastCounts(server, ws.data.route), 50);
    },
  },
});

console.log(`Listening on ${server.url}`);
