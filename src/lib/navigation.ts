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
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Students", icon: GraduationCap, unavailable: true },
  { label: "Staff", icon: Users, unavailable: true },
  { label: "Classes", icon: Shapes, unavailable: true },
  { label: "Subjects", icon: BookOpen, unavailable: true },
  { label: "Marks", icon: ListChecks, unavailable: true },
  { label: "Approvals", icon: ClipboardCheck, unavailable: true },
  { label: "Reports", icon: FileText, unavailable: true },
  { label: "Analytics", icon: BarChart3, unavailable: true },
  { label: "Promotion", icon: SlidersHorizontal, unavailable: true },
  { label: "Settings", icon: Settings, unavailable: true },
  { label: "Audit Logs", icon: ScrollText, unavailable: true },
];

export const teacherNavigation: NavigationItem[] = [
  { label: "Workspace", href: "/teacher", icon: LayoutDashboard },
  { label: "Assigned classes", icon: Shapes, unavailable: true },
  { label: "Assigned subjects", icon: BookOpen, unavailable: true },
  { label: "Marks", icon: ListChecks, unavailable: true },
  { label: "Submissions", icon: ClipboardCheck, unavailable: true },
];
