import {
  SIGNALING_BROKERS,
  ICE_SERVERS,
  LINK_CONNECT_TIMEOUT_MS,
  LINK_DISCONNECT_GRACE_MS,
  LINK_RECOVER_TIMEOUT_MS,
  LINK_MAX_RESTARTS,
  LINK_RETRY_BASE_MS,
  LINK_RETRY_MAX_MS,
  RELAY_AFTER_MS,
  RELAY_PRESENCE_MS,
  RELAY_CHUNK_CHARS,
  RELAY_PACE_MS,
  RELAY_ACK_TIMEOUT_MS,
  RELAY_MAX_TRIES,
  RELAY_NACK_MS,
} from './constants.js';

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

// Dev-only diagnostics: always on in dev builds, opt-in in production via
// localStorage.setItem('nozima-sync-debug', '1'). Never shown in the UI.
export function syncLog(...args) {
  try {
    if (import.meta.env.DEV || localStorage.getItem('nozima-sync-debug') === '1') {
      // eslint-disable-next-line no-console
      console.log(
        '[SYNC]',
        ...args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a) : a))
      );
    }
  } catch {
    /* ignore */
  }
}

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
    this.reason = null; // network | timeout | refused | protocol
    this.stage = 'idle';
    this.opened = false;
    this.acked = false;
    this.timedOut = false;
    this.ws = null;
    this.buf = new Uint8Array(0);
    this.stopped = false;
    this.timers = [];
    this.lastRx = 0;
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
    this.stage = 'ws-connecting';
    this.opened = false;
    this.acked = false;
    this.timedOut = false;
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
          this.timedOut = true;
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

      this.opened = true;
      this.stage = `ws-open(${ws.protocol || 'no-subprotocol'})`;

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
    this.lastRx = Date.now();
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

        if (i > 4 && b & 128) {
          this.protocolError('bad remaining length');
          return;
        }
      } while (b & 128);

      if (this.buf.length < i + len) return;

      const type = this.buf[0] >> 4;
      const flags = this.buf[0] & 15;
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);

      this.packet(type, flags, body);
    }
  }

  protocolError(detail) {
    this.reason = 'protocol';
    this.stage = `protocol-error(${detail})`;
    syncLog('broker protocol error', this.url, detail);

    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }

  packet(type, flags, body) {
    const ws = this.ws;

    if (type === 2) {
      // CONNACK
      if (body.length < 2 || body[1] !== 0) {
        this.reason = 'refused';
        this.stage = `connack-refused(${body[1]})`;
        syncLog('broker CONNACK refused', this.url, body[1]);

        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }

      this.stage = 'connack-ok';

      ws.send(
        mqttPacket(0x82, concat(Uint8Array.of(0, 1), mqttString(this.topic), Uint8Array.of(0)))
      );
    } else if (type === 9) {
      // SUBACK
      if (body.length < 3 || body[2] === 0x80) {
        this.reason = 'refused';
        this.stage = 'suback-refused';
        syncLog('broker SUBACK refused', this.url);

        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }

      this.state = 'ready';
      this.stage = 'subscribed';
      this.acked = true;
      this.reason = null;
      this.failures = 0;
      syncLog('broker ready', this.url);
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

    if (!this.reason) {
      if (this.state === 'ready') this.reason = 'network';
      else if (this.timedOut) this.reason = 'timeout';
      else if (!this.opened) this.reason = 'network';
      else this.reason = 'protocol';
    }

    this.failed();
  }

  failed() {
    this.clearTimers();
    this.failures += 1;
    this.state = 'failed';
    if (!this.reason) this.reason = 'network';
    syncLog('broker failed', this.url, this.reason, this.stage, `#${this.failures}`);
    this.onState(this);

    if (this.stopped) return;

    const delay = Math.min(500 * 2 ** (this.failures - 1), 8000);
    this.timers.push(setTimeout(() => this.open(), delay));
  }

  // After wake-up / network change: reconnect now instead of waiting for backoff.
  reconnectNow() {
    if (this.stopped) return;
    if (this.state === 'ready' && this.ws && this.ws.readyState === 1) return;

    this.clearTimers();

    const ws = this.ws;
    this.ws = null;

    try {
      ws?.close();
    } catch {
      /* ignore */
    }

    this.open();
  }

  // Detect half-dead sockets (mobile sleep): ping, expect any traffic back.
  probe() {
    const ws = this.ws;

    if (this.state !== 'ready' || !ws || ws.readyState !== 1) return;

    const sentAt = Date.now();

    try {
      ws.send(Uint8Array.of(0xc0, 0));
    } catch {
      /* ignore */
    }

    this.timers.push(
      setTimeout(() => {
        if (this.ws === ws && this.lastRx < sentAt) {
          syncLog('broker probe failed, reconnecting', this.url);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          this.closed(ws);
        }
      }, 5000)
    );
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
 * SIGNAL CHANNEL: encrypted pub/sub over every configured broker
 * ================================================================
 *
 * Used directly for the pairing handshake (no WebRTC needed) and by
 * PeerMesh for WebRTC offer/answer/ICE exchange.
 */

export class SignalChannel {
  /* options: { roomId, password, onMessage(msg), onChange(), brokers? } */
  constructor(options) {
    this.o = options;
    this.id = hex(rand(8));
    this.seen = [];
    this.brokers = [];
    this.stopped = false;
    this.key = null;
    this.outbox = [];
  }

  /*
   * signaling: 'ready' (>=1 broker subscribed) | 'unavailable' (every
   * broker attempt failed) | 'connecting'.
   * failure: 'network' (unreachable/timeouts) or 'protocol' (a broker
   * answered but refused / violated MQTT) when unavailable.
   */
  get state() {
    if (this.brokers.some((b) => b.state === 'ready')) {
      return { signaling: 'ready', failure: null };
    }

    if (this.brokers.length && this.brokers.every((b) => b.failures >= 1)) {
      const protocol = this.brokers.some(
        (b) => b.reason === 'refused' || b.reason === 'protocol'
      );
      return { signaling: 'unavailable', failure: protocol ? 'protocol' : 'network' };
    }

    return { signaling: 'connecting', failure: null };
  }

  diagnostics() {
    return this.brokers.map((b) => ({
      url: b.url,
      state: b.state,
      stage: b.stage,
      reason: b.reason,
      failures: b.failures,
    }));
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
            if (broker.state === 'ready') this.flushOutbox();
            this.o.onChange?.(broker);
          }
        )
    );

    this.brokers.forEach((b) => b.start());
  }

  stop() {
    this.stopped = true;
    this.brokers.forEach((b) => b.stop());
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

    const sent = this.brokers.filter((b) => b.publish(payload)).length;

    // No broker reachable right now: hold the message instead of losing it
    // (offers/answers/candidates must survive short signaling outages).
    if (sent === 0) {
      this.outbox.push({ payload, until: Date.now() + 45000 });
      if (this.outbox.length > 100) this.outbox.shift();
      syncLog('signal queued (no broker ready)', this.outbox.length);
    }
  }

  flushOutbox() {
    const now = Date.now();
    const pending = this.outbox.splice(0).filter((m) => m.until > now);

    pending.forEach((m) => {
      const sent = this.brokers.filter((b) => b.publish(m.payload)).length;

      if (sent === 0) this.outbox.push(m);
    });

    if (pending.length) syncLog('signal outbox flushed', pending.length);
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

    if (!msg || typeof msg.m !== 'string' || msg.f === this.id) return;
    if (msg.t && msg.t !== this.id) return;

    if (this.seen.includes(msg.m)) return;
    this.seen.push(msg.m);
    if (this.seen.length > 400) this.seen.splice(0, 200);

    this.o.onMessage?.(msg);
  }
}

/*
 * Log-safe description of an RTCPeerConnection configuration.
 */
export function iceConfigSummary(config) {
  const servers = config?.iceServers || [];
  const urls = servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));

  return {
    policy: config?.iceTransportPolicy || 'all',
    stun: urls.filter((u) => /^stuns?:/i.test(u)).length,
    turn: urls.filter((u) => /^turns?:/i.test(u)).length,
    urls: urls.map((u) => String(u).split('?')[0]),
  };
}

function bytesToB64(bytes) {
  let out = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }

  return btoa(out);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);

  return out;
}

/*
 * ================================================================
 * WEBRTC PEER MESH (data channels, chunked binary framing)
 * ================================================================
 */

const CHUNK = 15000;
const ANNOUNCE_MS = 4000;
const CHECKPOINTS_MS = [8000, 18000, 35000, 50000];

export const MSG_SV = 0;
export const MSG_UPDATE = 1;
export const MSG_CTL = 2;

const candidateType = (c) => (/ typ (\w+)/.exec(c?.candidate || '') || [])[1] || 'unknown';
const zeroCounts = () => ({ host: 0, srflx: 0, prflx: 0, relay: 0 });

class Link {
  constructor(mesh, peerId, initiator) {
    this.mesh = mesh;
    this.peerId = peerId;
    this.initiator = initiator;
    this.lid = initiator ? hex(rand(4)) : null;
    this.open = false;
    this.closed = false;
    this.everOpen = false;
    this.created = Date.now();
    this.queue = Promise.resolve();
    this.nextId = 0;
    this.rx = new Map();
    this.restarts = 0;
    this.lastRestartReq = 0;
    this.lastOfferAt = 0;
    this.chain = Promise.resolve();
    this.timers = [];
    this.recoverTimer = null;

    // Negotiation generations: every SDP exchange (initial + each ICE
    // restart) has a number; candidates are only applied to their own.
    this.offerSeq = 0; // offerer: seq of our latest offer
    this.answeredGen = 0; // offerer: seq whose answer we applied
    this.remoteGen = 0; // answerer: seq of the offer applied
    this.lastOfferSeen = 0;
    this.lastAnswer = null;
    this.gen = 0; // generation tagged on our outgoing candidates

    this.localCands = [];
    this.pending = [];
    this.future = new Map();
    this.seenRemote = new Set();

    // Current generation counters + cumulative maxima (for failure class).
    this.cands = zeroCounts();
    this.remoteCands = zeroCounts();
    this.maxLocalRelay = 0;
    this.maxRemoteRelay = 0;
    this.remoteTotalEver = 0;
    this.addErrors = 0;
    this.staleDropped = 0;
    this.iceErrors = [];
    this.pairSucceeded = false;
    this.lastStats = null;

    const pc = new RTCPeerConnection({ iceServers: mesh.iceServers });
    this.pc = pc;

    syncLog(
      'link config',
      this.tag(),
      iceConfigSummary(pc.getConfiguration ? pc.getConfiguration() : { iceServers: mesh.iceServers })
    );

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate.toJSON();
        const t = candidateType(e.candidate);

        this.cands[t] = (this.cands[t] || 0) + 1;
        this.maxLocalRelay = Math.max(this.maxLocalRelay, this.cands.relay);
        this.localCands.push(c);
        this.signal({ ice: c, g: this.gen });
      } else {
        syncLog('ice gathering complete', this.tag(), this.cands);
        this.sendBatch();

        // Trickled candidates can be lost on the relay: re-send the full
        // set (idempotent on the receiver) until the link opens.
        [3000, 8000, 16000].forEach((ms) =>
          this.timers.push(
            setTimeout(() => {
              if (!this.open && !this.closed) this.sendBatch();
            }, ms)
          )
        );
      }
    };

    pc.onicecandidateerror = (e) => {
      const entry = {
        code: e.errorCode,
        text: String(e.errorText || '').slice(0, 80),
        server: String(e.url || '').split('?')[0],
      };

      this.iceErrors.push(entry);
      syncLog('ice candidate error', this.tag(), entry);
    };

    pc.onicegatheringstatechange = () =>
      syncLog('ice gathering', this.tag(), pc.iceGatheringState);

    pc.onsignalingstatechange = () =>
      syncLog('signaling state', this.tag(), pc.signalingState);

    pc.oniceconnectionstatechange = () => this.onState('ice');
    pc.onconnectionstatechange = () => this.onState('conn');

    // Negotiated channel: both sides create it up-front, so there is no
    // ondatachannel race and it survives ICE restarts.
    this.bind(pc.createDataChannel('sync', { ordered: true, negotiated: true, id: 0 }));

    if (initiator) {
      this.negotiate(false).catch((e) => {
        syncLog('offer failed', this.tag(), e?.message || e);
        mesh.linkDown(this, true, 'offer-failed');
      });
    }

    // Observation points: never restart a connection that is still
    // checking; only diagnose, and ask the peer to re-send candidates
    // when none have arrived (lost on the relay).
    CHECKPOINTS_MS.forEach((ms) =>
      this.timers.push(setTimeout(() => this.checkpoint(ms), ms))
    );

    this.timers.push(
      setTimeout(() => {
        if (!this.open && !this.closed) mesh.linkDown(this, true, 'connect-timeout');
      }, LINK_CONNECT_TIMEOUT_MS)
    );
  }

  tag() {
    return `${this.initiator ? 'offerer' : 'answerer'}:${this.peerId.slice(0, 6)}`;
  }

  signal(d) {
    this.mesh.publish({ k: 'sig', t: this.peerId, d: { ...d, l: this.lid } });
  }

  sendBatch() {
    if (this.closed || !this.localCands.length) return;

    this.signal({ ice_all: this.localCands, g: this.gen, end: true });
  }

  newGeneration(gen) {
    this.gen = gen;
    this.localCands = [];
    this.cands = zeroCounts();
    this.remoteCands = zeroCounts();
    this.seenRemote = new Set();
    this.pending = [];
  }

  async negotiate(iceRestart) {
    const pc = this.pc;

    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') return;

    this.offerSeq += 1;
    this.lastOfferAt = Date.now();
    this.newGeneration(this.offerSeq);

    const seq = this.offerSeq;
    let offer;

    if (iceRestart && typeof pc.restartIce === 'function') {
      pc.restartIce();
      offer = await pc.createOffer();
    } else {
      offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    }

    if (seq !== this.offerSeq || this.closed) return;

    await pc.setLocalDescription(offer);

    const payload = {
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      o: seq,
    };

    this.lastOfferPayload = payload;
    this.signal(payload);

    // Resend until answered: the relay is lossy and may be reconnecting.
    let tries = 0;

    const resend = () => {
      if (this.closed || seq !== this.offerSeq || pc.signalingState !== 'have-local-offer') return;
      if (tries >= 5) return;

      tries += 1;
      syncLog('offer resend', this.tag(), `#${tries}`);
      this.signal(payload);
      this.timers.push(setTimeout(resend, 4000));
    };

    this.timers.push(setTimeout(resend, 4000));
  }

  // Offerer restarts ICE itself; answerer asks the offerer to.
  restart(reason) {
    if (this.closed) return false;

    if (this.restarts >= LINK_MAX_RESTARTS) return false;

    if (this.initiator) {
      // An offer is already in flight: don't stack another one on top.
      if (
        this.pc.signalingState === 'have-local-offer' &&
        Date.now() - this.lastOfferAt < 10000
      ) {
        return true;
      }

      this.restarts += 1;
      syncLog('ice restart', this.tag(), reason, `#${this.restarts}`);

      this.negotiate(true).catch((e) =>
        syncLog('restart offer failed', this.tag(), e?.message || e)
      );
      return true;
    }

    const now = Date.now();

    if (now - this.lastRestartReq < 4000) return true;

    this.lastRestartReq = now;
    this.restarts += 1;
    syncLog('ice restart requested', this.tag(), reason, `#${this.restarts}`);
    this.signal({ rr: 1 });
    return true;
  }

  currentState() {
    const pc = this.pc;

    if (pc.connectionState) return pc.connectionState;

    // Older Safari: no connectionState, fall back to ICE state.
    return { checking: 'connecting', completed: 'connected' }[pc.iceConnectionState] || pc.iceConnectionState;
  }

  onState(source) {
    if (this.closed) return;

    const state = this.currentState();

    syncLog('state', this.tag(), source, {
      ice: this.pc.iceConnectionState,
      conn: this.pc.connectionState,
      sig: this.pc.signalingState,
      gather: this.pc.iceGatheringState,
    });

    this.collectStats().catch(() => {});

    if (state === 'connected') {
      clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
    } else if (state === 'disconnected') {
      // Likely a network change: our signaling socket may be half-dead too.
      this.mesh.probeSignaling();

      // Often transient (Wi-Fi roam, brief loss): wait before acting.
      clearTimeout(this.recoverTimer);
      this.recoverTimer = setTimeout(() => this.recover('disconnected'), LINK_DISCONNECT_GRACE_MS);
    } else if (state === 'failed') {
      this.mesh.probeSignaling();
      this.recover('failed');
    } else if (state === 'closed') {
      this.mesh.linkDown(this, false, 'pc-closed');
    }
  }

  recover(reason) {
    if (this.closed) return;

    const state = this.currentState();

    if (state === 'connected') return;

    clearTimeout(this.recoverTimer);

    if (this.restart(reason)) {
      // Give the restarted ICE time before giving up.
      this.recoverTimer = setTimeout(() => {
        if (!this.closed && this.currentState() !== 'connected') {
          this.mesh.linkDown(this, true, `${reason}-unrecovered`);
        }
      }, LINK_RECOVER_TIMEOUT_MS);
    } else {
      this.mesh.linkDown(this, true, `${reason}-exhausted`);
    }
  }

  // Called on wake-up / network change.
  check() {
    if (this.closed) return;

    const state = this.currentState();

    if (state === 'disconnected' || state === 'failed') this.recover('resume');
  }

  // Safe stats snapshot: candidate types, pair states, selected pair.
  async collectStats() {
    const stats = await this.pc.getStats();
    const byId = new Map();
    const pairs = [];
    let selected = null;

    stats.forEach((r) => byId.set(r.id, r));

    stats.forEach((r) => {
      if (r.type === 'candidate-pair') {
        pairs.push({
          state: r.state,
          nominated: Boolean(r.nominated),
          sent: r.requestsSent || 0,
          recv: r.responsesReceived || 0,
          local: byId.get(r.localCandidateId)?.candidateType,
          remote: byId.get(r.remoteCandidateId)?.candidateType,
        });

        if (r.state === 'succeeded') this.pairSucceeded = true;
      }

      if (r.type === 'transport' && r.selectedCandidatePairId) {
        const pair = byId.get(r.selectedCandidatePairId);
        const local = byId.get(pair?.localCandidateId);
        const remote = byId.get(pair?.remoteCandidateId);

        selected = {
          local: local?.candidateType,
          remote: remote?.candidateType,
          protocol: local?.protocol,
          relayProtocol: local?.relayProtocol,
        };
      }
    });

    this.lastStats = { pairs: pairs.slice(0, 12), selected };

    if (selected && this.currentState() === 'connected') {
      syncLog('ice connected', this.tag(), { selected, gathered: this.cands });
    }

    return this.lastStats;
  }

  // A-E failure class (see audit): where exactly did this link stop?
  classify() {
    if (this.everOpen) return 'E'; // opened, then closed by app/peer
    if (this.pairSucceeded) return 'D'; // ICE worked, channel never opened
    if (this.remoteTotalEver === 0) return 'B'; // no candidates received from peer
    return 'C'; // candidates exchanged, no pair succeeded (NAT)
  }

  async checkpoint(ms) {
    if (this.open || this.closed) return;

    let stats = null;

    try {
      stats = await this.collectStats();
    } catch {
      /* closed */
    }

    syncLog('checkpoint', this.tag(), `${ms / 1000}s`, {
      state: this.currentState(),
      ice: this.pc.iceConnectionState,
      gather: this.pc.iceGatheringState,
      local: this.cands,
      remote: this.remoteCands,
      class: this.classify(),
      pairs: stats?.pairs?.map((p) => `${p.local}>${p.remote}:${p.state}:${p.recv}/${p.sent}`),
    });

    // Nothing received from the peer: ask it to re-send (lost on relay).
    if (!this.initiator && this.remoteGen === 0) this.signal({ need: 'sdp' });
    else if (this.initiator && this.pc.signalingState === 'have-local-offer' && this.lastOfferPayload) {
      this.signal(this.lastOfferPayload);
    }

    if (this.remoteTotalEver === 0) this.signal({ need: 'cands' });
  }

  failureReport(reason) {
    syncLog('link failed', this.tag(), reason, {
      class: this.classify(),
      local: this.cands,
      remote: this.remoteCands,
      restarts: this.restarts,
      addErrors: this.addErrors,
      staleDropped: this.staleDropped,
      iceErrors: this.iceErrors.slice(-4),
      pairs: this.lastStats?.pairs?.map((p) => `${p.local}>${p.remote}:${p.state}:${p.recv}/${p.sent}`),
      ice: this.pc.iceConnectionState,
      conn: this.pc.connectionState,
    });
  }

  // Signals are processed strictly one at a time, in arrival order.
  handle(d) {
    const run = this.chain.then(() => this.handleNow(d));

    this.chain = run.catch(() => {});

    return run;
  }

  remoteReady() {
    return this.initiator ? this.answeredGen === this.offerSeq && this.offerSeq > 0 : this.remoteGen > 0;
  }

  currentRemoteGen() {
    return this.initiator ? this.offerSeq : this.remoteGen;
  }

  async acceptCandidate(g, c) {
    const cur = this.currentRemoteGen();

    if (g < cur) {
      this.staleDropped += 1;
      return;
    }

    if (g > cur) {
      const list = this.future.get(g) || [];

      if (list.length < 80) list.push(c);

      this.future.set(g, list);
      return;
    }

    const key = c?.candidate || '';

    if (key && this.seenRemote.has(key)) return;
    if (key) this.seenRemote.add(key);

    const t = candidateType(c);

    this.remoteCands[t] = (this.remoteCands[t] || 0) + 1;
    this.remoteTotalEver += 1;
    this.maxRemoteRelay = Math.max(this.maxRemoteRelay, this.remoteCands.relay);

    if (!this.remoteReady()) {
      this.pending.push(c);
      return;
    }

    await this.applyCandidate(c);
  }

  async applyCandidate(c) {
    try {
      await this.pc.addIceCandidate(c);
    } catch (e) {
      this.addErrors += 1;
      syncLog('addIceCandidate failed', this.tag(), e?.name || '', String(e?.message || '').slice(0, 100));
    }
  }

  async flushPending() {
    const queued = this.pending.splice(0);

    for (const c of queued) {
      await this.applyCandidate(c);
    }
  }

  async flushFuture(gen) {
    const list = this.future.get(gen) || [];

    this.future.delete(gen);

    Array.from(this.future.keys()).forEach((g) => {
      if (g < gen) this.future.delete(g);
    });

    for (const c of list) {
      await this.acceptCandidate(gen, c);
    }
  }

  async handleNow(d) {
    const pc = this.pc;

    if (this.closed) return;

    if (d.rr) {
      if (this.initiator) this.restart('peer-request');
      return;
    }

    if (d.need === 'cands') {
      this.sendBatch();
      return;
    }

    if (d.need === 'sdp') {
      if (this.initiator && this.lastOfferPayload && pc.signalingState === 'have-local-offer') {
        this.signal(this.lastOfferPayload);
      }

      return;
    }

    if (d.ice) {
      await this.acceptCandidate(d.g || 0, d.ice);
      return;
    }

    if (d.ice_all) {
      for (const c of d.ice_all) {
        await this.acceptCandidate(d.g || 0, c);
      }

      return;
    }

    if (!d.sdp) return;

    if (d.sdp.type === 'answer') {
      // Ignore answers to superseded offers instead of failing the link.
      if (d.o !== this.offerSeq || pc.signalingState !== 'have-local-offer') {
        syncLog('stale answer ignored', this.tag(), d.o, this.offerSeq);
        return;
      }

      await pc.setRemoteDescription(d.sdp);
      this.answeredGen = d.o;

      await this.flushFuture(d.o);
      await this.flushPending();
      return;
    }

    // Offer (answerer side).
    if (d.o && d.o === this.lastOfferSeen && this.lastAnswer) {
      // Retransmitted offer: re-send the cached answer, don't re-apply.
      this.signal(this.lastAnswer);
      this.sendBatch();
      return;
    }

    if (d.o && d.o < this.lastOfferSeen) {
      syncLog('stale offer ignored', this.tag(), d.o, this.lastOfferSeen);
      return;
    }

    this.lastOfferSeen = d.o || 0;

    await pc.setRemoteDescription(d.sdp);

    this.remoteGen = d.o || 1;
    this.newGeneration(this.remoteGen);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.lastAnswer = { sdp: { type: answer.type, sdp: answer.sdp }, o: d.o };
    this.signal(this.lastAnswer);

    await this.flushFuture(this.remoteGen);
    await this.flushPending();
  }

  bind(dc) {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 256 * 1024;

    dc.onopen = () => {
      if (this.closed) return;
      this.open = true;
      this.everOpen = true;
      clearTimeout(this.recoverTimer);
      syncLog('data channel open', this.tag());
      this.collectStats().catch(() => {});
      this.mesh.linkUp(this);
    };

    dc.onclose = () => this.mesh.linkDown(this, false, 'channel-closed');

    dc.onerror = (e) => syncLog('data channel error', this.tag(), e?.error?.message || '');

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

    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearTimeout(this.recoverTimer);

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
   *
   * A peer is "open" when either a WebRTC data channel is open or the
   * encrypted relay fallback is active for it. WebRTC always wins.
   */
  constructor(options) {
    this.o = options;
    this.links = new Map();
    this.backoff = new Map();
    this.stopped = false;
    this.linkFailed = false;
    this.failureClass = null;
    this.iceServers = options.iceServers || ICE_SERVERS;
    this.tick = 0;

    // Relay fallback state.
    this.peers = new Map(); // peerId -> { last, unlinkedSince }
    this.relayActive = new Set();
    this.relayOut = new Map();
    this.relayIn = new Map();
    this.relayDone = [];
    this.relaySeq = 0;

    this.sig = new SignalChannel({
      roomId: options.roomId,
      password: options.password,
      brokers: options.brokers,
      onMessage: (msg) => this.onSignalMessage(msg),
      onChange: (broker) => {
        if (this.stopped) return;
        if (broker.state === 'ready') this.announce();
        this.o.onChange?.();
      },
    });

    this.id = this.sig.id;
  }

  isLinked(peerId) {
    const link = this.links.get(peerId);

    return Boolean(link && link.open && !link.closed);
  }

  get webrtcPeers() {
    return Array.from(this.links.values())
      .filter((l) => l.open && !l.closed)
      .map((l) => l.peerId);
  }

  get relayPeers() {
    return Array.from(this.relayActive).filter((p) => !this.isLinked(p));
  }

  get openPeers() {
    return Array.from(new Set([...this.webrtcPeers, ...this.relayActive]));
  }

  get connectingCount() {
    return Array.from(this.links.values()).filter((l) => !l.open && !l.closed).length;
  }

  get signaling() {
    return this.sig.state.signaling;
  }

  get signalingFailure() {
    return this.sig.state.failure;
  }

  async start() {
    await this.sig.start();

    if (this.stopped) return;

    this.timer = setInterval(() => this.heartbeat(), ANNOUNCE_MS);

    // Mobile: wake-up / network change / tab restore.
    this.onResume = () => this.resume();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onResume);
      window.addEventListener('pageshow', this.onResume);
    }

    if (typeof document !== 'undefined') {
      this.onVisible = () => {
        if (document.visibilityState === 'visible') this.resume();
      };
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);

    if (typeof window !== 'undefined' && this.onResume) {
      window.removeEventListener('online', this.onResume);
      window.removeEventListener('pageshow', this.onResume);
    }

    if (typeof document !== 'undefined' && this.onVisible) {
      document.removeEventListener('visibilitychange', this.onVisible);
    }

    this.relayOut.forEach((e) => clearTimeout(e.timer));
    this.relayOut.clear();
    this.relayIn.clear();
    this.relayActive.clear();

    this.sig.stop();
    Array.from(this.links.values()).forEach((l) => l.close());
    this.links.clear();
  }

  probeSignaling() {
    if (this.stopped) return;

    this.sig.brokers.forEach((b) => {
      if (b.state === 'ready') b.probe();
      else b.reconnectNow();
    });
  }

  resume() {
    if (this.stopped) return;

    syncLog('resume: reconnect signaling, re-announce, check links');

    this.probeSignaling();
    this.backoff.clear();
    this.announce();
    Array.from(this.links.values()).forEach((l) => l.check());
  }

  heartbeat() {
    if (this.stopped) return;

    this.tick += 1;

    const now = Date.now();

    // Safety net only: each Link enforces its own timeouts.
    Array.from(this.links.values()).forEach((l) => {
      if (!l.open && now - l.created > LINK_CONNECT_TIMEOUT_MS + 10000) {
        this.linkDown(l, true, 'stale');
      }
    });

    this.evaluateRelay();

    // Fast discovery/presence while any peer lacks a WebRTC link.
    if (this.webrtcPeers.length === 0 || this.tick % 5 === 0) this.announce();

    this.o.onChange?.();
  }

  announce() {
    this.publish({ k: 'hello' });
  }

  publish(message) {
    return this.sig.publish(message);
  }

  /*
   * ----------------------------------------------------------------
   * ENCRYPTED RELAY FALLBACK (no account, no server of our own)
   * ----------------------------------------------------------------
   */

  touch(peerId) {
    const now = Date.now();
    const info = this.peers.get(peerId);

    if (info) info.last = now;
    else this.peers.set(peerId, { last: now, unlinkedSince: now });
  }

  evaluateRelay() {
    const now = Date.now();

    Array.from(this.peers).forEach(([peerId, info]) => {
      if (now - info.last > RELAY_PRESENCE_MS) {
        this.peers.delete(peerId);
        this.relayStop(peerId, true);
        return;
      }

      if (this.isLinked(peerId)) {
        info.unlinkedSince = null;
        if (this.relayActive.has(peerId)) this.relayStop(peerId, false);
        return;
      }

      if (info.unlinkedSince == null) info.unlinkedSince = now;

      if (!this.relayActive.has(peerId) && now - info.unlinkedSince > RELAY_AFTER_MS) {
        this.relayStart(peerId, 'no direct link');
      }
    });
  }

  relayStart(peerId, reason) {
    if (this.stopped || this.relayActive.has(peerId) || this.isLinked(peerId)) return;

    this.relayActive.add(peerId);
    syncLog('relay active', peerId.slice(0, 6), reason);
    this.o.onPeerOpen?.(peerId);
    this.o.onChange?.();
  }

  relayStop(peerId, notifyClose) {
    if (!this.relayActive.has(peerId)) return;

    this.relayActive.delete(peerId);

    Array.from(this.relayOut).forEach(([id, e]) => {
      if (e.peer === peerId) {
        clearTimeout(e.timer);
        this.relayOut.delete(id);
      }
    });

    syncLog('relay stopped', peerId.slice(0, 6), notifyClose ? '(peer gone)' : '(webrtc took over)');

    if (notifyClose) this.o.onPeerClose?.(peerId);

    this.o.onChange?.();
  }

  relaySend(peerId, type, bytes) {
    const b64 = bytesToB64(bytes);
    const chunks = [];

    for (let i = 0; i < b64.length; i += RELAY_CHUNK_CHARS) {
      chunks.push(b64.slice(i, i + RELAY_CHUNK_CHARS));
    }

    if (!chunks.length) chunks.push('');

    this.relaySeq += 1;

    const id = `${this.relaySeq.toString(36)}${hex(rand(2))}`;

    this.relayOut.set(id, { peer: peerId, type, chunks, tries: 0, timer: null, heard: false });
    this.relayTransmit(id);

    return Promise.resolve();
  }

  relayTransmit(id) {
    const entry = this.relayOut.get(id);

    if (!entry || this.stopped) return;

    if (!this.relayActive.has(entry.peer) || entry.tries >= RELAY_MAX_TRIES) {
      if (entry.tries >= RELAY_MAX_TRIES) syncLog('relay message dropped (no ack)', id);
      this.relayOut.delete(id);
      return;
    }

    entry.tries += 1;

    // Paced to stay friendly to public brokers. Until the receiver answers
    // at all, everything is re-sent; once it reports gaps (nack), only the
    // missing chunks are re-sent.
    const indexes = entry.heard ? [0] : entry.chunks.map((_, n) => n);

    this.relayPublishChunks(id, indexes);

    entry.timer = setTimeout(
      () => this.relayTransmit(id),
      RELAY_ACK_TIMEOUT_MS + indexes.length * RELAY_PACE_MS
    );
  }

  relayPublishChunks(id, indexes) {
    const entry = this.relayOut.get(id);

    if (!entry) return;

    indexes.forEach((n, k) => {
      const chunk = entry.chunks[n];

      if (chunk === undefined) return;

      setTimeout(() => {
        if (this.stopped || !this.relayOut.has(id)) return;

        this.publish({
          k: 'ry',
          t: entry.peer,
          y: entry.type,
          i: id,
          n,
          c: entry.chunks.length,
          d: chunk,
        });
      }, k * RELAY_PACE_MS);
    });
  }

  onRelayNack(m) {
    const entry = this.relayOut.get(m.i);

    if (!entry || !Array.isArray(m.m)) return;

    entry.heard = true;
    this.relayPublishChunks(
      m.i,
      m.m.filter((n) => Number.isInteger(n) && n >= 0 && n < entry.chunks.length).slice(0, 200)
    );
  }

  onRelayData(from, m) {
    if (typeof m.i !== 'string' || !Number.isInteger(m.n) || !Number.isInteger(m.c) || m.c < 1) return;

    // The sender already relays to us: do the same immediately.
    if (!this.isLinked(from) && !this.relayActive.has(from)) this.relayStart(from, 'peer is relaying');

    const key = `${from}:${m.i}`;

    if (this.relayDone.includes(key)) {
      this.publish({ k: 'rack', t: from, i: m.i });
      return;
    }

    let entry = this.relayIn.get(key);

    if (!entry) {
      entry = { parts: new Array(m.c), got: 0, type: m.y };
      this.relayIn.set(key, entry);

      if (this.relayIn.size > 200) this.relayIn.delete(this.relayIn.keys().next().value);
    }

    if (entry.parts[m.n] === undefined && m.n >= 0 && m.n < entry.parts.length) {
      entry.parts[m.n] = String(m.d || '');
      entry.got += 1;
    }

    if (entry.got !== entry.parts.length) {
      this.scheduleNack(from, m.i, key);
      return;
    }

    clearTimeout(entry.nackTimer);
    this.relayIn.delete(key);
    this.relayDone.push(key);
    if (this.relayDone.length > 400) this.relayDone.splice(0, 200);

    this.publish({ k: 'rack', t: from, i: m.i });

    try {
      this.o.onMessage?.(from, entry.type, b64ToBytes(entry.parts.join('')));
    } catch (e) {
      syncLog('relay message rejected', e?.message || e);
    }
  }

  // Tell the sender exactly which chunks are still missing.
  scheduleNack(from, id, key) {
    const entry = this.relayIn.get(key);

    if (!entry || entry.nackTimer || this.stopped) return;

    entry.nackTimer = setTimeout(() => {
      entry.nackTimer = null;

      if (this.stopped || this.relayIn.get(key) !== entry) return;

      entry.nacks = (entry.nacks || 0) + 1;

      if (entry.nacks > RELAY_MAX_TRIES) {
        this.relayIn.delete(key);
        return;
      }

      const missing = [];

      entry.parts.forEach((p, n) => {
        if (p === undefined && missing.length < 200) missing.push(n);
      });

      this.publish({ k: 'rnack', t: from, i: id, m: missing });
      this.scheduleNack(from, id, key);
    }, RELAY_NACK_MS);
  }

  onRelayAck(m) {
    const entry = this.relayOut.get(m.i);

    if (!entry) return;

    clearTimeout(entry.timer);
    this.relayOut.delete(m.i);
  }

  /*
   * ----------------------------------------------------------------
   * WEBRTC
   * ----------------------------------------------------------------
   */

  onSignalMessage(msg) {
    if (msg.f) this.touch(msg.f);

    if (msg.k === 'hello') this.onHello(msg.f);
    else if (msg.k === 'sig' && msg.d) this.onSignal(msg.f, msg.d);
    else if (msg.k === 'ry') this.onRelayData(msg.f, msg);
    else if (msg.k === 'rack') this.onRelayAck(msg);
    else if (msg.k === 'rnack') this.onRelayNack(msg);
  }

  createLink(peerId, initiator) {
    try {
      const link = new Link(this, peerId, initiator);
      this.links.set(peerId, link);
      return link;
    } catch (e) {
      syncLog('WebRTC unavailable', e?.message || e);
      this.linkFailed = true;
      this.failureClass = 'C';
      this.o.onChange?.();
      return null;
    }
  }

  onHello(from) {
    let link = this.links.get(from);

    if (link && link.closed) {
      this.links.delete(from);
      link = null;
    }

    // One logical connection per peer: never replace a live/connecting one.
    if (link) return;

    const wait = this.backoff.get(from);

    if (wait && Date.now() < wait.until) return;

    link = this.createLink(from, this.id < from);

    if (link) this.announce();
  }

  onSignal(from, d) {
    let link = this.links.get(from);

    if (d.sdp && d.sdp.type === 'offer') {
      if (!link || link.closed || link.initiator || (link.lid && link.lid !== d.l)) {
        if (link) this.linkDown(link, false, 'replaced');
        link = this.createLink(from, false);
        if (!link) return;
      }

      link.lid = d.l;
    } else if (!link || link.closed) {
      // Candidates racing ahead of their offer: keep them for the link
      // that the offer will create.
      if ((d.ice || d.ice_all) && d.l) {
        const key = `${from}:${d.l}`;
        this.orphans = this.orphans || new Map();

        const list = this.orphans.get(key) || [];

        if (list.length < 40) list.push(d);

        this.orphans.set(key, list);

        if (this.orphans.size > 20) this.orphans.delete(this.orphans.keys().next().value);
      }

      return;
    } else if (link.lid && link.lid !== d.l) {
      return;
    }

    if (d.sdp && d.sdp.type === 'offer' && this.orphans) {
      const key = `${from}:${d.l}`;
      const early = this.orphans.get(key);

      if (early) {
        this.orphans.delete(key);
        early.forEach((e) => link.handle(e).catch(() => {}));
      }
    }

    const target = link;

    target.handle(d).catch((e) => {
      syncLog('signal handling failed', target.tag(), e?.name || '', String(e?.message || '').slice(0, 120));
      this.linkDown(target, true, 'signal-error');
    });
  }

  linkUp(link) {
    if (this.stopped || this.links.get(link.peerId) !== link) return;

    this.linkFailed = false;
    this.failureClass = null;
    this.backoff.delete(link.peerId);

    // WebRTC takes over from the relay for this peer.
    if (this.relayActive.has(link.peerId)) this.relayStop(link.peerId, false);

    const info = this.peers.get(link.peerId);

    if (info) info.unlinkedSince = null;

    this.o.onPeerOpen?.(link.peerId);
    this.o.onChange?.();
  }

  // failed=true only after the link exhausted its ICE retry/timeout path.
  linkDown(link, failed, reason = '') {
    if (link.closed && this.links.get(link.peerId) !== link) return;

    const wasOpen = link.open;

    if (failed && !wasOpen) {
      link.failureReport(reason);
      this.failureClass = link.classify();
    } else {
      syncLog('link down', link.tag(), reason, wasOpen ? '(was open)' : '');
    }

    link.close();

    if (this.links.get(link.peerId) === link) this.links.delete(link.peerId);

    if (this.stopped) return;

    if (failed) {
      const n = (this.backoff.get(link.peerId)?.n || 0) + 1;
      const delay = Math.min(LINK_RETRY_BASE_MS * 2 ** (n - 1), LINK_RETRY_MAX_MS);

      this.backoff.set(link.peerId, { n, until: Date.now() + delay });
    }

    if (wasOpen) {
      // Lost an open direct link: let the relay pick the peer up quickly.
      const info = this.peers.get(link.peerId);

      if (info) info.unlinkedSince = Date.now() - RELAY_AFTER_MS + 3000;

      this.o.onPeerClose?.(link.peerId);
    }

    if (failed && this.openPeers.length === 0) this.linkFailed = true;

    this.o.onChange?.();
  }

  onMessage(peerId, type, bytes) {
    if (!this.stopped) this.o.onMessage?.(peerId, type, bytes);
  }

  send(peerId, type, bytes) {
    const link = this.links.get(peerId);

    if (link && link.open) return link.send(type, bytes);

    if (this.relayActive.has(peerId)) return this.relaySend(peerId, type, bytes);

    return Promise.resolve();
  }

  broadcast(type, bytes) {
    return Promise.all(this.openPeers.map((peerId) => this.send(peerId, type, bytes)));
  }
}
