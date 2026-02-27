import info from "./static/info.html";
import { createClerkClient, verifyToken } from "@clerk/backend";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

interface SocketData {
  path: "/live-user-count" | "/live-chat";
  route: string;
  userId?: string;
  username?: string;
  imageUrl?: string;
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
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/live-user-count" || url.pathname === "/live-chat") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Unauthorized", { status: 401 });
      }

      try {
        const verified = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        const userId = verified.sub ?? undefined;

        const upgraded = server.upgrade(req, {
          data: {
            path: url.pathname as any,
            route: url.searchParams.get("route") || "global",
            userId: userId,
          },
        });
        return upgraded
          ? undefined
          : new Response("Upgrade failed", { status: 400 });
      } catch (err) {
        console.error("Auth failed:", err);
        return new Response("Invalid Token", { status: 401 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    idleTimeout: 60,
    async open(ws) {
      if (ws.data.path === "/live-chat" && ws.data.userId) {
        ws.subscribe("chat-room");
        try {
          const user = await clerkClient.users.getUser(ws.data.userId);
          ws.data.username = user.username || user.firstName || "Anonymous";
          ws.data.imageUrl = user.imageUrl;
        } catch (e) {
          console.error("Failed to fetch user data:", e);
        }

        setTimeout(() => broadcastCounts(server, "global"), 50);
      } else if (ws.data.path === "/live-user-count") {
        ws.subscribe("global-room");
        ws.subscribe(ws.data.route);
        setTimeout(() => broadcastCounts(server, ws.data.route), 50);
      }
    },

    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG", timestamp: data.timestamp }));
          return;
        }

        if (ws.data.path === "/live-user-count" && data.type === "CHANGE_ROUTE") {
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
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                isSystem: true,
                displayType: "systemDefault",
                text: `${ws.data.username} joined the chat`,
                imageUrl: ws.data.imageUrl,
                timestamp: Date.now(),
              }),
            );
            setTimeout(() => broadcastCounts(server, "global"), 50);
          } else if (data.type === "CHAT_MESSAGE") {
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                displayType: "chatMessage",
                userId: ws.data.userId,
                username: ws.data.username,
                imageUrl: ws.data.imageUrl,
                text: data.text,
                timestamp: Date.now(),
              }),
            );
          } else if (data.type === "LEAVE_CHAT") {
            server.publish(
              "chat-room",
              JSON.stringify({
                type: "CHAT_MESSAGE",
                isSystem: true,
                displayType: "systemDefault",
                text: `${ws.data.username} left the chat`,
                imageUrl: ws.data.imageUrl,
                timestamp: Date.now(),
              }),
            );
            ws.data.userId = undefined;
            setTimeout(() => broadcastCounts(server, "global"), 50);
          }
        }
      } catch (e) {}
    },
    close(ws) {
      if (ws.data.path === "/live-chat") {
        if (ws.data.userId && ws.data.username) {
          server.publish(
            "chat-room",
            JSON.stringify({
              type: "CHAT_MESSAGE",
              isSystem: true,
              displayType: "systemDefault",
              text: `${ws.data.username} left the chat`,
              imageUrl: ws.data.imageUrl,
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
