import { Server } from 'socket.io';
import { config } from '../config.js';
import { authenticate, AuthError } from '../middleware/auth.js';
import { ensureRuntime, hub } from './runtime.js';

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

function sanitizeLocation(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = num(p.lat, -90, 90);
  const lng = num(p.lng, -180, 180);
  if (lat == null || lng == null) return null;
  return {
    lat,
    lng,
    accuracy: num(p.accuracy, 0, 100_000),
    speed: num(p.speed, 0, 120), // m/s
    heading: num(p.heading, 0, 360),
  };
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin },
    pingInterval: 10_000,
    pingTimeout: 10_000, // a dead connection is noticed in ~20 s
    maxHttpBufferSize: 1e5,
  });
  hub.io = io;

  io.use(async (socket, next) => {
    try {
      const { token, journeyId } = socket.handshake.auth || {};
      const { journey, vehicle } = await authenticate(token, journeyId);
      if (journey.status === 'ended') return next(new Error('ended'));
      socket.data = { journeyId, vehicleId: String(vehicle._id), isLeader: vehicle.isLeader, vehicle };
      next();
    } catch (err) {
      next(new Error(err instanceof AuthError ? 'unauthorized' : 'server_error'));
    }
  });

  io.on('connection', (socket) => {
    const { journeyId, vehicleId, isLeader, vehicle } = socket.data;
    let rt = null;
    let lastLocAt = 0;

    // Only members of this journey ever join its room, so only they receive its locations.
    socket.join(`journey:${journeyId}`);
    ensureRuntime(journeyId)
      .then((r) => {
        if (socket.disconnected) return;
        rt = r;
        rt.connect(socket, vehicle);
        socket.emit('init', rt.initPayload());
      })
      .catch(() => socket.disconnect(true));

    socket.on('location:update', (payload) => {
      if (!rt) return;
      const now = Date.now();
      if (now - lastLocAt < 900) return; // rate limit
      lastLocAt = now;
      const loc = sanitizeLocation(payload);
      if (loc) rt.ingest(vehicleId, loc, now);
    });
    socket.on('route:request', () => rt && socket.emit('route', rt.display));
    socket.on('sharing:stop', () => rt?.setSharing(vehicleId, 'off'));
    socket.on('sharing:denied', () => rt?.setSharing(vehicleId, 'denied'));
    socket.on('sos:start', () => rt?.triggerSos(vehicleId));
    socket.on('sos:cancel', (p) => {
      if (!rt) return;
      const target = isLeader && p?.vehicleId ? String(p.vehicleId) : vehicleId;
      rt.cancelSos(target);
    });

    const leaderOnly = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!rt || !isLeader) return reply({ ok: false, error: 'Only the Journey Leader can do this.' });
      try {
        await fn();
        reply({ ok: true });
      } catch (err) {
        reply({ ok: false, error: err.message });
      }
    };
    socket.on('sim:start', leaderOnly(() => rt.startSimulation()));
    socket.on('sim:stop', leaderOnly(() => rt.stopSimulation()));

    socket.on('disconnect', () => rt?.disconnect(socket));
  });

  return io;
}
