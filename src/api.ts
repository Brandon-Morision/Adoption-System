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
  version?: number;
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
  mustChangePassword?: boolean;
}

export interface ActivityItem {
  id: number;
  timestamp: string;
  user_name: string;
  action: string;
  record_no: string;
  description: string;
  prev_hash?: string;
  hash?: string;
}

export interface KPIStats {
  totalRecords: string;
  addedThisMonth: number;
  updatedThisMonth: number;
  recentEntries: number;
}

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string;
  integrity: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  totalChecked: number;
  brokenAtId?: number;
  error?: string;
}

const API_BASE = "/api";
const TOKEN_STORAGE_KEY = "aods_auth_token";

let inMemoryToken: string | null = null;

type SessionExpiredHandler = (message?: string) => void;
const sessionExpiredHandlers = new Set<SessionExpiredHandler>();

export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

export function notifySessionExpired(message: string = "Your session expired due to inactivity. Please log in again."): void {
  setStoredToken(null);
  sessionExpiredHandlers.forEach(h => {
    try { h(message); } catch {}
  });
}

export function getStoredToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  // Anti-CSRF protection header
  headers.set("X-Requested-With", "AODS");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      setStoredToken(null);
      if (data.code === "SESSION_EXPIRED" || (data.error && data.error.includes("inactivity"))) {
        notifySessionExpired(data.error);
      }
    }
    const err: any = new Error(data.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    err.currentRecord = data.currentRecord;
    throw err;
  }

  return data;
}

export const api = {
  // Records
  async getRecords(params?: { q?: string; sex?: string; country?: string; court?: string; status?: string }): Promise<RecordItem[]> {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.sex) query.set("sex", params.sex);
    if (params?.country) query.set("country", params.country);
    if (params?.court) query.set("court", params.court);
    if (params?.status) query.set("status", params.status);

    const data = await request<{ records: RecordItem[] }>(`/records?${query.toString()}`);
    return data.records || [];
  },

  async getRecord(no: string): Promise<RecordItem | null> {
    const data = await request<{ record: RecordItem }>(`/records/${encodeURIComponent(no)}`);
    return data.record || null;
  },

  async createRecord(record: Partial<RecordItem>): Promise<RecordItem> {
    const data = await request<{ record: RecordItem }>("/records", {
      method: "POST",
      body: JSON.stringify(record)
    });
    return data.record;
  },

  async updateRecord(no: string, record: Partial<RecordItem>): Promise<RecordItem> {
    const data = await request<{ record: RecordItem }>(`/records/${encodeURIComponent(no)}`, {
      method: "PUT",
      body: JSON.stringify(record)
    });
    return data.record;
  },

  async archiveRecord(no: string): Promise<void> {
    await request(`/records/${encodeURIComponent(no)}/archive`, {
      method: "POST"
    });
  },

  // Reports
  async getKPIs(): Promise<KPIStats> {
    const data = await request<{ kpis: KPIStats }>("/reports/kpis");
    return data.kpis;
  },

  async getAnnualSex(): Promise<{ year: string; female: number; male: number }[]> {
    const data = await request<{ data: { year: string; female: number; male: number }[] }>("/reports/annual-sex");
    return data.data || [];
  },

  // Users
  async getUsers(): Promise<UserItem[]> {
    const data = await request<{ users: UserItem[] }>("/users");
    return data.users || [];
  },

  async createUser(user: Partial<UserItem> & { password?: string }): Promise<UserItem> {
    const data = await request<{ user: UserItem }>("/users", {
      method: "POST",
      body: JSON.stringify(user)
    });
    return data.user;
  },

  async updateUser(employee_id: string, user: Partial<UserItem> & { password?: string }): Promise<UserItem> {
    const data = await request<{ user: UserItem }>(`/users/${encodeURIComponent(employee_id)}`, {
      method: "PUT",
      body: JSON.stringify(user)
    });
    return data.user;
  },

  // Activity
  async getActivity(filter?: { user?: string; action?: string; entry?: string }): Promise<ActivityItem[]> {
    const query = new URLSearchParams();
    if (filter?.user) query.set("user", filter.user);
    if (filter?.action) query.set("action", filter.action);
    if (filter?.entry) query.set("entry", filter.entry);

    const data = await request<{ activity: ActivityItem[] }>(`/activity?${query.toString()}`);
    return data.activity || [];
  },

  async verifyAudit(): Promise<AuditVerificationResult> {
    const data = await request<{ auditIntegrity: AuditVerificationResult }>("/activity/verify");
    return data.auditIntegrity;
  },

  // Database Backup & Restore
  async getBackups(): Promise<BackupItem[]> {
    const data = await request<{ backups: BackupItem[] }>("/backup");
    return data.backups || [];
  },

  async createBackup(): Promise<BackupItem> {
    const data = await request<{ backup: BackupItem }>("/backup", {
      method: "POST"
    });
    return data.backup;
  },

  async restoreBackup(filename: string): Promise<{ success: boolean; message: string }> {
    return await request<{ success: boolean; message: string }>("/backup/restore", {
      method: "POST",
      body: JSON.stringify({ filename })
    });
  },

  // Auth
  async login(employee_id: string, password: string): Promise<UserItem> {
    const data = await request<{ token: string; user: UserItem }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ employee_id, password })
    });

    if (data.token) {
      setStoredToken(data.token);
    }
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setStoredToken(null);
    }
  },

  async touchSession(): Promise<boolean> {
    try {
      await request("/auth/touch", { method: "POST" });
      return true;
    } catch {
      return false;
    }
  },

  async getMe(): Promise<UserItem | null> {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const data = await request<{ user: UserItem }>("/auth/me");
      return data.user || null;
    } catch {
      setStoredToken(null);
      return null;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return await request<{ success: boolean; message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }
};
