import { useState } from "react";

interface HeaderProps {
  totalCount: number;
}

export function Header({ totalCount }: HeaderProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <>
      <div className="header">
        <div className="logo-block">
          <img className="logo-icon" src="/logo.jpg" alt="CO" />
          <div className="logo-text">
            <span>КОМИ</span>ГРАЦИЯ
          </div>
        </div>
        <div className="header-right">
          <button
            className="info-btn"
            onClick={() => setInfoOpen(true)}
            title="Информация"
            aria-label="Информация о сервисе"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <circle cx="12" cy="8" r="0.5" fill="currentColor" />
            </svg>
          </button>
          <div className="stats-bar">
            <div className="pulse" />
            <span className="count">{totalCount}</span>
            <span className="label">на карте</span>
          </div>
        </div>
      </div>

      {infoOpen && (
        <div
          className="modal-overlay active"
          onClick={(e) => e.target === e.currentTarget && setInfoOpen(false)}
        >
          <div className="modal info-modal">
            <h2 className="info-title">Информация</h2>

            <div className="info-section">
              <h3>Сбор и обработка данных</h3>
              <p>
                Сервис собирает минимальный объём данных, необходимый для
                функционирования интерактивной карты. При добавлении отметки
                сохраняются: никнейм, выбранная точка на карте (координаты) и
                необязательный комментарий.
              </p>
            </div>

            <div className="info-section">
              <h3>Анонимность</h3>
              <p>
                Мы не требуем регистрации, электронной почты или иных
                персональных данных. Никнейм выбирается произвольно и не связан
                с реальной личностью пользователя. Отметка на карте отражает
                только приблизительное географическое местоположение.
              </p>
            </div>

            <div className="info-section">
              <h3>IP-адреса</h3>
              <p>
                IP-адрес фиксируется исключительно в целях противодействия
                злоупотреблениям (спам, повторные нарушения). Данные IP-адресов
                автоматически и безвозвратно удаляются через 30 дней с момента
                создания отметки. IP-адреса не передаются третьим лицам и не
                используются для идентификации пользователей.
              </p>
            </div>

            <div className="info-section">
              <h3>Удаление данных</h3>
              <p>
                Вы можете запросить удаление своей отметки в любое время,
                обратившись к администратору сервиса.
              </p>
            </div>

            <div className="info-section">
              <p className="info-dim">
                Подробнее —{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Политика конфиденциальности
                </a>
              </p>
            </div>

            <button className="btn-submit" onClick={() => setInfoOpen(false)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
