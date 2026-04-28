type BadgeVariant = "success" | "warning" | "danger" | "accent" | "neutral" | "info";

export function paymentStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid": return "success";
    case "pending": return "warning";
    case "overdue": return "danger";
    default: return "neutral";
  }
}

export function tenantStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "active": return "success";
    case "upcoming": return "info";
    case "inactive": return "neutral";
    default: return "neutral";
  }
}

export function spotStatusColor(occupied: boolean): string {
  return occupied
    ? "text-t-accent-text bg-t-accent-light"
    : "text-green-700 bg-green-50";
}
