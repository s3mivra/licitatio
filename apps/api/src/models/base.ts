import { Schema } from 'mongoose';
import type { SchemaOptions } from 'mongoose';

export const DATE_ONLY_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};

export const oid = (ref: string, required = true) => ({ type: Schema.Types.ObjectId, ref, required });
export const rev = { type: Number, default: 0 };
