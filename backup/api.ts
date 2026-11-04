export interface RecordItem {
  id: number;
  no: string;
  name: string;
  dob: string;
  country: string;
  sex: string;
  adopters: string;
  adopters_address?: string;
  adopters_occupation?: string;
  adoption: string;
  court: string;
  entered: string;
  officer?: string;
  designation?: string;
  signature?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserItem {
  id: number;
  name: string;
  employee_id: string;
  role: string;
  status: string;
  last_login?: string;
  email?: string;
}

export interface ActivityItem {
  id: number;
  timestamp: string;
  user_name: string;
  action: string;
  record_no: string;
  description: string;
}

export interface KPIStats {
  totalRecords: string;
  addedThisMonth: number;
  updatedThisMonth: number;
  recentEntries: number;
}

const API_BASE = "/api";

export const api = {
  // Records
  async getRecords(params?: { q?: string; sex?: string; country?: string; court?: string; status?: string }): Promise<RecordItem[]> {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.sex) query.set("sex", params.sex);
    if (params?.country) query.set("country", params.country);
    if (params?.court) query.set("court", params.court);
    if (params?.status) query.set("status", params.status);

    const res = await fetch(`${API_BASE}/records?${query.toString()}`);
    const data = await res.json();
    return data.records || [];
  },

  async getRecord(no: string): Promise<RecordItem | null> {
    const res = await fetch(`${API_BASE}/records/${no}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.record || null;
  },

  async createRecord(record: Partial<RecordItem>): Promise<RecordItem> {
    const res = await fetch(`${API_BASE}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create record");
    return data.record;
  },

  async updateRecord(no: string, record: Partial<RecordItem>): Promise<RecordItem> {
    const res = await fetch(`${API_BASE}/records/${no}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update record");
    return data.record;
  },

  async archiveRecord(no: string, user: string = "Jane Mwangi"): Promise<void> {
    const res = await fetch(`${API_BASE}/records/${no}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to archive record");
    }
  },

  // Reports
  async getKPIs(): Promise<KPIStats> {
    const res = await fetch(`${API_BASE}/reports/kpis`);
    const data = await res.json();
    return data.kpis;
  },

  async getAnnualSex(): Promise<{ year: string; female: number; male: number }[]> {
    const res = await fetch(`${API_BASE}/reports/annual-sex`);
    const data = await res.json();
    return data.data || [];
  },

  // Users
  async getUsers(): Promise<UserItem[]> {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    return data.users || [];
  },

  async createUser(user: Partial<UserItem>): Promise<UserItem> {
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create user");
    return data.user;
  },

  // Activity
  async getActivity(filter?: { user?: string; action?: string; entry?: string }): Promise<ActivityItem[]> {
    const query = new URLSearchParams();
    if (filter?.user) query.set("user", filter.user);
    if (filter?.action) query.set("action", filter.action);
    if (filter?.entry) query.set("entry", filter.entry);

    const res = await fetch(`${API_BASE}/activity?${query.toString()}`);
    const data = await res.json();
    return data.activity || [];
  },

  // Auth
  async login(employee_id: string, password: string): Promise<UserItem> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    return data.user;
  },

  async getMe(): Promise<UserItem | null> {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  }
};
