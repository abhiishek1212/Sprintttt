// 🏆 Sprint Awards — room-based multiplayer voting game.
// Attaches to the existing Socket.io server under the "/awards" namespace.
// All votes live here; clients only ever see counts until the host reveals.
const crypto = require("crypto");

const AWARDS = [
  { e: "🐛", title: "BUG WHISPERER", blurb: "Somehow you found the bug that nobody else could see." },
  { e: "🚀", title: "DEPLOYMENT HERO", blurb: "When things needed to get across the finish line, you were there." },
  { e: "🕵️", title: "SHERLOCK OF THE SPRINT", blurb: "For investigating the weirdest issue and actually figuring out what was happening." },
  { e: "☕", title: "POWERED BY CAFFEINE", blurb: "For somehow surviving the sprint with coffee as a primary dependency." },
  { e: "🔥", title: "PRODUCTION FIREFIGHTER", blurb: "For jumping in whenever something decided to catch fire." },
  { e: "💡", title: "BIG BRAIN MOMENT", blurb: "For the solution that made everyone go, 'Why didn't we think of that?'" },
  { e: "😂", title: "COMEDY MVP", blurb: "For keeping the Teams chat alive and making work a little more entertaining." },
  { e: "🤖", title: "AI'S FAVORITE ENGINEER", blurb: "Most likely to ask ChatGPT before asking a coworker." },
];
const SUGGESTED = ["Mayra", "Abhishek", "Eduardo", "Justin", "Jason", "Jaime", "Luis", "Jenny", "Brian"];
const MIN_PLAYERS = 2;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const HOST_HANDOFF_MS = 20 * 1000;

const now = () => Date.now();
const rooms = new Map(); // code -> room

function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join(""); } while (rooms.has(c));
  return c;
}
function newRoom(hostId) {
  const room = { code: newCode(), hostId, players: {}, phase: "lobby", awardIndex: -1, votes: {}, results: [], phaseStartedAt: now(), createdAt: now(), hostLastSeen: now() };
  rooms.set(room.code, room);
  return room;
}
function publicState(room) {
  const host = room.players[room.hostId];
  return {
    code: room.code, hostId: room.hostId, hostConnected: !!host?.connected, hostLastSeen: room.hostLastSeen,
    phase: room.phase, awardIndex: room.awardIndex, awards: AWARDS, suggested: SUGGESTED, minPlayers: MIN_PLAYERS,
    players: Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt).map(p => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, connected: p.connected, voted: !!room.votes[p.id] })),
    voteCount: Object.keys(room.votes).length,
    results: room.results, // only revealed awards are ever pushed here
    phaseStartedAt: room.phaseStartedAt,
  };
}
function tally(room) {
  const ids = Object.keys(room.players);
  const counts = Object.fromEntries(ids.map(id => [id, 0]));
  for (const t of Object.values(room.votes)) if (counts[t] !== undefined) counts[t]++;
  const max = Math.max(0, ...Object.values(counts));
  const winners = max > 0 ? ids.filter(id => counts[id] === max) : [];
  return { awardIndex: room.awardIndex, counts, winners, max, voters: Object.keys(room.votes).length };
}
function setPhase(room, phase) { room.phase = phase; room.phaseStartedAt = now(); }

function attach(io) {
  const nsp = io.of("/awards");
  const broadcast = room => nsp.to(room.code).emit("state", publicState(room));
  const fail = (ack, error) => typeof ack === "function" && ack({ error });
  const ok = (ack, extra) => typeof ack === "function" && ack({ ok: true, ...extra });
  const cleanName = n => String(n || "").trim().replace(/\s+/g, " ").slice(0, 20);

  // sweep stale rooms
  setInterval(() => { for (const [code, r] of rooms) if (now() - r.createdAt > ROOM_TTL_MS) rooms.delete(code); }, 10 * 60 * 1000).unref();

  nsp.on("connection", socket => {
    const roomOf = () => rooms.get(socket.data.code);
    const me = () => roomOf()?.players[socket.data.pid];
    const bind = (room, pid) => { socket.data.code = room.code; socket.data.pid = pid; socket.join(room.code); };
    const ensurePid = pid => (typeof pid === "string" && pid.length >= 8 && pid.length <= 64) ? pid : crypto.randomBytes(12).toString("hex");

    socket.on("create", ({ pid, name } = {}, ack) => {
      pid = ensurePid(pid); name = cleanName(name); if (!name) return fail(ack, "Tell us your name first.");
      const room = newRoom(pid);
      room.players[pid] = { id: pid, name, joinedAt: now(), connected: true };
      bind(room, pid); ok(ack, { pid, code: room.code }); broadcast(room);
    });

    socket.on("join", ({ pid, name, code } = {}, ack) => {
      pid = ensurePid(pid); name = cleanName(name); code = String(code || "").trim().toUpperCase();
      const room = rooms.get(code); if (!room) return fail(ack, "No room with that code. Double-check it with your host.");
      if (!name) return fail(ack, "Tell us your name first.");
      const existing = room.players[pid];
      if (!existing) {
        if (room.phase !== "lobby") return fail(ack, "This game already started. Ask the host for a fresh room.");
        if (Object.values(room.players).some(p => p.name.toLowerCase() === name.toLowerCase())) return fail(ack, "Someone already took that name. Add a last initial?");
        room.players[pid] = { id: pid, name, joinedAt: now(), connected: true };
      } else { existing.connected = true; }
      bind(room, pid); ok(ack, { pid, code }); broadcast(room);
    });

    // reconnect into a room this browser was already part of
    socket.on("resume", ({ pid, code } = {}, ack) => {
      const room = rooms.get(String(code || "").toUpperCase()); const p = room?.players[pid];
      if (!room || !p) return fail(ack, "That room is gone.");
      p.connected = true; if (pid === room.hostId) room.hostLastSeen = now();
      bind(room, pid); ok(ack, { pid, code: room.code }); broadcast(room);
    });

    socket.on("vote", ({ target } = {}, ack) => {
      const room = roomOf(), p = me(); if (!room || !p) return fail(ack, "You're not in a room.");
      if (room.phase !== "voting") return fail(ack, "Voting isn't open right now.");
      if (room.votes[p.id]) return fail(ack, "Your vote is already locked in.");
      if (target === p.id) return fail(ack, "Nice try 😂 Pick a teammate.");
      if (!room.players[target]) return fail(ack, "That player isn't in the room.");
      room.votes[p.id] = target; ok(ack); broadcast(room);
    });

    socket.on("host", ({ action } = {}, ack) => {
      const room = roomOf(); if (!room) return fail(ack, "You're not in a room.");
      if (socket.data.pid !== room.hostId) return fail(ack, "Only the host can do that.");
      room.hostLastSeen = now();
      switch (action) {
        case "start":
          if (room.phase !== "lobby") break;
          if (Object.keys(room.players).length < MIN_PLAYERS) return fail(ack, `Need at least ${MIN_PLAYERS} players.`);
          room.awardIndex = 0; room.votes = {}; room.results = []; setPhase(room, "voting"); break;
        case "reveal":
          if (room.phase !== "voting") break;
          room.results = [...room.results.filter(r => r.awardIndex !== room.awardIndex), tally(room)];
          setPhase(room, "reveal"); break;
        case "next":
          if (room.phase !== "reveal") break;
          if (room.awardIndex >= AWARDS.length - 1) { setPhase(room, "final"); break; }
          room.awardIndex += 1; room.votes = {}; setPhase(room, "voting"); break;
        case "finish": setPhase(room, "final"); break;
        case "playAgain": room.awardIndex = -1; room.votes = {}; room.results = []; setPhase(room, "lobby"); break;
        case "kick": break;
        default: return fail(ack, "Unknown action.");
      }
      ok(ack); broadcast(room);
    });

    socket.on("kick", ({ target } = {}, ack) => {
      const room = roomOf(); if (!room || socket.data.pid !== room.hostId) return fail(ack, "Only the host can do that.");
      if (room.phase !== "lobby" || target === room.hostId) return fail(ack, "Can't remove that player right now.");
      delete room.players[target]; ok(ack); broadcast(room);
    });

    // any connected player may take over if the host has been gone a while
    socket.on("claimHost", (_, ack) => {
      const room = roomOf(), p = me(); if (!room || !p) return fail(ack, "You're not in a room.");
      const host = room.players[room.hostId];
      if (host?.connected || now() - room.hostLastSeen < HOST_HANDOFF_MS) return fail(ack, "The host is still around.");
      room.hostId = p.id; room.hostLastSeen = now(); ok(ack); broadcast(room);
    });

    socket.on("disconnect", () => {
      const room = roomOf(), p = me(); if (!room || !p) return;
      const stillHere = [...nsp.sockets.values()].some(s => s !== socket && s.data.pid === p.id && s.data.code === room.code);
      if (!stillHere) { p.connected = false; if (p.id === room.hostId) room.hostLastSeen = now(); broadcast(room); }
    });
  });
}

module.exports = { attach, AWARDS };
