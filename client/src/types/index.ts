export interface Pin {
  _id: string;
  nickname: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  comment: string;
  createdAt: string;
}

export interface CreatePinPayload {
  nickname: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  comment: string;
  turnstileToken?: string;
}
