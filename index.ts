import info from "./static/info.html";

interface SocketData {
  path: "/live-user-count" | "/live-chat";
  route: string;
  userId?: string;
  username?: string;
}

function broadcastCounts(server: any, route: string) {
  const payload = JSON.stringify({
    type: "COUNT_UPDATE",
    globalCount: server.subscriberCount("global-room"),
    pageCount: server.subscriberCount(route),
    coinflipCount: server.subscriberCount("/play/coinflip"),
    minesCount: server.subscriberCount("/play/mines"),
    blackjackCount: server.subscriberCount("/play/blackjack"),
    chatCount: server.subscriberCount("chat-room"),
  });

  server.publish(route, payload);
  server.publish("global-room", payload);
}

const server = Bun.serve<SocketData>({
  port: 6741,
  routes: { "/": info },
  fetch(req, server) {
    const url = new URL(req.url);
    const route = url.searchParams.get("route") || "global";

    if (url.pathname === "/live-user-count" || url.pathname === "/live-chat") {
      const upgraded = server.upgrade(req, {
        data: {
          path: url.pathname as "/live-user-count" | "/live-chat",
          route,
        },
      });
      return upgraded
        ? undefined
        : new Response("Upgrade failed", { status: 400 });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    idleTimeout: 60,
    open(ws) {
      if (ws.data.path === "/live-user-count") {
        ws.subscribe("global-room");
        ws.subscribe(ws.data.route);
        setTimeout(() => broadcastCounts(server, ws.data.route), 50);
      } else if (ws.data.path === "/live-chat") {
        ws.subscribe("chat-room");
        setTimeout(() => broadcastCounts(server, "global"), 50);
      }
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG", timestamp: data.timestamp }));
          return;
        }

        if (
          ws.data.path === "/live-user-count" &&
          data.type === "CHANGE_ROUTE"
        ) {
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

        if (ws.data.path === "/live-chat") {
          if (data.type === "JOIN_CHAT") {
            ws.data.userId = data.userId;
            ws.data.username = data.username;
            ws.subscribe("chat-room");
            setTimeout(() => broadcastCounts(server, "global"), 50);
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                isSystem: true,
                displayType: "systemDefault",
                text: `${data.username} joined the chat`,
                timestamp: Date.now(),
              }),
            );
            broadcastCounts(server, ws.data.route);
          } else if (data.type === "CHAT_MESSAGE") {
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                displayType: "chatMessage",
                userId: ws.data.userId,
                username: ws.data.username,
                text: data.text,
                timestamp: Date.now(),
              }),
            );
          } else if (data.type === "LEAVE_CHAT") {
            ws.unsubscribe("chat-room");
            setTimeout(() => broadcastCounts(server, "global"), 50);
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                isSystem: true,
                displayType: "systemDefault",
                text: `${ws.data.username} left the chat`,
                timestamp: Date.now(),
              }),
            );
            ws.data.userId = undefined;
          }
        }
      } catch (e) {}
    },
    close(ws) {
      if (ws.data.path === "/live-chat") {
        if (ws.data.userId) {
          server.publish(
            "chat-room",
            JSON.stringify({
              type: "CHAT_MESSAGE",
              isSystem: true,
              displayType: "systemDefault",
              text: `${ws.data.username} left the chat`,
              timestamp: Date.now(),
            }),
          );
        }
        setTimeout(() => broadcastCounts(server, "global"), 50);
      } else if (ws.data.path === "/live-user-count") {
        setTimeout(() => broadcastCounts(server, ws.data.route), 50);
      }
    },
  },
});

console.log(`Listening on ${server.url}`);
