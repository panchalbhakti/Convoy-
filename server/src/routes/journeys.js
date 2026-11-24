import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { Journey } from '../models/Journey.js';
import { Vehicle, VEHICLE_TYPES } from '../models/Vehicle.js';
import { makeJoinCode, makeJourneyId, VEHICLE_COLORS } from '../utils/codes.js';
import { requireMember, requireLeader, signMemberToken } from '../middleware/auth.js';
import { planRoute, RoutingError } from '../services/routing.js';
import { getRuntime } from '../realtime/runtime.js';

const router = Router();

const text = (max) => z.string().trim().min(1, 'Please fill in every field.').max(max);
const memberFields = {
  driverName: text(40),
  vehicleName: text(40),
  vehicleType: z.enum(VEHICLE_TYPES),
};
const createSchema = z.object({
  name: text(80),
  start: text(160),
  destination: text(160),
  journeyDate: z.coerce.date({ errorMap: () => ({ message: 'Choose a journey date.' }) }),
  ...memberFields,
});
const joinSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'Enter the 6-character code.'),
  ...memberFields,
});

const expiry = () => new Date(Date.now() + config.joinCodeTtlHours * 3600 * 1000);
const inviteLink = (code) => `${config.clientOrigin}/join/${code}`;

function parse(schema, body, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message, field: result.error.issues[0].path[0] });
    return null;
  }
  return result.data;
}

const publicMember = (v) => ({
  id: String(v._id),
  driverName: v.driverName,
  vehicleName: v.vehicleName,
  vehicleType: v.vehicleType,
  color: v.color,
  isLeader: v.isLeader,
  sharingStatus: v.sharingStatus,
});

const place = (p) => ({ label: p.label, resolved: p.resolved, lat: p.lat, lng: p.lng });

const publicJourney = (j, isLeader) => ({
  journeyId: j.journeyId,
  name: j.name,
  start: place(j.start),
  destination: place(j.destination),
  journeyDate: j.journeyDate,
  status: j.status,
  maxSeparationKm: j.maxSeparationKm,
  stopAlertMinutes: j.stopAlertMinutes,
  routeStatus: j.routeStatus,
  routeError: j.routeError,
  routeDistanceM: j.route?.distanceMeters,
  startedAt: j.startedAt,
  ...(isLeader && {
    joinCode: j.joinCode,
    joinEnabled: j.joinEnabled,
    joinCodeExpiresAt: j.joinCodeExpiresAt,
    inviteLink: inviteLink(j.joinCode),
  }),
});

const codeIsUsable = (j) => j && j.status !== 'ended' && j.joinEnabled && j.joinCodeExpiresAt > new Date();
const BAD_CODE = 'This code is not valid. Ask the Journey Leader for a new one.';

// Create a journey; the creator becomes the Journey Leader
router.post('/', async (req, res, next) => {
  try {
    const data = parse(createSchema, req.body, res);
    if (!data) return;

    // Plan the shared route. An unknown place is the user's typo, so ask them to fix it;
    // a routing-service outage should not stop the trip being created.
    let plan = null;
    let routeError = null;
    try {
      plan = await planRoute(data.start, data.destination);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
      if (e.code === 'NOT_FOUND') return res.status(422).json({ error: e.message, field: e.field });
      routeError = e.message;
    }

    // Retry on the rare join-code collision
    let journey;
    for (let attempt = 0; attempt < 5 && !journey; attempt++) {
      try {
        journey = await Journey.create({
          journeyId: makeJourneyId(),
          name: data.name,
          start: plan ? { label: data.start, ...plan.start } : { label: data.start },
          destination: plan ? { label: data.destination, ...plan.destination } : { label: data.destination },
          journeyDate: data.journeyDate,
          ...(plan
            ? { route: { coordinates: plan.coords, distanceMeters: plan.distanceM, durationSeconds: plan.durationS }, routeStatus: 'ok' }
            : { routeStatus: 'failed', routeError }),
          joinCode: makeJoinCode(),
          joinCodeExpiresAt: expiry(),
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
    if (!journey) return res.status(503).json({ error: 'Could not create the journey. Try again.' });

    const leader = await Vehicle.create({
      journeyRef: journey._id,
      driverName: data.driverName,
      vehicleName: data.vehicleName,
      vehicleType: data.vehicleType,
      color: VEHICLE_COLORS[0],
      isLeader: true,
    });
    journey.leaderVehicleId = leader._id;
    await journey.save();

    res.status(201).json({
      token: signMemberToken(leader, journey),
      me: publicMember(leader),
      journey: publicJourney(journey, true),
    });
  } catch (err) {
    next(err);
  }
});

// Minimal public preview so a person opening an invite link can see what they are joining.
// Reveals no locations and no member names.
router.get('/preview/:code', async (req, res, next) => {
  try {
    const j = await Journey.findOne({ joinCode: req.params.code.toUpperCase() });
    if (!codeIsUsable(j)) return res.status(404).json({ error: BAD_CODE });
    res.json({ name: j.name, start: j.start.label, destination: j.destination.label, journeyDate: j.journeyDate });
  } catch (err) {
    next(err);
  }
});

// Join with a code (typed, from a link, or from a QR code - all carry the same code)
router.post('/join', async (req, res, next) => {
  try {
    const data = parse(joinSchema, req.body, res);
    if (!data) return;
    const j = await Journey.findOne({ joinCode: data.code });
    if (!codeIsUsable(j)) return res.status(404).json({ error: BAD_CODE });

    const count = await Vehicle.countDocuments({ journeyRef: j._id, removed: false });
    if (count >= 30) return res.status(409).json({ error: 'This journey is full (30 vehicles).' });

    const vehicle = await Vehicle.create({
      journeyRef: j._id,
      driverName: data.driverName,
      vehicleName: data.vehicleName,
      vehicleType: data.vehicleType,
      color: VEHICLE_COLORS[count % VEHICLE_COLORS.length],
    });
    getRuntime(j.journeyId)?.syncVehicle(vehicle);
    res.status(201).json({
      token: signMemberToken(vehicle, j),
      me: publicMember(vehicle),
      journey: publicJourney(j, false),
    });
  } catch (err) {
    next(err);
  }
});

// Journey details + members: members only
router.get('/:journeyId', requireMember, async (req, res, next) => {
  try {
    const members = await Vehicle.find({ journeyRef: req.journey._id, removed: false }).sort('createdAt');
    res.json({
      me: publicMember(req.vehicle),
      journey: publicJourney(req.journey, req.vehicle.isLeader),
      members: members.map(publicMember),
    });
  } catch (err) {
    next(err);
  }
});

// Leader: create a fresh code (the old code and link stop working immediately)
router.post('/:journeyId/code/regenerate', requireMember, requireLeader, async (req, res, next) => {
  try {
    req.journey.joinCode = makeJoinCode();
    req.journey.joinEnabled = true;
    req.journey.joinCodeExpiresAt = expiry();
    await req.journey.save();
    res.json({ journey: publicJourney(req.journey, true) });
  } catch (err) {
    next(err);
  }
});

// Leader: pause or resume joining
router.post('/:journeyId/code/enabled', requireMember, requireLeader, async (req, res, next) => {
  try {
    const data = parse(z.object({ enabled: z.boolean() }), req.body, res);
    if (!data) return;
    req.journey.joinEnabled = data.enabled;
    await req.journey.save();
    res.json({ journey: publicJourney(req.journey, true) });
  } catch (err) {
    next(err);
  }
});

// Leave the journey
router.post('/:journeyId/leave', requireMember, async (req, res, next) => {
  try {
    if (req.vehicle.isLeader) return res.status(400).json({ error: 'The leader ends the journey instead of leaving.' });
    req.vehicle.removed = true;
    req.vehicle.sharingStatus = 'off';
    req.vehicle.currentLocation = undefined;
    await req.vehicle.save();
    getRuntime(req.journey.journeyId)?.removeMember(String(req.vehicle._id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Leader controls ----
const settingsSchema = z.object({
  maxSeparationKm: z.number().min(0.5, 'Use at least 0.5 km.').max(100, 'Use 100 km or less.').optional(),
  stopAlertMinutes: z.number().int().min(1).max(60).optional(),
});

function useRoutePlan(journey, plan) {
  journey.start = { ...plan.start, label: journey.start.label };
  journey.destination = { ...plan.destination, label: journey.destination.label };
  journey.route = { coordinates: plan.coords, distanceMeters: plan.distanceM, durationSeconds: plan.durationS };
  journey.routeStatus = 'ok';
  journey.routeError = undefined;
}

const startPlace = (j, vehicle) => {
  if (j.start?.lat != null) return { label: j.start.label, lat: j.start.lat, lng: j.start.lng, resolved: j.start.resolved };
  if (vehicle?.currentLocation?.lat != null) return { label: j.start?.label || 'Current location', lat: vehicle.currentLocation.lat, lng: vehicle.currentLocation.lng, resolved: 'Current location' };
  return j.start?.label || 'Ahmedabad';
};

async function replan(req, res, next, destinationLabel) {
  try {
    const j = req.journey;
    const dest = destinationLabel ?? (j.destination.lat != null
      ? { label: j.destination.label, lat: j.destination.lat, lng: j.destination.lng, resolved: j.destination.resolved }
      : j.destination.label);
    let plan;
    try {
      plan = await planRoute(startPlace(j, req.vehicle), dest);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
      if (e.code === 'NOT_FOUND') return res.status(422).json({ error: e.message, field: e.field });
      if (destinationLabel == null) { j.routeStatus = j.route?.coordinates?.length ? j.routeStatus : 'failed'; j.routeError = e.message; await j.save(); }
      return res.status(502).json({ error: e.message });
    }
    if (destinationLabel != null) j.destination.label = destinationLabel;
    useRoutePlan(j, plan);
    await j.save();
    const rt = getRuntime(j.journeyId);
    if (rt) { rt.applyJourney(j); rt.tick(); }
    res.json({ journey: publicJourney(j, true) });
  } catch (err) {
    next(err);
  }
}

router.patch('/:journeyId/settings', requireMember, requireLeader, async (req, res, next) => {
  try {
    const data = parse(settingsSchema, req.body, res);
    if (!data) return;
    if (data.maxSeparationKm != null) req.journey.maxSeparationKm = data.maxSeparationKm;
    if (data.stopAlertMinutes != null) req.journey.stopAlertMinutes = data.stopAlertMinutes;
    await req.journey.save();
    const rt = getRuntime(req.journey.journeyId);
    if (rt) { rt.applyJourney(req.journey); rt.tick(); }
    res.json({ journey: publicJourney(req.journey, true) });
  } catch (err) {
    next(err);
  }
});

router.post('/:journeyId/route/retry', requireMember, requireLeader, (req, res, next) => replan(req, res, next, null));

router.post('/:journeyId/destination', requireMember, requireLeader, async (req, res, next) => {
  const data = parse(z.object({ destination: text(160) }), req.body, res);
  if (!data) return;
  return replan(req, res, next, data.destination);
});

router.delete('/:journeyId/members/:vehicleId', requireMember, requireLeader, async (req, res, next) => {
  try {
    const v = await Vehicle.findOne({ _id: req.params.vehicleId, journeyRef: req.journey._id, removed: false }).catch(() => null);
    if (!v) return res.status(404).json({ error: 'That participant is not in this journey.' });
    if (v.isLeader) return res.status(400).json({ error: 'You cannot remove yourself. End the journey instead.' });
    if (v.simulated) return res.status(400).json({ error: 'Stop testing mode to remove simulated vehicles.' });
    v.removed = true;
    v.sharingStatus = 'off';
    v.currentLocation = undefined;
    await v.save();
    getRuntime(req.journey.journeyId)?.removeMember(String(v._id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:journeyId/end', requireMember, requireLeader, async (req, res, next) => {
  try {
    const j = req.journey;
    j.status = 'ended';
    j.endedAt = new Date();
    j.joinEnabled = false;
    await j.save();
    const rt = getRuntime(j.journeyId);
    if (rt) await rt.endJourney();
    else await Vehicle.updateMany({ journeyRef: j._id }, { $unset: { currentLocation: 1, sos: 1 }, sharingStatus: 'off' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
