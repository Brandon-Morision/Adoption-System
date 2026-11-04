/**
 * Input sanitization and validation utilities for adoption records and users.
 */

export function sanitizeString(val: unknown, maxLen = 255): string {
  if (typeof val !== "string") return "";
  // Strip control characters except newline and tab
  return val
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

export function isValidDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  // Match YYYY-MM-DD or standard readable dates
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    return !isNaN(d.getTime());
  }
  // Allow parsed textual dates if valid
  const parsed = Date.parse(dateStr);
  return !isNaN(parsed);
}

export function isValidEmail(email: string): boolean {
  if (!email) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface ValidatedRecord {
  no?: string;
  name: string;
  dob: string;
  country: string;
  sex: "Female" | "Male";
  adopters: string;
  adopters_address: string;
  adopters_occupation: string;
  adoption: string;
  court: string;
  entered: string;
  officer: string;
  designation: string;
  signature: string;
}

export function validateRecordInput(body: any, isUpdate = false): { errors: string[]; data: ValidatedRecord } {
  const errors: string[] = [];

  const name = sanitizeString(body?.name, 150);
  const dob = sanitizeString(body?.dob, 30);
  const country = sanitizeString(body?.country || "Kenya", 100);
  const sex = sanitizeString(body?.sex, 20);
  const adopters = sanitizeString(body?.adopters, 200);
  const adopters_address = sanitizeString(body?.adopters_address, 300);
  const adopters_occupation = sanitizeString(body?.adopters_occupation, 150);
  const adoption = sanitizeString(body?.adoption, 30);
  const court = sanitizeString(body?.court || "High Court", 100);
  const entered = sanitizeString(body?.entered || new Date().toISOString().split("T")[0], 30);
  const officer = sanitizeString(body?.officer || "Jane Mwangi", 100);
  const designation = sanitizeString(body?.designation || "Registrar, County Adoption Office", 150);
  const signature = sanitizeString(body?.signature || "J. Mwangi", 100);

  if (!isUpdate || body.name !== undefined) {
    if (!name || name.length < 2) errors.push("Child full name is required (at least 2 characters).");
  }

  if (!isUpdate || body.dob !== undefined) {
    if (!dob || !isValidDate(dob)) errors.push("Valid Date of Birth is required.");
  }

  if (!isUpdate || body.sex !== undefined) {
    if (sex !== "Female" && sex !== "Male") errors.push("Sex must be either 'Female' or 'Male'.");
  }

  if (!isUpdate || body.adopters !== undefined) {
    if (!adopters || adopters.length < 2) errors.push("Adopter(s) name is required.");
  }

  if (!isUpdate || body.adoption !== undefined) {
    if (!adoption || !isValidDate(adoption)) errors.push("Valid Date of Adoption is required.");
  }

  if (!isUpdate || body.court !== undefined) {
    if (!court) errors.push("Court name is required.");
  }

  return {
    errors,
    data: {
      no: body?.no ? sanitizeString(body.no, 20) : undefined,
      name,
      dob,
      country: country || "Kenya",
      sex: (sex === "Male" ? "Male" : "Female"),
      adopters,
      adopters_address,
      adopters_occupation,
      adoption,
      court: court || "High Court",
      entered,
      officer,
      designation,
      signature
    }
  };
}

export function validateUserInput(body: any, isUpdate = false): { errors: string[]; data: any } {
  const errors: string[] = [];

  const name = sanitizeString(body?.name, 100);
  const employee_id = sanitizeString(body?.employee_id, 30).toUpperCase();
  const role = sanitizeString(body?.role, 30);
  const status = sanitizeString(body?.status || "Active", 20);
  const email = sanitizeString(body?.email, 120);
  const password = typeof body?.password === "string" ? body.password.trim() : "";

  if (!isUpdate || body.name !== undefined) {
    if (!name || name.length < 2) errors.push("User full name is required.");
  }

  if (!isUpdate) {
    if (!employee_id || !/^[A-Z0-9-]{3,20}$/.test(employee_id)) {
      errors.push("Valid Employee ID is required (3-20 alphanumeric characters or hyphens).");
    }
  }

  if (!isUpdate || body.role !== undefined) {
    if (role !== "Administrator" && role !== "Employee") {
      errors.push("Role must be 'Administrator' or 'Employee'.");
    }
  }

  if (email && !isValidEmail(email)) {
    errors.push("Invalid email address format.");
  }

  if (!isUpdate && (!password || password.length < 8)) {
    errors.push("Password must be at least 8 characters long.");
  } else if (password && password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }

  return {
    errors,
    data: {
      name,
      employee_id,
      role: (role === "Administrator" ? "Administrator" : "Employee"),
      status: (status === "Inactive" ? "Inactive" : "Active"),
      email,
      password
    }
  };
}

