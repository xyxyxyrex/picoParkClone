"use strict";
/*
 * Room registry for the Tiny Park relay.
 *
 * The relay is deliberately dumb about gameplay: it owns room codes, membership
 * and addressing, and forwards opaque payloads between the host and each guest.
 * Every decision that needs game knowledge still lives in src/host.js.
 *
 * The envelope is addressed rather than broadcast ({t:'to', peer}), so a later
 * revision can stop forwarding and start simulating without the clients or the
 * wire format changing.
 */

// No I/O/0/1: room codes get read aloud across a room full of people.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const LIMITS = {
  maxRooms: 200,
  maxGuestsPerRoom: 32,
  maxMessageBytes: 512 * 1024,
  codeLength: 4,
};

function randomCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < LIMITS.codeLength; i++)
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

class Room {
  constructor(code, host) {
    this.code = code;
    this.host = host;
    this.guests = new Map();
    this.nextGuestId = 1;
    this.createdAt = Date.now();
  }
  addGuest(socket) {
    if (this.guests.size >= LIMITS.maxGuestsPerRoom) return null;
    const id = `g${this.nextGuestId++}`;
    this.guests.set(id, socket);
    return id;
  }
  removeGuest(id) {
    return this.guests.delete(id);
  }
  get size() {
    return this.guests.size;
  }
}

class RoomRegistry {
  constructor(options = {}) {
    this.rooms = new Map();
    this.random = options.random || Math.random;
    this.limits = { ...LIMITS, ...(options.limits || {}) };
  }
  /* Returns null when the server is at capacity or no free code was found. */
  create(host) {
    if (this.rooms.size >= this.limits.maxRooms) return null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode(this.random);
      if (this.rooms.has(code)) continue;
      const room = new Room(code, host);
      this.rooms.set(code, room);
      return room;
    }
    return null;
  }
  get(code) {
    return this.rooms.get(String(code || "").toUpperCase()) || null;
  }
  destroy(code) {
    const room = this.get(code);
    if (!room) return null;
    this.rooms.delete(room.code);
    return room;
  }
  get count() {
    return this.rooms.size;
  }
}

module.exports = { Room, RoomRegistry, randomCode, CODE_ALPHABET, LIMITS };
