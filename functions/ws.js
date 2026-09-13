const ROOM_PATTERN = /^[A-Z2-9]{4}$/;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const room = (url.searchParams.get("room") || "").toUpperCase();
  if (!ROOM_PATTERN.test(room))
    return Response.json({ error: "Invalid room code." }, { status: 400 });
  if (context.request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
    return new Response("Expected WebSocket upgrade", { status: 426 });
  return context.env.ROOMS.getByName(`room:${room}`).fetch(context.request);
}
