import { NextRequest, NextResponse } from "next/server";
import { defaultRoomState, LessonRoomState, RoomParticipant } from "../../../livelab/types";

export const dynamic = "force-dynamic";

interface ServerRoom {
  state: LessonRoomState;
  participants: Map<string, RoomParticipant>;
}

const roomStore = globalThis as typeof globalThis & { __airboardRooms?: Map<string, ServerRoom> };
const rooms = roomStore.__airboardRooms ?? new Map<string, ServerRoom>();
roomStore.__airboardRooms = rooms;

function getRoom(id: string) {
  let room = rooms.get(id);
  if (!room) {
    room = { state: { ...defaultRoomState, inkSnapshots: {}, highlights: [], updatedAt: Date.now() }, participants: new Map() };
    rooms.set(id, room);
  }
  return room;
}

function activeParticipants(room: ServerRoom) {
  const cutoff = Date.now() - 7_500;
  for (const [id, participant] of room.participants) if (participant.lastSeen < cutoff) room.participants.delete(id);
  return Array.from(room.participants.values());
}

export async function GET(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const room = getRoom(roomId);
  const clientId = request.nextUrl.searchParams.get("clientId");
  const role = request.nextUrl.searchParams.get("role") === "student" ? "student" : "teacher";
  if (clientId) room.participants.set(clientId, { id: clientId, role, lastSeen: Date.now() });
  return NextResponse.json({ state: room.state, participants: activeParticipants(room) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const room = getRoom(roomId);
  const body = await request.json();
  const clientId = String(body.clientId ?? "anonymous");
  const role: "teacher" | "student" = body.role === "student" ? "student" : "teacher";
  room.participants.set(clientId, { id: clientId, role, lastSeen: Date.now() });
  const incoming = body.state as LessonRoomState | undefined;
  if (incoming && incoming.version >= room.state.version) room.state = { ...room.state, ...incoming, updatedAt: Date.now() };
  return NextResponse.json({ state: room.state, participants: activeParticipants(room) });
}
