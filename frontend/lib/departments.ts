/** Mirrors the `Department` enum in backend/prisma/schema.prisma. Keep the two in sync. */
export const departments = ['ENGINEERING', 'SALES', 'DATA', 'FINANCE', 'DELIVERY', 'MANAGEMENT'] as const;

export type Department = (typeof departments)[number];

/** "ENGINEERING" -> "Engineering" for display. */
export function departmentLabel(department: Department): string {
  return department.charAt(0) + department.slice(1).toLowerCase();
}

/** Suggested job titles for sign-up; role is free text, so any value is accepted. */
export const roleSuggestions = ['Engineer', 'Senior Engineer', 'Sales Associate', 'Data Analyst', 'Accountant', 'Delivery Manager', 'Manager'];
