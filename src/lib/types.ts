export type UserRole = "hr" | "manager" | "staff" | "applicant"

export type EmploymentStatus =
  | "active"
  | "on-leave"
  | "onboarding"
  | "terminated"
  | "suspended"
  | "resigned"

export type Employee = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  departmentId: string | null
  jobTitle: string
  managerId: string | null
  startDate: string | null
  status: EmploymentStatus
  avatarInitials: string
  isArchived: boolean
}

export type EmployeeFull = Employee & {
  employeeNumber: string | null
  resignationDate: string | null
  profilePhotoUrl: string | null
  contractType: string | null
  contractEndDate: string | null
  probationEndDate: string | null
  personalEmail: string | null
  workEmail: string | null
  alternatePhone: string | null
  homeAddress: string | null
  dateOfBirth: string | null
  identityNumber: string | null
  gender: string | null
  race: string | null
  disability: string | null
  citizenshipStatus: string | null
  vatNumber: string | null
  nextOfKinName: string | null
  nextOfKinPhone: string | null
  nextOfKinRelationship: string | null
  salaryBand: string | null
  lastSalaryReviewDate: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankBranchCode: string | null
  bankAccountType: string | null
  bankVerificationStatus: string | null
  createdAt: string
  updatedAt: string
  department: { id: string; name: string; colour: string } | null
  manager: { id: string; firstName: string; lastName: string; jobTitle: string } | null
}

export type Department = {
  id: string
  name: string
  colour: string
}

export type LeaveBalance = {
  leave_type: string
  entitled: number
  used: number
  pending: number
}

export type EmployeeDocument = {
  id: string
  category: string
  name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
  hidden_from_employee: boolean
}

export type HRNote = {
  id: string
  note: string
  created_by: string | null
  created_at: string
}

export type KpiSummary = {
  reviewId: string
  period: string
  title: string
  status: string
  deadline: string | null
} | null
