import mongoose, { Document, Model, Schema } from "mongoose";

/**
 * Daily aggregate of link clicks (download links + Watch Online button).
 * One document per UTC day, so the admin dashboard stays fast.
 */
export interface ILinkClickCount {
  /** Stable key: slug|type|quality|host|season|episode */
  key: string;
  slug: string;
  title: string;
  /** "download" or "watch-online" */
  type: string;
  quality: string;
  host: string;
  season: number | null;
  episode: number | null;
  count: number;
}

export interface IDailyClickStat extends Document {
  /** UTC date, "YYYY-MM-DD". */
  date: string;
  total: number;
  links: ILinkClickCount[];
}

const LinkClickCountSchema = new Schema<ILinkClickCount>(
  {
    key: { type: String, required: true },
    slug: { type: String, required: true },
    title: { type: String, default: "" },
    type: { type: String, default: "download" },
    quality: { type: String, default: "" },
    host: { type: String, default: "" },
    season: { type: Number, default: null },
    episode: { type: Number, default: null },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const DailyClickStatSchema = new Schema<IDailyClickStat>({
  date: { type: String, required: true, unique: true },
  total: { type: Number, default: 0 },
  links: { type: [LinkClickCountSchema], default: [] },
});

DailyClickStatSchema.index({ date: -1 });

export const DailyClickStat: Model<IDailyClickStat> =
  mongoose.models.DailyClickStat ??
  mongoose.model<IDailyClickStat>("DailyClickStat", DailyClickStatSchema);

/**
 * Dedupe record for the ~10-second click window (guards against an
 * accidental double-fire of the same click). `hash` is a SHA-256 of
 * (salt + visitor id + link key + 10-second bucket) — no IP or personal
 * data is ever stored. Expires automatically after 2 minutes.
 */
export interface IClickDedupe extends Document {
  hash: string;
  createdAt: Date;
}

const ClickDedupeSchema = new Schema<IClickDedupe>({
  hash: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 120 },
});

export const ClickDedupe: Model<IClickDedupe> =
  mongoose.models.ClickDedupe ??
  mongoose.model<IClickDedupe>("ClickDedupe", ClickDedupeSchema);
