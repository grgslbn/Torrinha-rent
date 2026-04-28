export type Spot = {
  id: string;
  number: number;
  label: string | null;
  occupied: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  incoming_tenant: {
    tenant_id: string;
    tenant_name: string;
    start_date: string;
  } | null;
};

export type TenantContact = {
  id: string;
  tenant_id: string;
  label: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  receives_emails: boolean;
  notes: string | null;
};

export type Remote = {
  id: string;
  count: number;
  deposit_paid: boolean;
  returned_date: string | null;
};

export type FutureAssignment = {
  tenant_id: string;
  spot_id: string;
  start_date: string;
  end_date: string | null;
  torrinha_spots: { id: string; number: number; label: string | null } | null;
};

export type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: string;
  rent_eur: number;
  payment_due_day: number;
  start_date: string;
  notes: string | null;
  active: boolean;
  status: "active" | "upcoming" | "inactive";
  access_token: string | null;
  torrinha_spots: { id: string; number: number; label: string | null }[];
  torrinha_remotes: Remote[];
  future_assignments: FutureAssignment[];
  torrinha_tenant_contacts: TenantContact[];
};
