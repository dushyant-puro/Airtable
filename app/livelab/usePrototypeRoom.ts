"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultRoomState, LessonRoomState, RoomParticipant } from "./types";

const makeId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export function usePrototypeRoom() {
  const [clientId] = useState(makeId);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [roomId, setRoomIdState] = useState(() => {
    if (typeof window === "undefined") return "AIR-101";
    return new URLSearchParams(window.location.search).get("room")?.toUpperCase() || window.localStorage.getItem("airboard-room") || "AIR-101";
  });
  const [role, setRole] = useState<"teacher" | "student">(() => {
    if (typeof window === "undefined") return "teacher";
    const requested = new URLSearchParams(window.location.search).get("role");
    if (requested === "teacher" || requested === "student") return requested;
    return window.localStorage.getItem("airboard-role") === "student" ? "student" : "teacher";
  });
  const [state, setState] = useState<LessonRoomState>(defaultRoomState);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [connected, setConnected] = useState(false);

  const setRoomId = useCallback((next: string) => {
    const clean = next.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 18) || "AIR-101";
    setRoomIdState(clean);
    window.localStorage.setItem("airboard-room", clean);
  }, []);

  useEffect(() => { window.localStorage.setItem("airboard-role", role); }, [role]);

  const acceptSnapshot = useCallback((incoming: LessonRoomState) => {
    setState((current) => incoming.version > current.version ? {...defaultRoomState,...incoming} : current);
  }, []);

  useEffect(() => {
    channelRef.current?.close();
    const channel = new BroadcastChannel(`airboard-room-${roomId}`);
    channel.onmessage = (event) => {
      if (event.data?.clientId === clientId || !event.data?.state) return;
      acceptSnapshot(event.data.state as LessonRoomState);
    };
    channelRef.current = channel;
    return () => channel.close();
  }, [acceptSnapshot, clientId, roomId]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}?clientId=${clientId}&role=${role}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        if (payload.state) acceptSnapshot(payload.state);
        setParticipants(payload.participants ?? []);
        setConnected(true);
      } catch { if (!cancelled) setConnected(false); }
    };
    void sync();
    const timer = window.setInterval(sync, 1_800);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [acceptSnapshot, clientId, role, roomId]);

  const canEdit = role === "teacher" || state.studentControl;

  const update = useCallback((patch: Partial<LessonRoomState>, force = false) => {
    if (!force && role === "student" && !state.studentControl) return;
    setState((current) => {
      const next: LessonRoomState = { ...current, ...patch, version: current.version + 1, updatedAt: Date.now() };
      channelRef.current?.postMessage({ clientId, state: next });
      void fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, role, state: next }),
      }).then((response) => response.ok ? response.json() : null).then((payload) => {
        if (payload?.state) acceptSnapshot(payload.state);
      }).catch(() => setConnected(false));
      return next;
    });
  }, [acceptSnapshot, clientId, role, roomId, state.studentControl]);

  return {
    clientId,
    roomId,
    setRoomId,
    role,
    setRole,
    state,
    participants,
    connected,
    canEdit,
    update,
  };
}

export type PrototypeRoom = ReturnType<typeof usePrototypeRoom>;
