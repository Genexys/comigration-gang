import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminPins,
  deletePin,
  banIp,
  setAdminToken,
  hasAdminToken,
  clearAdminToken,
} from "../api/admin";
import "./Admin.css";

interface AdminPin {
  _id: string;
  nickname: string;
  city: string;
  comment: string;
  ip: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(hasAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [pins, setPins] = useState<AdminPin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const loadPins = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminPins({ page, search, date: dateFilter });
      setPins(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      if (err instanceof Error && err.message === "unauthorized") {
        clearAdminToken();
        setLoggedIn(false);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, dateFilter]);

  useEffect(() => {
    if (loggedIn) loadPins();
  }, [loggedIn, loadPins]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAdminToken(password);
    try {
      await fetchAdminPins({ page: 1 });
      setLoggedIn(true);
      setLoginError("");
    } catch {
      clearAdminToken();
      setLoginError("Неверный пароль");
    }
  }

  async function handleDelete(id: string, nickname: string) {
    if (!confirm(`Удалить пин от "${nickname}"?`)) return;
    try {
      await deletePin(id);
      loadPins();
    } catch (err) {
      alert("Ошибка удаления");
    }
  }

  async function handleBan(id: string, nickname: string) {
    if (!confirm(`Забанить IP пользователя "${nickname}" и удалить все его пины?`)) return;
    try {
      const result = await banIp(id);
      alert(`IP ${result.ip} забанен. Удалено пинов: ${result.deletedPins}`);
      loadPins();
    } catch (err) {
      alert("Ошибка бана");
    }
  }

  if (!loggedIn) {
    return (
      <div className="admin-login">
        <form onSubmit={handleLogin}>
          <h1>Админка</h1>
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit">Войти</button>
          {loginError && <p className="error">{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="admin-header">
        <h1>Админка</h1>
        <span className="admin-total">{total} пинов</span>
        <button className="admin-logout" onClick={() => { clearAdminToken(); setLoggedIn(false); }}>
          Выйти
        </button>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          placeholder="Поиск по нику..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="select-wrap">
          <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}>
            <option value="all">Все время</option>
            <option value="week">За неделю</option>
            <option value="today">Сегодня</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="admin-loading">Загрузка...</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ник</th>
                <th>Город</th>
                <th>Комментарий</th>
                <th>IP</th>
                <th>Дата</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {pins.map((pin) => (
                <tr key={pin._id}>
                  <td className="cell-nick">{pin.nickname}</td>
                  <td>{pin.city}</td>
                  <td className="cell-comment">{pin.comment || "—"}</td>
                  <td className="cell-ip">{pin.ip}</td>
                  <td className="cell-date">
                    {new Date(pin.createdAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="cell-actions">
                    <button className="btn-del" onClick={() => handleDelete(pin._id, pin.nickname)}>
                      Удалить
                    </button>
                    <button className="btn-ban" onClick={() => handleBan(pin._id, pin.nickname)}>
                      Бан IP
                    </button>
                  </td>
                </tr>
              ))}
              {pins.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32 }}>
                    Пинов нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ←
              </button>
              <span>
                {page} / {pages}
              </span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
