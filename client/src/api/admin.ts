const API_BASE = import.meta.env.VITE_API_URL || "";

let _adminToken = "";

export function setAdminToken(token: string) {
  _adminToken = token;
}
export function hasAdminToken(): boolean {
  return _adminToken.length > 0;
}
export function clearAdminToken() {
  _adminToken = "";
}
function getToken(): string {
  return _adminToken;
}

interface AdminPin {
  _id: string;
  nickname: string;
  city: string;
  country?: string;
  lat: number;
  lng: number;
  comment: string;
  ip: string;
  createdAt: string;
}

interface AdminPinsResponse {
  items: AdminPin[];
  total: number;
  page: number;
  pages: number;
}

export async function fetchAdminPins(params: {
  page?: number;
  search?: string;
  date?: string;
}): Promise<AdminPinsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.search) query.set("search", params.search);
  if (params.date) query.set("date", params.date);

  const res = await fetch(`${API_BASE}/api/admin/pins?${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Failed to fetch pins");
  return res.json();
}

export async function deletePin(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/pins/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Failed to delete pin");
}

export async function banIp(id: string): Promise<{ ip: string; deletedPins: number }> {
  const res = await fetch(`${API_BASE}/api/admin/pins/${id}/ban-ip`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Failed to ban IP");
  return res.json();
}
