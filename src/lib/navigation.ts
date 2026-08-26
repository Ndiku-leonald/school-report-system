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
    label: "Teacher assignments",
    href: "/dashboard/assignments",
    icon: Users,
    permissions: ["ASSIGNMENTS_VIEW_ALL", "ASSIGNMENTS_MANAGE"],
  },
  {
    label: "Marks",
    href: "/dashboard/marks",
    icon: ListChecks,
    permissions: ["MARKS_VIEW_ALL"],
  },
  {
    label: "Approvals",
    href: "/dashboard/marks/review",
    icon: ClipboardCheck,
    permissions: ["MARKS_REVIEW", "MARKS_APPROVE"],
  },
  {
    label: "Reports",
    icon: FileText,
    href: "/dashboard/results",
    permissions: ["REPORTS_VIEW_ALL", "REPORTS_GENERATE"],
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
    label: "My assignments",
    href: "/teacher/assignments",
    icon: BookOpen,
    permissions: ["ASSIGNMENTS_VIEW_OWN"],
  },
  {
    label: "Marks",
    href: "/teacher/marks",
    icon: ListChecks,
    permissions: ["MARKS_VIEW_ASSIGNED", "MARKS_ENTER"],
  },
  {
    label: "Submissions",
    href: "/teacher/marks",
    icon: ClipboardCheck,
    permissions: ["MARKS_SUBMIT"],
  },
];
