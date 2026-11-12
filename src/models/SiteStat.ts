import mongoose, { Document, Model, Schema } from "mongoose";

/**
 * Daily aggregate of public page views. One document per UTC day, so the
 * admin dashboard stays fast no matter how many views the site gets.
 */
export interface IMovieViewCount {
  slug: string;
  title: string;
  count: number;
}

export interface IPathViewCount {
  path: string;
  count: number;
}

export interface IDailyStat extends Document {
  /** UTC date, "YYYY-MM-DD". */
  date: string;
  total: number;
  movies: IMovieViewCount[];
  paths: IPathViewCount[];
}

const MovieViewCountSchema = new Schema<IMovieViewCount>(
  {
    slug: { type: String, required: true },
    title: { type: String, default: "" },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const PathViewCountSchema = new Schema<IPathViewCount>(
  {
    path: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const DailyStatSchema = new Schema<IDailyStat>({
  date: { type: String, required: true, unique: true },
  total: { type: Number, default: 0 },
  movies: { type: [MovieViewCountSchema], default: [] },
  paths: { type: [PathViewCountSchema], default: [] },
});

DailyStatSchema.index({ date: -1 });

export const DailyStat: Model<IDailyStat> =
  mongoose.models.DailyStat ??
  mongoose.model<IDailyStat>("DailyStat", DailyStatSchema);

/**
 * Dedupe record for the 30-minute view window. `hash` is a SHA-256 of
 * (salt + visitor id + path + 30-minute bucket) — no IP or personal data
 * is ever stored. Expires automatically after 1 hour (the window is 30
 * minutes, so 1 hour of retention is plenty).
 */
export interface IViewDedupe extends Document {
  hash: string;
  path: string;
  createdAt: Date;
}

const ViewDedupeSchema = new Schema<IViewDedupe>({
  hash: { type: String, required: true, unique: true },
  path: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

export const ViewDedupe: Model<IViewDedupe> =
  mongoose.models.ViewDedupe ??
  mongoose.model<IViewDedupe>("ViewDedupe", ViewDedupeSchema);
