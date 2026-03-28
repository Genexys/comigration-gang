import { ObjectId } from "mongodb";

export interface PinDoc {
  _id?: ObjectId;
  nickname: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  comment: string;
  createdAt: Date;
  ip: string;
}

export interface PinPublic {
  _id: string;
  nickname: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  comment: string;
  createdAt: string;
}

export function toPublic(doc: PinDoc): PinPublic {
  return {
    _id: doc._id!.toString(),
    nickname: doc.nickname,
    city: doc.city,
    country: doc.country,
    lat: doc.lat,
    lng: doc.lng,
    comment: doc.comment,
    createdAt: doc.createdAt.toISOString(),
  };
}
