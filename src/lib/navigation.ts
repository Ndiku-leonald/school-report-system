import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  Shapes,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import type { NavigationItem } from "@/types/navigation";

export const dashboardNavigation: NavigationItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["DASHBOARD_VIEW"],
  },
  {
    label: "Students",
    href: "/dashboard/students",
    icon: GraduationCap,
    permissions: ["STUDENTS_VIEW_ALL", "STUDENTS_VIEW_ASSIGNED"],
  },
  {
    label: "Staff",
    icon: Users,
    permissions: ["STAFF_VIEW"],
    unavailable: true,
  },
  {
    label: "Academic setup",
    href: "/dashboard/academic",
    icon: Shapes,
    permissions: ["ACADEMIC_CONFIGURATION_VIEW"],
  },
  {
    label: "Marks",
    icon: ListChecks,
    permissions: ["MARKS_VIEW_ALL", "MARKS_VIEW_ASSIGNED"],
    unavailable: true,
  },
  {
    label: "Approvals",
    icon: ClipboardCheck,
    permissions: ["MARKS_REVIEW", "MARKS_APPROVE"],
    unavailable: true,
  },
  {
    label: "Reports",
    icon: FileText,
    permissions: ["REPORTS_VIEW_ALL", "REPORTS_VIEW_ASSIGNED"],
    unavailable: true,
  },
  {
    label: "Analytics",
    icon: BarChart3,
    permissions: ["ANALYTICS_VIEW"],
    unavailable: true,
  },
  {
    label: "Promotion",
    icon: SlidersHorizontal,
    permissions: ["PROMOTION_VIEW"],
    unavailable: true,
  },
  {
    label: "Settings",
    icon: Settings,
    permissions: ["SCHOOL_SETTINGS_VIEW"],
    unavailable: true,
  },
  {
    label: "Audit Logs",
    icon: ScrollText,
    permissions: ["AUDIT_VIEW"],
    unavailable: true,
  },
];

export const teacherNavigation: NavigationItem[] = [
  {
    label: "Students",
    href: "/dashboard/students",
    icon: GraduationCap,
    permissions: ["STUDENTS_VIEW_ALL", "STUDENTS_VIEW_ASSIGNED"],
  },
  {
    label: "Academic setup",
    href: "/dashboard/academic",
    icon: BookOpen,
    permissions: ["ACADEMIC_CONFIGURATION_VIEW"],
  },
  {
    label: "Workspace",
    href: "/teacher",
    icon: LayoutDashboard,
    permissions: ["TEACHER_WORKSPACE_VIEW"],
  },
  {
    label: "Assigned classes",
    icon: Shapes,
    permissions: ["ASSIGNMENTS_VIEW_ALL", "ASSIGNMENTS_VIEW_OWN"],
    unavailable: true,
  },
  {
    label: "Assigned subjects",
    icon: BookOpen,
    permissions: ["ASSIGNMENTS_VIEW_ALL", "ASSIGNMENTS_VIEW_OWN"],
    unavailable: true,
  },
  {
    label: "Marks",
    icon: ListChecks,
    permissions: ["MARKS_VIEW_ALL", "MARKS_VIEW_ASSIGNED"],
    unavailable: true,
  },
  {
    label: "Submissions",
    icon: ClipboardCheck,
    permissions: ["MARKS_SUBMIT"],
    unavailable: true,
  },
];
