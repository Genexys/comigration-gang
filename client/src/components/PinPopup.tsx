import type { Pin } from "../types";

interface PinPopupProps {
  pin: Pin;
}

export function PinPopup({ pin }: PinPopupProps) {
  return (
    <div className="pin-popup">
      <div className="nick">{pin.nickname}</div>
      <div className="city">{pin.city}</div>
      {pin.comment && <div className="comment">{pin.comment}</div>}
    </div>
  );
}
