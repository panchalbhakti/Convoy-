import { JourneyEngine } from '../engine.js';
import { buildRoute, simplifyForDisplay } from '../geo.js';
import { Journey } from '../models/Journey.js';
import { Vehicle } from '../models/Vehicle.js';
import { LocationPoint } from '../models/LocationPoint.js';
import { VEHICLE_COLORS } from '../utils/codes.js';
import { Simulator, FLEET } from './simulator.js';
import { config } from '../config.js';

/** Set by initSocket(). */
export const hub = { io: null };

const runtimes = new Map(); // journeyId -> Runtime (only journeys with people connected)
const loading = new Map();
const room = (id) => `journey:${id}`;
const log = (err) => console.error('[realtime]', err?.message || err);

const metaOf = (v) => ({
  id: String(v._id),
  vehicleName: v.vehicleName,
  driverName: v.driverName,
  vehicleType: v.vehicleType,
  color: v.color,
  isLeader: v.isLeader,
  simulated: !!v.simulated,
});

export const getRuntime = (journeyId) => runtimes.get(journeyId);

export async function ensureRuntime(journeyId) {
  const existing = runtimes.get(journeyId);
  if (existing) return existing;
  if (!loading.has(journeyId)) {
    loading.set(
      journeyId,
      (async () => {
        const journey = await Journey.findOne({ journeyId });
        if (!journey) throw new Error('Journey not found');
        const vehicles = await Vehicle.find({ journeyRef: journey._id, removed: false });
        const rt = new Runtime(journey, vehicles);
        runtimes.set(journeyId, rt);
        return rt;
      })().finally(() => loading.delete(journeyId))
    );
  }
  return loading.get(journeyId);
}

class Runtime {
  constructor(journey, vehicles) {
    this.journeyId = journey.journeyId;
    this.dbId = journey._id;
    this.status = journey.status;
    this.startedAt = journey.startedAt ? journey.startedAt.getTime() : null;
    this.alerts = [];
    this.sockets = new Map(); // vehicleId -> Set(socketId)
    this.connCount = 0;
    this.timer = null;
    this.idleTimer = null;
    this.sim = null;
    this.routeVersion = 0;
    this.persistedAt = new Map();
    this.engine = new JourneyEngine({ startedAt: this.startedAt });
    this.applyJourney(journey);
    for (const v of vehicles) {
      this.engine.upsertVehicle(metaOf(v));
      if (v.sos?.active) {
        this.engine.restoreSos(String(v._id), { at: v.sos.at?.getTime() ?? Date.now(), lat: v.sos.lat ?? null, lng: v.sos.lng ?? null, locAt: null });
      }
    }
  }

  /** (Re)load route + settings from the journey document. */
  applyJourney(j) {
    this.routeStatus = j.routeStatus;
    this.routeError = j.routeError || null;
    const coords = (j.route?.coordinates || []).map((c) => [c[0], c[1]]);
    const route = coords.length > 1 ? buildRoute(coords, j.route.durationSeconds) : null;
    this.engine.setRoute(route);
    this.engine.setSettings({ maxSeparationM: j.maxSeparationKm * 1000, stopAlertMs: j.stopAlertMinutes * 60_000 });
    this.display = route
      ? {
          coords: simplifyForDisplay(coords),
          distanceM: route.totalM,
          start: { lat: j.start.lat, lng: j.start.lng, label: j.start.label },
          destination: { lat: j.destination.lat, lng: j.destination.lng, label: j.destination.label },
        }
      : null;
    this.routeVersion += 1;
    this.emit('route', this.display); // everyone connected redraws the new route
  }

  emit(event, payload) {
    hub.io?.to(room(this.journeyId)).emit(event, payload);
  }

  pushAlert(a) {
    this.alerts.push(a);
    if (this.alerts.length > 40) this.alerts.shift();
    this.emit('alert', a);
  }

  snapshot(now = Date.now()) {
    const { snapshot, alerts } = this.engine.evaluate(now);
    snapshot.journey = {
      status: this.status,
      startedAt: this.startedAt,
      routeStatus: this.routeStatus,
      routeError: this.routeError,
      routeVersion: this.routeVersion,
    };
    snapshot.simulation = { allowed: config.allowSimulation, running: !!this.sim };
    return { snapshot, alerts };
  }

  tick() {
    const { snapshot, alerts } = this.snapshot();
    alerts.forEach((a) => this.pushAlert(a));
    this.emit('state', snapshot);
  }

  startTick() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 2000);
  }

  stopTick() {
    clearInterval(this.timer);
    this.timer = null;
  }

  initPayload() {
    const { snapshot, alerts } = this.snapshot();
    alerts.forEach((a) => this.pushAlert(a));
    return {
      serverNow: Date.now(),
      route: this.display,
      routeVersion: this.routeVersion,
      alerts: this.alerts.slice(-30),
      state: snapshot,
    };
  }

  // ---- connections ----
  connect(socket, vehicle) {
    const vid = String(vehicle._id);
    this.engine.upsertVehicle(metaOf(vehicle));
    if (!this.sockets.has(vid)) this.sockets.set(vid, new Set());
    this.sockets.get(vid).add(socket.id);
    this.engine.setConnected(vid, true);
    this.connCount += 1;
    clearTimeout(this.idleTimer);
    this.startTick();
  }

  disconnect(socket) {
    const vid = socket.data.vehicleId;
    const set = this.sockets.get(vid);
    if (!set || !set.delete(socket.id)) return;
    if (set.size === 0) {
      this.sockets.delete(vid);
      this.engine.setConnected(vid, false);
    }
    this.connCount -= 1;
    if (this.connCount <= 0) {
      this.stopTick();
      // Keep state a minute so a page refresh does not lose timers or stop a running simulation.
      this.idleTimer = setTimeout(() => this.destroy(), 60_000);
    } else {
      this.tick();
    }
  }

  async destroy() {
    if (this.connCount > 0) return;
    this.stopTick();
    await this.stopSimulation().catch(log);
    runtimes.delete(this.journeyId);
  }

  // ---- location ----
  ingest(vehicleId, loc, now = Date.now(), { simulated = false } = {}) {
    const rec = this.engine.ingest(vehicleId, loc, now);
    if (!rec) return;
    if (!this.startedAt) {
      this.startedAt = now;
      this.engine.startedAt = now;
      this.status = 'active';
      Journey.updateOne({ _id: this.dbId }, { status: 'active', startedAt: new Date(now) }).catch(log);
    }
    if (simulated) return;
    if (now - (this.persistedAt.get(vehicleId) || 0) >= 5000) {
      this.persistedAt.set(vehicleId, now);
      Vehicle.updateOne(
        { _id: vehicleId },
        { currentLocation: rec.loc, lastUpdatedAt: new Date(now), sharingStatus: 'sharing' }
      ).catch(log);
      LocationPoint.create({
        vehicleRef: vehicleId,
        journeyRef: this.dbId,
        lat: loc.lat,
        lng: loc.lng,
        speed: rec.loc.speed ?? undefined,
        accuracy: rec.loc.accuracy ?? undefined,
        timestamp: new Date(now),
      }).catch(log);
    }
  }

  setSharing(vehicleId, state) {
    this.engine.setSharing(vehicleId, state);
    Vehicle.updateOne({ _id: vehicleId }, { sharingStatus: state }).catch(log);
    this.tick();
  }

  // ---- SOS ----
  triggerSos(vehicleId) {
    const alert = this.engine.triggerSos(vehicleId, Date.now());
    if (!alert) return;
    this.pushAlert(alert);
    const loc = alert.location;
    Vehicle.updateOne({ _id: vehicleId }, { sos: { active: true, at: new Date(), lat: loc?.lat, lng: loc?.lng } }).catch(log);
    this.tick();
  }

  cancelSos(vehicleId) {
    const alert = this.engine.clearSos(vehicleId, Date.now());
    if (!alert) return;
    this.pushAlert(alert);
    Vehicle.updateOne({ _id: vehicleId }, { $unset: { sos: 1 } }).catch(log);
    this.tick();
  }

  // ---- leader actions ----
  syncVehicle(v) {
    this.engine.upsertVehicle(metaOf(v));
  }

  removeMember(vehicleId) {
    this.engine.removeVehicle(vehicleId);
    for (const id of this.sockets.get(vehicleId) || []) {
      const s = hub.io?.sockets.sockets.get(id);
      s?.emit('removed');
      s?.disconnect(true);
    }
    this.tick();
  }

  async endJourney() {
    this.status = 'ended';
    this.stopTick();
    await this.stopSimulation().catch(log);
    this.emit('journey:ended');
    // Location sharing ends with the journey: wipe live positions.
    await Vehicle.updateMany(
      { journeyRef: this.dbId },
      { $unset: { currentLocation: 1, sos: 1 }, sharingStatus: 'off' }
    ).catch(log);
    setTimeout(() => hub.io?.in(room(this.journeyId)).disconnectSockets(true), 800);
    runtimes.delete(this.journeyId);
  }

  async startSimulation() {
    if (!config.allowSimulation) throw new Error('Testing mode is turned off on this server.');
    const route = this.engine.route;
    if (!route) throw new Error('Testing mode needs a planned route. Add or retry the route first.');
    if (this.sim) return;
    await this.stopSimulation();
    const existing = await Vehicle.countDocuments({ journeyRef: this.dbId, removed: false });
    const docs = await Vehicle.insertMany(
      FLEET.map((spec, i) => ({
        journeyRef: this.dbId,
        vehicleName: spec.vehicleName,
        driverName: spec.driverName,
        vehicleType: spec.vehicleType,
        color: VEHICLE_COLORS[(existing + i) % VEHICLE_COLORS.length],
        simulated: true,
        sharingStatus: 'sharing',
      }))
    );
    const vehicles = docs.map((d, i) => {
      this.engine.upsertVehicle(metaOf(d));
      return { id: String(d._id), spec: FLEET[i] };
    });
    this.sim = new Simulator({
      target: {
        ingest: (id, loc, now) => this.ingest(id, loc, now, { simulated: true }),
        setConnected: (id, c) => this.engine.setConnected(id, c),
      },
      route,
      vehicles,
      stopAlertMs: this.engine.stopAlertMs,
    });
    this.sim.start();
    this.tick();
  }

  async stopSimulation() {
    this.sim?.stop();
    this.sim = null;
    const docs = await Vehicle.find({ journeyRef: this.dbId, simulated: true }, '_id');
    docs.forEach((d) => this.engine.removeVehicle(String(d._id)));
    if (docs.length) await Vehicle.deleteMany({ journeyRef: this.dbId, simulated: true });
    if (this.connCount > 0) this.tick();
  }
}
