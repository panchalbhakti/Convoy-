import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Journey } from '../models/Journey.js';
import { Vehicle } from '../models/Vehicle.js';

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const signMemberToken = (vehicle, journey) =>
  jwt.sign({ vid: String(vehicle._id), jid: journey.journeyId }, config.jwtSecret, { expiresIn: '14d' });

/** Shared by REST and Socket.IO: only an authorised, non-removed member of THIS journey passes. */
export async function authenticate(token, journeyId) {
  if (!token) throw new AuthError(401, 'Join this journey first.');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AuthError(401, 'Your session expired. Join the journey again.');
  }
  if (payload.jid !== journeyId) throw new AuthError(403, 'You are not a member of this journey.');
  const [journey, vehicle] = await Promise.all([Journey.findOne({ journeyId: payload.jid }), Vehicle.findById(payload.vid)]);
  if (!journey || !vehicle || vehicle.removed || String(vehicle.journeyRef) !== String(journey._id)) {
    throw new AuthError(403, 'You have been removed from this journey or it no longer exists.');
  }
  return { journey, vehicle };
}

export async function requireMember(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const { journey, vehicle } = await authenticate(token, req.params.journeyId);
    req.journey = journey;
    req.vehicle = vehicle;
    next();
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

export function requireLeader(req, res, next) {
  if (!req.vehicle?.isLeader) return res.status(403).json({ error: 'Only the Journey Leader can do this.' });
  next();
}
