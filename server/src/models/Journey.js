import mongoose from 'mongoose';

const placeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 160 },
    // Filled in Phase 2 when the place is geocoded
    lat: Number,
    lng: Number,
    resolved: String, // what the geocoder matched, so the leader can verify it
  },
  { _id: false }
);

const journeySchema = new mongoose.Schema(
  {
    journeyId: { type: String, required: true, unique: true }, // public, unguessable id used in URLs
    name: { type: String, required: true, trim: true, maxlength: 80 },
    start: { type: placeSchema, required: true },
    destination: { type: placeSchema, required: true },
    journeyDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'active', 'ended'], default: 'planned', index: true },
    leaderVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    joinCode: { type: String, required: true, unique: true },
    joinEnabled: { type: Boolean, default: true },
    joinCodeExpiresAt: { type: Date, required: true },
    maxSeparationKm: { type: Number, default: 5, min: 0.5, max: 100 },
    stopAlertMinutes: { type: Number, default: 10, min: 1, max: 60 },
    route: {
      coordinates: { type: [[Number]], default: undefined }, // [lat, lng][]
      distanceMeters: Number,
      durationSeconds: Number,
    },
    routeStatus: { type: String, enum: ['ok', 'failed'], default: 'failed' },
    routeError: String,
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

export const Journey = mongoose.model('Journey', journeySchema);
