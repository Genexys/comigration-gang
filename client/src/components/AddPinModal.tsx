import { useState, useRef, useEffect } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface AddPinModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (nickname: string, comment: string, turnstileToken: string | null) => void;
  existingNicknames?: string[];
}

export function AddPinModal({ open, onClose, onSubmit, existingNicknames = [] }: AddPinModalProps) {
  const [nickname, setNickname] = useState("");
  const [comment, setComment] = useState("");
  const [nickError, setNickError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const nickRef = useRef<HTMLInputElement>(null);

  const nickExists = nickname.trim().length >= 2 &&
    existingNicknames.some(n => n.toLowerCase() === nickname.trim().toLowerCase());

  useEffect(() => {
    if (open) {
      setNickname("");
      setComment("");
      setNickError(false);
      setTurnstileToken(null);
      setTurnstileError(false);
      setTimeout(() => nickRef.current?.focus(), 100);
    }
  }, [open]);

  function handleSubmit() {
    const trimmed = nickname.trim();
    if (trimmed.length < 2) {
      setNickError(true);
      nickRef.current?.focus();
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setTurnstileError(true);
      return;
    }
    onSubmit(trimmed, comment.trim(), turnstileToken);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-overlay active" onClick={handleOverlayClick}>
      <div className="modal">
        <h2>Отметься на карте</h2>
        <p className="subtitle">Покажи откуда ты смотришь</p>
        <div className="field">
          <label>Никнейм</label>
          <input
            ref={nickRef}
            type="text"
            placeholder="Твой ник"
            maxLength={30}
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setNickError(false);
            }}
            style={nickError ? { borderColor: "var(--accent)" } : undefined}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          {nickExists && (
            <div className="hint" style={{ color: "var(--accent-2)" }}>
              ⚠️ Такой ник уже есть на карте
            </div>
          )}
        </div>
        <div className="field">
          <label>Комментарий</label>
          <textarea
            placeholder="Смотрю с первого выпуска!"
            maxLength={200}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="hint">Необязательно · до 200 символов</div>
        </div>
        {TURNSTILE_SITE_KEY && (
          <div className="field">
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={(token) => { setTurnstileToken(token); setTurnstileError(false); }}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
              options={{ theme: "dark" }}
            />
            {turnstileError && (
              <div className="hint" style={{ color: "#ff4444" }}>Пройди проверку выше</div>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-submit" onClick={handleSubmit}>
            Поставить 📍
          </button>
        </div>
      </div>
    </div>
  );
}
