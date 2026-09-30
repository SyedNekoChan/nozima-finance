import { SIGNALING_BROKERS, ICE_SERVERS } from './constants.js';

/*
 * ================================================================
 * SIGNALING: MQTT-over-WebSocket relay (public brokers, redundant)
 * ================================================================
 *
 * Brokers only ever see an opaque topic (derived from a secret) and
 * AES-GCM ciphertext. Every broker is used simultaneously; messages
 * are de-duplicated by id, so any single reachable broker is enough.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function concat(...arrays) {
  let total = 0;
  arrays.forEach((a) => {
    total += a.length;
  });
  const out = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((a) => {
    out.set(a, offset);
    offset += a.length;
  });
  return out;
}

function remainingLength(n) {
  const out = [];
  let value = n;
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 128;
    out.push(digit);
  } while (value > 0);
  return Uint8Array.from(out);
}

function mqttString(s) {
  const b = enc.encode(s);
  return concat(Uint8Array.of(b.length >> 8, b.length & 255), b);
}

const mqttPacket = (byte0, body) =>
  concat(Uint8Array.of(byte0), remainingLength(body.length), body);

const CONNECT_TIMEOUT_MS = 8000;
const KEEPALIVE_S = 60;
const PING_EVERY_MS = 25000;

class Broker {
  constructor(url, topic, onPayload, onState) {
    this.url = url;
    this.topic = topic;
    this.onPayload = onPayload;
    this.onState = onState;
    this.state = 'connecting';
    this.failures = 0;
    this.ws = null;
    this.buf = new Uint8Array(0);
    this.stopped = false;
    this.timers = [];
  }

  start() {
    this.stopped = false;
    this.open();
  }

  clearTimers() {
    this.timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    this.timers = [];
  }

  open() {
    if (this.stopped) return;

    this.state = 'connecting';
    this.buf = new Uint8Array(0);

    let ws;

    try {
      ws = new WebSocket(this.url, 'mqtt');
    } catch {
      this.ws = null;
      this.failed();
      return;
    }

    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    this.timers.push(
      setTimeout(() => {
        if (this.ws === ws && this.state !== 'ready') {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          this.closed(ws);
        }
      }, CONNECT_TIMEOUT_MS)
    );

    ws.onopen = () => {
      if (this.ws !== ws) return;

      ws.send(
        mqttPacket(
          0x10,
          concat(
            mqttString('MQTT'),
            Uint8Array.of(4, 2, KEEPALIVE_S >> 8, KEEPALIVE_S & 255),
            mqttString(`nz-${hex(rand(8))}`)
          )
        )
      );
    };

    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.data(new Uint8Array(e.data));
    };

    ws.onerror = () => {};
    ws.onclose = () => this.closed(ws);
  }

  data(chunk) {
    this.buf = concat(this.buf, chunk);

    for (;;) {
      if (this.buf.length < 2) return;

      let i = 1;
      let len = 0;
      let mult = 1;
      let b;

      do {
        if (i >= this.buf.length) return;
        b = this.buf[i];
        i += 1;
        len += (b & 127) * mult;
        mult *= 128;
      } while (b & 128);

      if (this.buf.length < i + len) return;

      const type = this.buf[0] >> 4;
      const flags = this.buf[0] & 15;
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);

      this.packet(type, flags, body);
    }
  }

  packet(type, flags, body) {
    const ws = this.ws;

    if (type === 2) {
      // CONNACK
      if (body[1] !== 0) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }

      ws.send(
        mqttPacket(0x82, concat(Uint8Array.of(0, 1), mqttString(this.topic), Uint8Array.of(0)))
      );
    } else if (type === 9) {
      // SUBACK
      if (body[2] === 0x80) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }

      this.state = 'ready';
      this.failures = 0;
      this.timers.push(
        setInterval(() => {
          if (this.ws === ws && ws.readyState === 1) ws.send(Uint8Array.of(0xc0, 0));
        }, PING_EVERY_MS)
      );
      this.onState(this);
    } else if (type === 3) {
      // PUBLISH
      const qos = (flags >> 1) & 3;
      const topicLength = (body[0] << 8) | body[1];
      const offset = 2 + topicLength + (qos ? 2 : 0);
      this.onPayload(body.slice(offset));
    }
  }

  closed(ws) {
    if (this.ws !== ws) return;

    this.ws = null;
    this.failed();
  }

  failed() {
    this.clearTimers();
    this.failures += 1;
    this.state = 'failed';
    this.onState(this);

    if (this.stopped) return;

    const delay = Math.min(500 * 2 ** (this.failures - 1), 8000);
    this.timers.push(setTimeout(() => this.open(), delay));
  }

  publish(payload) {
    const ws = this.ws;

    if (this.state !== 'ready' || !ws || ws.readyState !== 1) return false;

    ws.send(mqttPacket(0x30, concat(mqttString(this.topic), payload)));
    return true;
  }

  stop() {
    this.stopped = true;
    this.clearTimers();

    const ws = this.ws;
    this.ws = null;

    if (ws) {
      try {
        if (ws.readyState === 1) ws.send(Uint8Array.of(0xe0, 0));
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/*
 * ================================================================
 * WEBRTC PEER MESH (data channels, chunked binary framing)
 * ================================================================
 */

const CHUNK = 15000;
const LINK_TIMEOUT_MS = 25000;
const ANNOUNCE_MS = 4000;

export const MSG_SV = 0;
export const MSG_UPDATE = 1;
export const MSG_CTL = 2;

class Link {
  constructor(mesh, peerId, initiator) {
    this.mesh = mesh;
    this.peerId = peerId;
    this.initiator = initiator;
    this.lid = initiator ? hex(rand(4)) : null;
    this.pending = [];
    this.open = false;
    this.closed = false;
    this.created = Date.now();
    this.queue = Promise.resolve();
    this.nextId = 0;
    this.rx = new Map();
    this.dc = null;

    const pc = new RTCPeerConnection({ iceServers: mesh.iceServers });
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ ice: e.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        mesh.linkDown(this, true);
      } else if (pc.connectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') mesh.linkDown(this, true);
        }, 8000);
      }
    };

    if (initiator) {
      this.bind(pc.createDataChannel('sync'));

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() =>
          this.signal({
            sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
          })
        )
        .catch(() => mesh.linkDown(this, true));
    } else {
      pc.ondatachannel = (e) => this.bind(e.channel);
    }
  }

  signal(d) {
    this.mesh.publish({ k: 'sig', t: this.peerId, d: { ...d, l: this.lid } });
  }

  async handle(d) {
    const pc = this.pc;

    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp);

      const queued = this.pending.splice(0);
      for (const c of queued) {
        await pc.addIceCandidate(c).catch(() => {});
      }

      if (d.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signal({ sdp: { type: answer.type, sdp: answer.sdp } });
      }
    } else if (d.ice) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(d.ice).catch(() => {});
      } else {
        this.pending.push(d.ice);
      }
    }
  }

  bind(dc) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 256 * 1024;

    dc.onopen = () => {
      this.open = true;
      this.mesh.linkUp(this);
    };

    dc.onclose = () => this.mesh.linkDown(this, false);

    dc.onmessage = (e) => this.receive(new Uint8Array(e.data));
  }

  receive(frame) {
    if (frame.length < 9) return;

    const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const type = frame[0];
    const id = dv.getUint32(1);
    const index = dv.getUint16(5);
    const count = dv.getUint16(7);
    const part = frame.slice(9);

    if (count === 1) {
      this.mesh.onMessage(this.peerId, type, part);
      return;
    }

    let entry = this.rx.get(id);

    if (!entry) {
      entry = { parts: new Array(count), got: 0 };
      this.rx.set(id, entry);
    }

    if (!entry.parts[index]) {
      entry.parts[index] = part;
      entry.got += 1;
    }

    if (entry.got === count) {
      this.rx.delete(id);
      this.mesh.onMessage(this.peerId, type, concat(...entry.parts));
    }
  }

  send(type, bytes) {
    const id = this.nextId >>> 0;
    this.nextId += 1;
    const count = Math.max(1, Math.ceil(bytes.length / CHUNK));

    this.queue = this.queue
      .then(async () => {
        for (let i = 0; i < count; i += 1) {
          if (!this.open || this.closed) return;

          const part = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
          const frame = new Uint8Array(9 + part.length);
          const dv = new DataView(frame.buffer);

          frame[0] = type;
          dv.setUint32(1, id);
          dv.setUint16(5, i);
          dv.setUint16(7, count);
          frame.set(part, 9);

          while (this.dc.bufferedAmount > 1048576 && !this.closed) {
            await new Promise((resolve) => {
              const done = () => {
                this.dc.removeEventListener('bufferedamountlow', done);
                this.dc.removeEventListener('close', done);
                resolve();
              };
              this.dc.addEventListener('bufferedamountlow', done);
              this.dc.addEventListener('close', done);
            });
          }

          if (this.dc.readyState !== 'open') return;
          this.dc.send(frame);
        }
      })
      .catch(() => {});

    return this.queue;
  }

  close() {
    this.closed = true;
    this.open = false;

    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }

    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}

export class PeerMesh {
  /*
   * options: { roomId, password, onPeerOpen(id), onPeerClose(id),
   *            onMessage(id, type, bytes), onChange(),
   *            brokers?, iceServers? }
   */
  constructor(options) {
    this.o = options;
    this.id = hex(rand(8));
    this.links = new Map();
    this.seen = [];
    this.brokers = [];
    this.stopped = false;
    this.linkFailed = false;
    this.iceServers = options.iceServers || ICE_SERVERS;
    this.tick = 0;
  }

  get openPeers() {
    return Array.from(this.links.values())
      .filter((l) => l.open && !l.closed)
      .map((l) => l.peerId);
  }

  /*
   * 'ready'       at least one broker is subscribed
   * 'unavailable' every broker's connection attempt has failed (verified)
   * 'connecting'  otherwise
   */
  get signaling() {
    if (this.brokers.some((b) => b.state === 'ready')) return 'ready';
    if (this.brokers.length && this.brokers.every((b) => b.failures >= 1)) {
      return 'unavailable';
    }
    return 'connecting';
  }

  async start() {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      enc.encode(`nozima-signal-v2:${this.o.password}`)
    );

    this.key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);

    if (this.stopped) return;

    const topic = `nozima-finance/v2/${this.o.roomId}`;
    const urls = this.o.brokers || SIGNALING_BROKERS;

    this.brokers = urls.map(
      (url) =>
        new Broker(
          url,
          topic,
          (payload) => this.onPayload(payload),
          (broker) => {
            if (this.stopped) return;
            if (broker.state === 'ready') this.announce();
            this.o.onChange?.();
          }
        )
    );

    this.brokers.forEach((b) => b.start());

    this.timer = setInterval(() => this.heartbeat(), ANNOUNCE_MS);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.brokers.forEach((b) => b.stop());
    Array.from(this.links.values()).forEach((l) => l.close());
    this.links.clear();
  }

  heartbeat() {
    if (this.stopped) return;

    this.tick += 1;

    const now = Date.now();

    Array.from(this.links.values()).forEach((l) => {
      if (!l.open && now - l.created > LINK_TIMEOUT_MS) this.linkDown(l, true);
    });

    // Fast discovery while alone; slow keep-alive discovery otherwise.
    if (this.openPeers.length === 0 || this.tick % 5 === 0) this.announce();

    this.o.onChange?.();
  }

  announce() {
    this.publish({ k: 'hello' });
  }

  async publish(message) {
    if (this.stopped || !this.key) return;

    const iv = rand(12);
    const plain = enc.encode(
      JSON.stringify({ ...message, f: this.id, m: hex(rand(8)) })
    );
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, plain)
    );
    const payload = concat(iv, cipher);

    this.brokers.forEach((b) => b.publish(payload));
  }

  async onPayload(bytes) {
    if (this.stopped || bytes.length < 29) return;

    let msg;

    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        this.key,
        bytes.slice(12)
      );
      msg = JSON.parse(dec.decode(plain));
    } catch {
      return;
    }

    if (!msg || msg.f === this.id || (msg.t && msg.t !== this.id)) return;

    if (this.seen.includes(msg.m)) return;
    this.seen.push(msg.m);
    if (this.seen.length > 400) this.seen.splice(0, 200);

    if (msg.k === 'hello') this.onHello(msg.f);
    else if (msg.k === 'sig' && msg.d) this.onSignal(msg.f, msg.d);
  }

  onHello(from) {
    let link = this.links.get(from);

    if (
      link &&
      (link.closed || ['failed', 'closed'].includes(link.pc.connectionState))
    ) {
      this.linkDown(link, false);
      link = null;
    }

    if (!link) {
      link = new Link(this, from, this.id < from);
      this.links.set(from, link);
      this.announce();
    }
  }

  onSignal(from, d) {
    let link = this.links.get(from);

    if (d.sdp && d.sdp.type === 'offer') {
      if (!link || link.initiator || (link.lid && link.lid !== d.l)) {
        if (link) this.linkDown(link, false);
        link = new Link(this, from, false);
        this.links.set(from, link);
      }
      link.lid = d.l;
    } else if (!link || (link.lid && link.lid !== d.l)) {
      return;
    }

    const target = link;

    target.handle(d).catch(() => this.linkDown(target, true));
  }

  linkUp(link) {
    if (this.stopped || this.links.get(link.peerId) !== link) return;

    this.linkFailed = false;
    this.o.onPeerOpen?.(link.peerId);
    this.o.onChange?.();
  }

  linkDown(link, failed) {
    if (link.closed && this.links.get(link.peerId) !== link) return;

    const wasOpen = link.open;

    link.close();

    if (this.links.get(link.peerId) === link) this.links.delete(link.peerId);

    if (this.stopped) return;

    if (wasOpen) this.o.onPeerClose?.(link.peerId);
    if (failed && this.openPeers.length === 0) this.linkFailed = true;

    this.o.onChange?.();
  }

  onMessage(peerId, type, bytes) {
    if (!this.stopped) this.o.onMessage?.(peerId, type, bytes);
  }

  send(peerId, type, bytes) {
    const link = this.links.get(peerId);
    return link && link.open ? link.send(type, bytes) : Promise.resolve();
  }

  broadcast(type, bytes) {
    return Promise.all(
      this.openPeers.map((peerId) => this.send(peerId, type, bytes))
    );
  }
}
