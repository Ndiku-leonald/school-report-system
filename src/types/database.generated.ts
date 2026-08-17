export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          name: string;
          school_id: string;
          starts_on: string;
          status: Database["public"]["Enums"]["academic_year_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          name: string;
          school_id: string;
          starts_on: string;
          status?: Database["public"]["Enums"]["academic_year_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          name?: string;
          school_id?: string;
          starts_on?: string;
          status?: Database["public"]["Enums"]["academic_year_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_components: {
        Row: {
          assessment_scheme_id: string;
          component_code: string;
          created_at: string;
          id: string;
          is_required: boolean;
          maximum_score: number;
          name: string;
          sort_order: number;
          updated_at: string;
          weight_percentage: number;
        };
        Insert: {
          assessment_scheme_id: string;
          component_code: string;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          maximum_score: number;
          name: string;
          sort_order: number;
          updated_at?: string;
          weight_percentage: number;
        };
        Update: {
          assessment_scheme_id?: string;
          component_code?: string;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          maximum_score?: number;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          weight_percentage?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_components_assessment_scheme_id_fkey";
            columns: ["assessment_scheme_id"];
            isOneToOne: false;
            referencedRelation: "assessment_schemes";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_schemes: {
        Row: {
          created_at: string;
          created_by: string | null;
          effective_from: string;
          grade_level_id: string;
          id: string;
          name: string;
          status: Database["public"]["Enums"]["assessment_scheme_status"];
          subject_id: string;
          term_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          grade_level_id: string;
          id?: string;
          name: string;
          status?: Database["public"]["Enums"]["assessment_scheme_status"];
          subject_id: string;
          term_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          grade_level_id?: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["assessment_scheme_status"];
          subject_id?: string;
          term_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_schemes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_schemes_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_schemes_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_schemes_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_membership_id: string | null;
          actor_profile_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          new_values: Json | null;
          old_values: Json | null;
          reason: string | null;
          request_id: string | null;
          school_id: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_membership_id?: string | null;
          actor_profile_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          request_id?: string | null;
          school_id: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_membership_id?: string | null;
          actor_profile_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          request_id?: string | null;
          school_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_membership_id_fkey";
            columns: ["actor_membership_id"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      class_sections: {
        Row: {
          academic_year_id: string;
          capacity: number | null;
          class_code: string;
          created_at: string;
          grade_level_id: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          capacity?: number | null;
          class_code: string;
          created_at?: string;
          grade_level_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          capacity?: number | null;
          class_code?: string;
          created_at?: string;
          grade_level_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_sections_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_sections_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
        ];
      };
      class_teacher_assignments: {
        Row: {
          class_section_id: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          is_active: boolean;
          is_primary: boolean;
          staff_membership_id: string;
          starts_on: string;
          term_id: string;
          updated_at: string;
        };
        Insert: {
          class_section_id: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          is_primary?: boolean;
          staff_membership_id: string;
          starts_on: string;
          term_id: string;
          updated_at?: string;
        };
        Update: {
          class_section_id?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          is_primary?: boolean;
          staff_membership_id?: string;
          starts_on?: string;
          term_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_teacher_assignments_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_teacher_assignments_staff_membership_id_fkey";
            columns: ["staff_membership_id"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_teacher_assignments_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          academic_year_id: string;
          class_number: string | null;
          class_section_id: string;
          created_at: string;
          enrolled_on: string;
          exited_on: string | null;
          id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          class_number?: string | null;
          class_section_id: string;
          created_at?: string;
          enrolled_on: string;
          exited_on?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          class_number?: string | null;
          class_section_id?: string;
          created_at?: string;
          enrolled_on?: string;
          exited_on?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_level_subjects: {
        Row: {
          contributes_to_aggregate: boolean;
          created_at: string;
          grade_level_id: string;
          id: string;
          is_required: boolean;
          sort_order: number;
          subject_id: string;
          updated_at: string;
        };
        Insert: {
          contributes_to_aggregate?: boolean;
          created_at?: string;
          grade_level_id: string;
          id?: string;
          is_required?: boolean;
          sort_order: number;
          subject_id: string;
          updated_at?: string;
        };
        Update: {
          contributes_to_aggregate?: boolean;
          created_at?: string;
          grade_level_id?: string;
          id?: string;
          is_required?: boolean;
          sort_order?: number;
          subject_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_level_subjects_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grade_level_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      grade_levels: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_final_grade: boolean;
          name: string;
          school_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_final_grade?: boolean;
          name: string;
          school_id: string;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_final_grade?: boolean;
          name?: string;
          school_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      grading_bands: {
        Row: {
          aggregate_points: number | null;
          created_at: string;
          description: string | null;
          grade: string;
          grading_scale_id: string;
          id: string;
          is_pass: boolean;
          maximum_score: number;
          minimum_score: number;
          score_range: unknown;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          aggregate_points?: number | null;
          created_at?: string;
          description?: string | null;
          grade: string;
          grading_scale_id: string;
          id?: string;
          is_pass?: boolean;
          maximum_score: number;
          minimum_score: number;
          score_range?: unknown;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          aggregate_points?: number | null;
          created_at?: string;
          description?: string | null;
          grade?: string;
          grading_scale_id?: string;
          id?: string;
          is_pass?: boolean;
          maximum_score?: number;
          minimum_score?: number;
          score_range?: unknown;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grading_bands_grading_scale_id_fkey";
            columns: ["grading_scale_id"];
            isOneToOne: false;
            referencedRelation: "grading_scales";
            referencedColumns: ["id"];
          },
        ];
      };
      grading_scales: {
        Row: {
          academic_year_id: string | null;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          grade_level_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          retired_at: string | null;
          school_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          academic_year_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          retired_at?: string | null;
          school_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          academic_year_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          retired_at?: string | null;
          school_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "grading_scales_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grading_scales_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grading_scales_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grading_scales_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      guardians: {
        Row: {
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          is_active: boolean;
          last_name: string;
          middle_name: string | null;
          phone: string | null;
          school_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          first_name: string;
          id?: string;
          is_active?: boolean;
          last_name: string;
          middle_name?: string | null;
          phone?: string | null;
          school_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          is_active?: boolean;
          last_name?: string;
          middle_name?: string | null;
          phone?: string | null;
          school_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      mark_sheets: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          assessment_scheme_id: string;
          class_section_id: string;
          created_at: string;
          id: string;
          locked_at: string | null;
          locked_by: string | null;
          return_reason: string | null;
          returned_at: string | null;
          returned_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          subject_id: string;
          submitted_at: string | null;
          submitted_by: string | null;
          teaching_assignment_id: string;
          term_id: string;
          updated_at: string;
          version: number;
          workflow_status: Database["public"]["Enums"]["mark_sheet_status"];
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_scheme_id: string;
          class_section_id: string;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          return_reason?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          subject_id: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          teaching_assignment_id: string;
          term_id: string;
          updated_at?: string;
          version?: number;
          workflow_status?: Database["public"]["Enums"]["mark_sheet_status"];
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_scheme_id?: string;
          class_section_id?: string;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          return_reason?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          subject_id?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          teaching_assignment_id?: string;
          term_id?: string;
          updated_at?: string;
          version?: number;
          workflow_status?: Database["public"]["Enums"]["mark_sheet_status"];
        };
        Relationships: [
          {
            foreignKeyName: "mark_sheets_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_assessment_scheme_id_fkey";
            columns: ["assessment_scheme_id"];
            isOneToOne: false;
            referencedRelation: "assessment_schemes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_locked_by_fkey";
            columns: ["locked_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_returned_by_fkey";
            columns: ["returned_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_teaching_assignment_id_fkey";
            columns: ["teaching_assignment_id"];
            isOneToOne: false;
            referencedRelation: "teaching_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mark_sheets_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      marks: {
        Row: {
          assessment_component_id: string;
          attendance_status: Database["public"]["Enums"]["assessment_attendance_status"];
          created_at: string;
          created_by: string | null;
          enrollment_id: string;
          id: string;
          mark_sheet_id: string;
          row_version: number;
          score: number | null;
          teacher_remark: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          assessment_component_id: string;
          attendance_status?: Database["public"]["Enums"]["assessment_attendance_status"];
          created_at?: string;
          created_by?: string | null;
          enrollment_id: string;
          id?: string;
          mark_sheet_id: string;
          row_version?: number;
          score?: number | null;
          teacher_remark?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          assessment_component_id?: string;
          attendance_status?: Database["public"]["Enums"]["assessment_attendance_status"];
          created_at?: string;
          created_by?: string | null;
          enrollment_id?: string;
          id?: string;
          mark_sheet_id?: string;
          row_version?: number;
          score?: number | null;
          teacher_remark?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "marks_assessment_component_id_fkey";
            columns: ["assessment_component_id"];
            isOneToOne: false;
            referencedRelation: "assessment_components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marks_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marks_mark_sheet_id_fkey";
            columns: ["mark_sheet_id"];
            isOneToOne: false;
            referencedRelation: "mark_sheets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marks_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      parent_access_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          last_seen_at: string | null;
          revoked_at: string | null;
          session_token_hash: string;
          student_access_credential_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          session_token_hash: string;
          student_access_credential_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          session_token_hash?: string;
          student_access_credential_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_access_sessions_student_access_credential_id_fkey";
            columns: ["student_access_credential_id"];
            isOneToOne: false;
            referencedRelation: "student_access_credentials";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          middle_name: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          first_name: string;
          id: string;
          last_name: string;
          middle_name?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          middle_name?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotion_decisions: {
        Row: {
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          enrollment_id: string;
          final_decision:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          id: string;
          promotion_rule_id: string | null;
          reason: string | null;
          system_recommendation: Database["public"]["Enums"]["promotion_outcome"];
          term_id: string;
          updated_at: string;
          was_overridden: boolean;
        };
        Insert: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          enrollment_id: string;
          final_decision?:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          id?: string;
          promotion_rule_id?: string | null;
          reason?: string | null;
          system_recommendation: Database["public"]["Enums"]["promotion_outcome"];
          term_id: string;
          updated_at?: string;
          was_overridden?: boolean;
        };
        Update: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          enrollment_id?: string;
          final_decision?:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          id?: string;
          promotion_rule_id?: string | null;
          reason?: string | null;
          system_recommendation?: Database["public"]["Enums"]["promotion_outcome"];
          term_id?: string;
          updated_at?: string;
          was_overridden?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_decisions_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_decisions_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_decisions_promotion_rule_id_fkey";
            columns: ["promotion_rule_id"];
            isOneToOne: false;
            referencedRelation: "promotion_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_decisions_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      promotion_rules: {
        Row: {
          academic_year_id: string | null;
          additional_rules: Json;
          created_at: string;
          created_by: string | null;
          grade_level_id: string | null;
          id: string;
          is_active: boolean;
          maximum_aggregate: number | null;
          minimum_attendance_percentage: number | null;
          minimum_average: number | null;
          minimum_subjects_passed: number | null;
          name: string;
          required_subject_rules: Json;
          retired_at: string | null;
          school_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          academic_year_id?: string | null;
          additional_rules?: Json;
          created_at?: string;
          created_by?: string | null;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          maximum_aggregate?: number | null;
          minimum_attendance_percentage?: number | null;
          minimum_average?: number | null;
          minimum_subjects_passed?: number | null;
          name: string;
          required_subject_rules?: Json;
          retired_at?: string | null;
          school_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          academic_year_id?: string | null;
          additional_rules?: Json;
          created_at?: string;
          created_by?: string | null;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          maximum_aggregate?: number | null;
          minimum_attendance_percentage?: number | null;
          minimum_average?: number | null;
          minimum_subjects_passed?: number | null;
          name?: string;
          required_subject_rules?: Json;
          retired_at?: string | null;
          school_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_rules_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_rules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_rules_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_rules_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      ranking_rules: {
        Row: {
          academic_year_id: string | null;
          configuration: Json;
          created_at: string;
          created_by: string | null;
          grade_level_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          ranking_basis: Database["public"]["Enums"]["ranking_basis"];
          retired_at: string | null;
          school_id: string;
          tie_method: Database["public"]["Enums"]["ranking_tie_method"];
          updated_at: string;
          version: number;
        };
        Insert: {
          academic_year_id?: string | null;
          configuration?: Json;
          created_at?: string;
          created_by?: string | null;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          ranking_basis: Database["public"]["Enums"]["ranking_basis"];
          retired_at?: string | null;
          school_id: string;
          tie_method: Database["public"]["Enums"]["ranking_tie_method"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          academic_year_id?: string | null;
          configuration?: Json;
          created_at?: string;
          created_by?: string | null;
          grade_level_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          ranking_basis?: Database["public"]["Enums"]["ranking_basis"];
          retired_at?: string | null;
          school_id?: string;
          tie_method?: Database["public"]["Enums"]["ranking_tie_method"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ranking_rules_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ranking_rules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ranking_rules_grade_level_id_fkey";
            columns: ["grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ranking_rules_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      report_batches: {
        Row: {
          class_section_id: string | null;
          completed_at: string | null;
          completed_reports: number;
          created_at: string;
          error_summary: string | null;
          failed_reports: number;
          id: string;
          requested_by: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["report_batch_status"];
          term_id: string;
          total_reports: number;
          updated_at: string;
        };
        Insert: {
          class_section_id?: string | null;
          completed_at?: string | null;
          completed_reports?: number;
          created_at?: string;
          error_summary?: string | null;
          failed_reports?: number;
          id?: string;
          requested_by?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["report_batch_status"];
          term_id: string;
          total_reports?: number;
          updated_at?: string;
        };
        Update: {
          class_section_id?: string | null;
          completed_at?: string | null;
          completed_reports?: number;
          created_at?: string;
          error_summary?: string | null;
          failed_reports?: number;
          id?: string;
          requested_by?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["report_batch_status"];
          term_id?: string;
          total_reports?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_batches_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_batches_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_batches_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      report_snapshots: {
        Row: {
          created_at: string;
          id: string;
          report_id: string;
          snapshot_data: Json;
          snapshot_version: number;
          source_checksum: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          report_id: string;
          snapshot_data: Json;
          snapshot_version?: number;
          source_checksum: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          report_id?: string;
          snapshot_data?: Json;
          snapshot_version?: number;
          source_checksum?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_snapshots_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      report_subject_results: {
        Row: {
          aggregate_points: number | null;
          created_at: string;
          grade: string | null;
          id: string;
          report_id: string;
          sort_order: number;
          subject_id: string;
          subject_position: number | null;
          subject_score: number | null;
          teacher_comment: string | null;
        };
        Insert: {
          aggregate_points?: number | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          report_id: string;
          sort_order: number;
          subject_id: string;
          subject_position?: number | null;
          subject_score?: number | null;
          teacher_comment?: string | null;
        };
        Update: {
          aggregate_points?: number | null;
          created_at?: string;
          grade?: string | null;
          id?: string;
          report_id?: string;
          sort_order?: number;
          subject_id?: string;
          subject_position?: number | null;
          subject_score?: number | null;
          teacher_comment?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "report_subject_results_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_subject_results_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      report_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          school_id: string;
          template_configuration: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          school_id: string;
          template_configuration?: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          school_id?: string;
          template_configuration?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_templates_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          aggregate_total: number | null;
          batch_id: string;
          class_position: number | null;
          created_at: string;
          created_by: string | null;
          enrollment_id: string;
          file_checksum: string | null;
          generated_at: string | null;
          grade_level_position: number | null;
          id: string;
          overall_average: number | null;
          overall_grade: string | null;
          overall_total: number | null;
          pdf_storage_path: string | null;
          promotion_recommendation:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          published_at: string | null;
          published_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          superseded_by: string | null;
          template_id: string;
          term_id: string;
          updated_at: string;
          version: number;
          withdrawn_at: string | null;
          withdrawn_by: string | null;
        };
        Insert: {
          aggregate_total?: number | null;
          batch_id: string;
          class_position?: number | null;
          created_at?: string;
          created_by?: string | null;
          enrollment_id: string;
          file_checksum?: string | null;
          generated_at?: string | null;
          grade_level_position?: number | null;
          id?: string;
          overall_average?: number | null;
          overall_grade?: string | null;
          overall_total?: number | null;
          pdf_storage_path?: string | null;
          promotion_recommendation?:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          published_at?: string | null;
          published_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          superseded_by?: string | null;
          template_id: string;
          term_id: string;
          updated_at?: string;
          version?: number;
          withdrawn_at?: string | null;
          withdrawn_by?: string | null;
        };
        Update: {
          aggregate_total?: number | null;
          batch_id?: string;
          class_position?: number | null;
          created_at?: string;
          created_by?: string | null;
          enrollment_id?: string;
          file_checksum?: string | null;
          generated_at?: string | null;
          grade_level_position?: number | null;
          id?: string;
          overall_average?: number | null;
          overall_grade?: string | null;
          overall_total?: number | null;
          pdf_storage_path?: string | null;
          promotion_recommendation?:
            Database["public"]["Enums"]["promotion_outcome"] | null;
          published_at?: string | null;
          published_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          superseded_by?: string | null;
          template_id?: string;
          term_id?: string;
          updated_at?: string;
          version?: number;
          withdrawn_at?: string | null;
          withdrawn_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "report_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_superseded_by_fkey";
            columns: ["superseded_by"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "report_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_withdrawn_by_fkey";
            columns: ["withdrawn_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          id: string;
          permission: Database["public"]["Enums"]["app_permission"];
          role: Database["public"]["Enums"]["staff_role"];
        };
        Insert: {
          created_at?: string;
          id?: string;
          permission: Database["public"]["Enums"]["app_permission"];
          role: Database["public"]["Enums"]["staff_role"];
        };
        Update: {
          created_at?: string;
          id?: string;
          permission?: Database["public"]["Enums"]["app_permission"];
          role?: Database["public"]["Enums"]["staff_role"];
        };
        Relationships: [];
      };
      school_settings: {
        Row: {
          created_at: string;
          id: string;
          school_id: string;
          setting_key: string;
          setting_value: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          school_id: string;
          setting_key: string;
          setting_value?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          school_id?: string;
          setting_key?: string;
          setting_value?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_staff_memberships: {
        Row: {
          created_at: string;
          employee_number: string;
          id: string;
          joined_at: string | null;
          left_at: string | null;
          profile_id: string;
          school_id: string;
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_number: string;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          profile_id: string;
          school_id: string;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_number?: string;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          profile_id?: string;
          school_id?: string;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_staff_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_staff_memberships_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          address: string | null;
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          logo_storage_path: string | null;
          name: string;
          phone: string | null;
          school_code: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          logo_storage_path?: string | null;
          name: string;
          phone?: string | null;
          school_code: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          logo_storage_path?: string | null;
          name?: string;
          phone?: string | null;
          school_code?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_role_assignments: {
        Row: {
          created_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          membership_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["staff_role"];
        };
        Insert: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          membership_id: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["staff_role"];
        };
        Update: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          membership_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
        };
        Relationships: [
          {
            foreignKeyName: "staff_role_assignments_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_role_assignments_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      student_access_credentials: {
        Row: {
          access_code_lookup_hash: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          failed_attempts: number;
          id: string;
          is_active: boolean;
          last_used_at: string | null;
          locked_until: string | null;
          pin_hash: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          access_code_lookup_hash: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          failed_attempts?: number;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          locked_until?: string | null;
          pin_hash: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          access_code_lookup_hash?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          failed_attempts?: number;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          locked_until?: string | null;
          pin_hash?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_access_credentials_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_access_credentials_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          can_access_reports: boolean;
          created_at: string;
          guardian_id: string;
          id: string;
          is_primary: boolean;
          relationship: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          can_access_reports?: boolean;
          created_at?: string;
          guardian_id: string;
          id?: string;
          is_primary?: boolean;
          relationship: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          can_access_reports?: boolean;
          created_at?: string;
          guardian_id?: string;
          id?: string;
          is_primary?: boolean;
          relationship?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey";
            columns: ["guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_term_comments: {
        Row: {
          class_teacher_comment: string | null;
          conduct_grade: string | null;
          created_at: string;
          created_by: string | null;
          enrollment_id: string;
          head_teacher_comment: string | null;
          id: string;
          term_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          class_teacher_comment?: string | null;
          conduct_grade?: string | null;
          created_at?: string;
          created_by?: string | null;
          enrollment_id: string;
          head_teacher_comment?: string | null;
          id?: string;
          term_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          class_teacher_comment?: string | null;
          conduct_grade?: string | null;
          created_at?: string;
          created_by?: string | null;
          enrollment_id?: string;
          head_teacher_comment?: string | null;
          id?: string;
          term_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_term_comments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_term_comments_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_term_comments_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_term_comments_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          admission_date: string;
          admission_number: string;
          created_at: string;
          date_of_birth: string | null;
          first_name: string;
          gender: string | null;
          id: string;
          last_name: string;
          middle_name: string | null;
          photo_storage_path: string | null;
          school_id: string;
          status: Database["public"]["Enums"]["student_status"];
          updated_at: string;
        };
        Insert: {
          admission_date: string;
          admission_number: string;
          created_at?: string;
          date_of_birth?: string | null;
          first_name: string;
          gender?: string | null;
          id?: string;
          last_name: string;
          middle_name?: string | null;
          photo_storage_path?: string | null;
          school_id: string;
          status?: Database["public"]["Enums"]["student_status"];
          updated_at?: string;
        };
        Update: {
          admission_date?: string;
          admission_number?: string;
          created_at?: string;
          date_of_birth?: string | null;
          first_name?: string;
          gender?: string | null;
          id?: string;
          last_name?: string;
          middle_name?: string | null;
          photo_storage_path?: string | null;
          school_id?: string;
          status?: Database["public"]["Enums"]["student_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          code: string;
          contributes_to_aggregate: boolean;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_core: boolean;
          name: string;
          school_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          contributes_to_aggregate?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_core?: boolean;
          name: string;
          school_id: string;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          contributes_to_aggregate?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_core?: boolean;
          name?: string;
          school_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      teaching_assignments: {
        Row: {
          class_section_id: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          is_active: boolean;
          staff_membership_id: string;
          starts_on: string;
          subject_id: string;
          term_id: string;
          updated_at: string;
        };
        Insert: {
          class_section_id: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          staff_membership_id: string;
          starts_on: string;
          subject_id: string;
          term_id: string;
          updated_at?: string;
        };
        Update: {
          class_section_id?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          is_active?: boolean;
          staff_membership_id?: string;
          starts_on?: string;
          subject_id?: string;
          term_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_assignments_class_section_id_fkey";
            columns: ["class_section_id"];
            isOneToOne: false;
            referencedRelation: "class_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teaching_assignments_staff_membership_id_fkey";
            columns: ["staff_membership_id"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teaching_assignments_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teaching_assignments_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      term_attendance: {
        Row: {
          created_at: string;
          days_absent: number;
          days_open: number;
          days_present: number;
          enrollment_id: string;
          id: string;
          recorded_by: string | null;
          term_id: string;
          times_late: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          days_absent?: number;
          days_open: number;
          days_present?: number;
          enrollment_id: string;
          id?: string;
          recorded_by?: string | null;
          term_id: string;
          times_late?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          days_absent?: number;
          days_open?: number;
          days_present?: number;
          enrollment_id?: string;
          id?: string;
          recorded_by?: string | null;
          term_id?: string;
          times_late?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "term_attendance_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "term_attendance_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "school_staff_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "term_attendance_term_id_fkey";
            columns: ["term_id"];
            isOneToOne: false;
            referencedRelation: "terms";
            referencedColumns: ["id"];
          },
        ];
      };
      terms: {
        Row: {
          academic_year_id: string;
          created_at: string;
          ends_on: string;
          id: string;
          is_promotion_term: boolean;
          name: string;
          starts_on: string;
          status: Database["public"]["Enums"]["term_status"];
          term_number: number;
          updated_at: string;
        };
        Insert: {
          academic_year_id: string;
          created_at?: string;
          ends_on: string;
          id?: string;
          is_promotion_term?: boolean;
          name: string;
          starts_on: string;
          status?: Database["public"]["Enums"]["term_status"];
          term_number: number;
          updated_at?: string;
        };
        Update: {
          academic_year_id?: string;
          created_at?: string;
          ends_on?: string;
          id?: string;
          is_promotion_term?: boolean;
          name?: string;
          starts_on?: string;
          status?: Database["public"]["Enums"]["term_status"];
          term_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      activate_academic_year: {
        Args: {
          expected_updated_at: string;
          target_year_id: string;
          transition_reason?: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      activate_assessment_scheme: {
        Args: { expected_updated_at: string; target_scheme_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      activate_grading_scale: {
        Args: { expected_updated_at: string; target_scale_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      activate_promotion_rule: {
        Args: { expected_updated_at: string; target_rule_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      activate_ranking_rule: {
        Args: { expected_updated_at: string; target_rule_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      activate_staff_invitation: {
        Args: { expected_membership_ids: string[]; target_profile_id: string };
        Returns: {
          membership_id: string;
        }[];
      };
      admit_student: {
        Args: {
          admission_date: string;
          admission_number: string;
          capacity_override?: boolean;
          capacity_override_reason?: string;
          class_number?: string;
          date_of_birth: string;
          enrollment_status?: Database["public"]["Enums"]["enrollment_status"];
          first_guardian?: Json;
          first_name: string;
          gender: string;
          initial_academic_year_id?: string;
          initial_class_section_id?: string;
          last_name: string;
          middle_name: string;
        };
        Returns: {
          enrollment_id: string;
          student_id: string;
          student_status: Database["public"]["Enums"]["student_status"];
          updated_at: string;
        }[];
      };
      archive_academic_year: {
        Args: {
          expected_updated_at: string;
          target_year_id: string;
          transition_reason?: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      change_enrollment_status: {
        Args: {
          exited_on: string;
          expected_updated_at: string;
          reason: string;
          target_enrollment_id: string;
          target_status: Database["public"]["Enums"]["enrollment_status"];
        };
        Returns: {
          enrollment_id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
        }[];
      };
      change_student_status: {
        Args: {
          effective_date: string;
          expected_updated_at: string;
          reason: string;
          target_status: Database["public"]["Enums"]["student_status"];
          target_student_id: string;
        };
        Returns: {
          student_id: string;
          student_status: Database["public"]["Enums"]["student_status"];
          updated_at: string;
        }[];
      };
      clear_my_active_membership: { Args: never; Returns: boolean };
      close_academic_year: {
        Args: {
          expected_updated_at: string;
          target_year_id: string;
          transition_reason?: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_academic_year: {
        Args: {
          year_ends_on: string;
          year_name: string;
          year_starts_on: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_and_link_guardian: {
        Args: {
          email: string;
          first_name: string;
          last_name: string;
          middle_name: string;
          phone: string;
          primary_guardian?: boolean;
          relationship: string;
          report_access_eligible?: boolean;
          target_student_id: string;
        };
        Returns: {
          guardian_id: string;
          relationship_id: string;
          updated_at: string;
        }[];
      };
      create_assessment_scheme_version: {
        Args: {
          expected_updated_at: string;
          scheme_components: Json;
          scheme_effective_from: string;
          scheme_name: string;
          source_scheme_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_class_section: {
        Args: {
          section_capacity?: number;
          section_code: string;
          section_name: string;
          target_academic_year_id: string;
          target_grade_level_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_class_teacher_assignment: {
        Args: {
          assignment_ends_on: string;
          assignment_is_primary: boolean;
          assignment_starts_on: string;
          target_class_section_id: string;
          target_staff_membership_id: string;
          target_term_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      create_grade_level: {
        Args: {
          grade_code: string;
          grade_is_final?: boolean;
          grade_name: string;
          grade_sort_order: number;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_grade_level_subject: {
        Args: {
          mapping_contributes_to_aggregate: boolean;
          mapping_required: boolean;
          mapping_sort_order: number;
          target_grade_level_id: string;
          target_subject_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_grading_scale_version: {
        Args: {
          expected_updated_at: string;
          scale_bands: Json;
          scale_effective_from: string;
          scale_name: string;
          source_scale_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_guardian: {
        Args: {
          email: string;
          first_name: string;
          last_name: string;
          middle_name: string;
          phone: string;
        };
        Returns: {
          guardian_id: string;
          is_active: boolean;
          updated_at: string;
        }[];
      };
      create_promotion_rule_version: {
        Args: {
          expected_updated_at: string;
          rule_additional_configuration: Json;
          rule_maximum_aggregate: number;
          rule_minimum_attendance_percentage: number;
          rule_minimum_average: number;
          rule_minimum_subjects_passed: number;
          rule_name: string;
          rule_required_subjects: Json;
          source_rule_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_ranking_rule_version: {
        Args: {
          expected_updated_at: string;
          rule_configuration: Json;
          rule_name: string;
          rule_ranking_basis: Database["public"]["Enums"]["ranking_basis"];
          rule_tie_method: Database["public"]["Enums"]["ranking_tie_method"];
          source_rule_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_student_enrollment: {
        Args: {
          capacity_override?: boolean;
          capacity_override_reason?: string;
          class_number: string;
          enrolled_on: string;
          enrollment_status: Database["public"]["Enums"]["enrollment_status"];
          target_academic_year_id: string;
          target_class_section_id: string;
          target_student_id: string;
        };
        Returns: {
          enrollment_id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
        }[];
      };
      create_subject: {
        Args: {
          subject_code: string;
          subject_contributes_to_aggregate: boolean;
          subject_description: string;
          subject_is_core: boolean;
          subject_name: string;
          subject_sort_order: number;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      create_teaching_assignment: {
        Args: {
          assignment_ends_on: string;
          assignment_starts_on: string;
          target_class_section_id: string;
          target_staff_membership_id: string;
          target_subject_id: string;
          target_term_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      create_term: {
        Args: {
          promotion_term?: boolean;
          target_academic_year_id: string;
          target_term_number: number;
          term_ends_on: string;
          term_name: string;
          term_starts_on: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      deactivate_grading_scale: {
        Args: { expected_updated_at: string; target_scale_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      deactivate_promotion_rule: {
        Args: { expected_updated_at: string; target_rule_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      deactivate_ranking_rule: {
        Args: { expected_updated_at: string; target_rule_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      end_class_teacher_assignment: {
        Args: {
          assignment_ends_on: string;
          expected_updated_at: string;
          reason: string;
          target_assignment_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      end_teaching_assignment: {
        Args: {
          assignment_ends_on: string;
          expected_updated_at: string;
          reason: string;
          target_assignment_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      get_class_roster: {
        Args: {
          page_number?: number;
          page_size?: number;
          target_class_section_id: string;
        };
        Returns: {
          admission_number: string;
          class_number: string;
          enrollment_status: Database["public"]["Enums"]["enrollment_status"];
          first_name: string;
          last_name: string;
          middle_name: string;
          student_id: string;
          total_count: number;
        }[];
      };
      get_class_teacher_assignment: {
        Args: { target_assignment_id: string };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          assignment_id: string;
          class_name: string;
          class_section_id: string;
          employee_number: string;
          ends_on: string;
          grade_level_id: string;
          grade_name: string;
          is_active: boolean;
          is_primary: boolean;
          period_status: string;
          staff_membership_id: string;
          starts_on: string;
          teacher_name: string;
          teacher_role: Database["public"]["Enums"]["staff_role"];
          term_ends_on: string;
          term_id: string;
          term_name: string;
          term_starts_on: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      get_my_active_membership: { Args: never; Returns: string };
      get_my_effective_permissions: {
        Args: { target_membership_id: string };
        Returns: Database["public"]["Enums"]["app_permission"][];
      };
      get_my_teacher_assignments: {
        Args: never;
        Returns: {
          academic_year_name: string;
          assignment_id: string;
          assignment_type: string;
          class_name: string;
          ends_on: string;
          grade_name: string;
          is_primary: boolean;
          period_status: string;
          starts_on: string;
          subject_name: string;
          term_name: string;
        }[];
      };
      get_student_details: {
        Args: { target_student_id: string };
        Returns: {
          admission_date: string;
          admission_number: string;
          date_of_birth: string;
          first_name: string;
          gender: string;
          last_name: string;
          middle_name: string;
          photo_storage_path: string;
          status: Database["public"]["Enums"]["student_status"];
          student_id: string;
          updated_at: string;
        }[];
      };
      get_student_enrollment_history: {
        Args: { target_student_id: string };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          class_name: string;
          class_number: string;
          class_section_id: string;
          enrolled_on: string;
          enrollment_id: string;
          exited_on: string;
          grade_name: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
        }[];
      };
      get_student_guardians: {
        Args: { target_student_id: string };
        Returns: {
          can_access_reports: boolean;
          email: string;
          first_name: string;
          guardian_id: string;
          guardian_is_active: boolean;
          guardian_updated_at: string;
          is_primary: boolean;
          last_name: string;
          middle_name: string;
          phone: string;
          relationship: string;
          relationship_id: string;
          relationship_updated_at: string;
        }[];
      };
      get_teaching_assignment: {
        Args: { target_assignment_id: string };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          assignment_id: string;
          class_name: string;
          class_section_id: string;
          employee_number: string;
          ends_on: string;
          grade_level_id: string;
          grade_name: string;
          is_active: boolean;
          period_status: string;
          staff_membership_id: string;
          starts_on: string;
          subject_id: string;
          subject_name: string;
          teacher_name: string;
          teacher_role: Database["public"]["Enums"]["staff_role"];
          term_ends_on: string;
          term_id: string;
          term_name: string;
          term_starts_on: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      link_guardian_to_student: {
        Args: {
          primary_guardian?: boolean;
          relationship: string;
          report_access_eligible?: boolean;
          target_guardian_id: string;
          target_student_id: string;
        };
        Returns: {
          relationship_id: string;
          updated_at: string;
        }[];
      };
      list_assignment_teachers: {
        Args: never;
        Returns: {
          display_name: string;
          employee_number: string;
          staff_membership_id: string;
        }[];
      };
      list_class_teacher_assignments: {
        Args: {
          filter_academic_year_id: string;
          filter_class_section_id: string;
          filter_grade_level_id: string;
          filter_period: string;
          filter_primary: boolean;
          filter_staff_membership_id: string;
          filter_term_id: string;
          page_number: number;
          page_size: number;
        };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          assignment_id: string;
          class_name: string;
          class_section_id: string;
          employee_number: string;
          ends_on: string;
          grade_level_id: string;
          grade_name: string;
          is_active: boolean;
          is_primary: boolean;
          period_status: string;
          staff_membership_id: string;
          starts_on: string;
          teacher_name: string;
          teacher_role: Database["public"]["Enums"]["staff_role"];
          term_ends_on: string;
          term_id: string;
          term_name: string;
          term_starts_on: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      list_eligible_class_teachers: {
        Args: {
          assignment_ends_on: string;
          assignment_is_primary: boolean;
          assignment_starts_on: string;
          target_class_section_id: string;
          target_term_id: string;
        };
        Returns: {
          currently_assigned: boolean;
          display_name: string;
          eligible_teacher_role: Database["public"]["Enums"]["staff_role"];
          employee_number: string;
          membership_status: Database["public"]["Enums"]["membership_status"];
          staff_membership_id: string;
        }[];
      };
      list_eligible_subject_teachers: {
        Args: {
          assignment_ends_on: string;
          assignment_starts_on: string;
          target_class_section_id: string;
          target_subject_id: string;
          target_term_id: string;
        };
        Returns: {
          currently_assigned: boolean;
          display_name: string;
          eligible_teacher_role: Database["public"]["Enums"]["staff_role"];
          employee_number: string;
          membership_status: Database["public"]["Enums"]["membership_status"];
          staff_membership_id: string;
        }[];
      };
      list_students: {
        Args: {
          filter_academic_year_id?: string;
          filter_class_section_id?: string;
          filter_enrollment_status?: Database["public"]["Enums"]["enrollment_status"];
          filter_grade_level_id?: string;
          filter_student_status?: Database["public"]["Enums"]["student_status"];
          page_number?: number;
          page_size?: number;
          search_text?: string;
        };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          active_class_count: number;
          admission_number: string;
          class_capacity: number;
          class_is_active: boolean;
          class_name: string;
          class_number: string;
          class_section_id: string;
          enrollment_id: string;
          enrollment_status: Database["public"]["Enums"]["enrollment_status"];
          first_name: string;
          grade_level_id: string;
          grade_name: string;
          last_name: string;
          middle_name: string;
          photo_storage_path: string;
          placement_is_current: boolean;
          student_id: string;
          student_status: Database["public"]["Enums"]["student_status"];
          total_count: number;
          updated_at: string;
        }[];
      };
      list_teaching_assignments: {
        Args: {
          filter_academic_year_id: string;
          filter_class_section_id: string;
          filter_grade_level_id: string;
          filter_period: string;
          filter_staff_membership_id: string;
          filter_subject_id: string;
          filter_term_id: string;
          page_number: number;
          page_size: number;
        };
        Returns: {
          academic_year_id: string;
          academic_year_name: string;
          assignment_id: string;
          class_name: string;
          class_section_id: string;
          employee_number: string;
          ends_on: string;
          grade_level_id: string;
          grade_name: string;
          is_active: boolean;
          period_status: string;
          staff_membership_id: string;
          starts_on: string;
          subject_id: string;
          subject_name: string;
          teacher_name: string;
          teacher_role: Database["public"]["Enums"]["staff_role"];
          term_ends_on: string;
          term_id: string;
          term_name: string;
          term_starts_on: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      move_student_class: {
        Args: {
          capacity_override?: boolean;
          capacity_override_reason?: string;
          class_number: string;
          expected_updated_at: string;
          target_class_section_id: string;
          target_enrollment_id: string;
        };
        Returns: {
          enrollment_id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
        }[];
      };
      open_term: {
        Args: { expected_updated_at: string; target_term_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      remove_grade_level_subject: {
        Args: { expected_updated_at: string; target_mapping_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      reorder_grade_levels: {
        Args: { ordered_grades: Json };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      reorder_subjects: {
        Args: { ordered_subjects: Json };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      replace_primary_class_teacher: {
        Args: {
          reason: string;
          replacement_starts_on: string;
          target_class_section_id: string;
          target_staff_membership_id: string;
          target_term_id: string;
        };
        Returns: {
          former_assignment_id: string;
          replacement_assignment_id: string;
          replacement_updated_at: string;
        }[];
      };
      retire_assessment_scheme: {
        Args: { expected_updated_at: string; target_scheme_id: string };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      save_assessment_scheme_draft: {
        Args: {
          expected_updated_at: string;
          scheme_components: Json;
          scheme_effective_from: string;
          scheme_name: string;
          target_grade_level_id: string;
          target_scheme_id: string;
          target_subject_id: string;
          target_term_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      save_grading_scale_draft: {
        Args: {
          expected_updated_at: string;
          scale_bands: Json;
          scale_effective_from: string;
          scale_name: string;
          target_academic_year_id: string;
          target_grade_level_id: string;
          target_scale_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      save_promotion_rule: {
        Args: {
          expected_updated_at: string;
          rule_additional_configuration: Json;
          rule_maximum_aggregate: number;
          rule_minimum_attendance_percentage: number;
          rule_minimum_average: number;
          rule_minimum_subjects_passed: number;
          rule_name: string;
          rule_required_subjects: Json;
          target_academic_year_id: string;
          target_grade_level_id: string;
          target_rule_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      save_ranking_rule: {
        Args: {
          expected_updated_at: string;
          rule_configuration: Json;
          rule_name: string;
          rule_ranking_basis: Database["public"]["Enums"]["ranking_basis"];
          rule_tie_method: Database["public"]["Enums"]["ranking_tie_method"];
          target_academic_year_id: string;
          target_grade_level_id: string;
          target_rule_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      set_class_section_active: {
        Args: {
          expected_updated_at: string;
          target_active: boolean;
          target_class_section_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      set_grade_level_active: {
        Args: {
          expected_updated_at: string;
          target_active: boolean;
          target_grade_level_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      set_grade_level_subject: {
        Args: {
          expected_updated_at?: string;
          mapping_contributes_to_aggregate: boolean;
          mapping_required: boolean;
          mapping_sort_order: number;
          target_grade_level_id: string;
          target_mapping_id?: string;
          target_subject_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      set_my_active_membership: {
        Args: { target_membership_id: string };
        Returns: string;
      };
      set_student_photo_path: {
        Args: {
          expected_updated_at: string;
          photo_storage_path: string;
          target_student_id: string;
        };
        Returns: {
          student_id: string;
          updated_at: string;
        }[];
      };
      set_subject_active: {
        Args: {
          expected_updated_at: string;
          target_active: boolean;
          target_subject_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      unlink_guardian_from_student: {
        Args: {
          expected_updated_at: string;
          reason: string;
          target_relationship_id: string;
        };
        Returns: undefined;
      };
      update_academic_year: {
        Args: {
          expected_updated_at: string;
          target_year_id: string;
          year_ends_on: string;
          year_name: string;
          year_starts_on: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      update_class_section: {
        Args: {
          expected_updated_at: string;
          section_capacity: number;
          section_code: string;
          section_name: string;
          target_academic_year_id: string;
          target_class_section_id: string;
          target_grade_level_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      update_class_teacher_assignment: {
        Args: {
          assignment_ends_on: string;
          assignment_starts_on: string;
          expected_updated_at: string;
          target_assignment_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      update_grade_level: {
        Args: {
          expected_updated_at: string;
          grade_code: string;
          grade_is_final: boolean;
          grade_name: string;
          grade_sort_order: number;
          target_grade_level_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      update_grade_level_subject: {
        Args: {
          expected_updated_at: string;
          mapping_contributes_to_aggregate: boolean;
          mapping_required: boolean;
          mapping_sort_order: number;
          target_mapping_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      update_guardian: {
        Args: {
          email: string;
          expected_updated_at: string;
          first_name: string;
          last_name: string;
          middle_name: string;
          phone: string;
          target_guardian_id: string;
          target_is_active: boolean;
        };
        Returns: {
          guardian_id: string;
          is_active: boolean;
          updated_at: string;
        }[];
      };
      update_student_enrollment: {
        Args: {
          class_number: string;
          enrolled_on: string;
          expected_updated_at: string;
          target_enrollment_id: string;
        };
        Returns: {
          enrollment_id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
        }[];
      };
      update_student_guardian_relationship: {
        Args: {
          expected_updated_at: string;
          primary_guardian: boolean;
          relationship: string;
          report_access_eligible: boolean;
          target_relationship_id: string;
        };
        Returns: {
          relationship_id: string;
          updated_at: string;
        }[];
      };
      update_student_profile: {
        Args: {
          admission_date: string;
          admission_number: string;
          date_of_birth: string;
          expected_updated_at: string;
          first_name: string;
          gender: string;
          last_name: string;
          middle_name: string;
          target_student_id: string;
        };
        Returns: {
          student_id: string;
          student_status: Database["public"]["Enums"]["student_status"];
          updated_at: string;
        }[];
      };
      update_subject: {
        Args: {
          expected_updated_at: string;
          subject_code: string;
          subject_contributes_to_aggregate: boolean;
          subject_description: string;
          subject_is_core: boolean;
          subject_name: string;
          subject_sort_order: number;
          target_subject_id: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
      update_teaching_assignment: {
        Args: {
          assignment_ends_on: string;
          assignment_starts_on: string;
          expected_updated_at: string;
          target_assignment_id: string;
        };
        Returns: {
          assignment_id: string;
          updated_at: string;
        }[];
      };
      update_term: {
        Args: {
          expected_updated_at: string;
          promotion_term: boolean;
          target_term_id: string;
          target_term_number: number;
          term_ends_on: string;
          term_name: string;
          term_starts_on: string;
        };
        Returns: {
          entity_id: string;
          entity_status: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      academic_year_status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
      app_permission:
        | "DASHBOARD_VIEW"
        | "TEACHER_WORKSPACE_VIEW"
        | "SCHOOL_SETTINGS_VIEW"
        | "SCHOOL_SETTINGS_MANAGE"
        | "STAFF_VIEW"
        | "STAFF_MANAGE"
        | "ACADEMIC_CONFIGURATION_VIEW"
        | "ACADEMIC_CONFIGURATION_MANAGE"
        | "STUDENTS_VIEW_ALL"
        | "STUDENTS_VIEW_ASSIGNED"
        | "STUDENTS_MANAGE"
        | "ASSIGNMENTS_VIEW_ALL"
        | "ASSIGNMENTS_VIEW_OWN"
        | "ASSIGNMENTS_MANAGE"
        | "MARKS_VIEW_ALL"
        | "MARKS_VIEW_ASSIGNED"
        | "MARKS_ENTER"
        | "MARKS_SUBMIT"
        | "MARKS_REVIEW"
        | "MARKS_APPROVE"
        | "MARKS_LOCK"
        | "ATTENDANCE_VIEW_ALL"
        | "ATTENDANCE_MANAGE_ASSIGNED"
        | "COMMENTS_VIEW_ALL"
        | "COMMENTS_MANAGE_ASSIGNED"
        | "REPORTS_VIEW_ALL"
        | "REPORTS_VIEW_ASSIGNED"
        | "REPORTS_GENERATE"
        | "REPORTS_REVIEW"
        | "REPORTS_PUBLISH"
        | "REPORTS_WITHDRAW"
        | "ANALYTICS_VIEW"
        | "PROMOTION_VIEW"
        | "PROMOTION_CONFIRM"
        | "AUDIT_VIEW";
      assessment_attendance_status:
        "PRESENT" | "ABSENT" | "EXEMPTED" | "NOT_ASSESSED";
      assessment_scheme_status: "DRAFT" | "ACTIVE" | "RETIRED";
      enrollment_status:
        "ACTIVE" | "TRANSFERRED" | "WITHDRAWN" | "COMPLETED" | "REPEATING";
      mark_sheet_status:
        | "DRAFT"
        | "SUBMITTED"
        | "UNDER_REVIEW"
        | "RETURNED"
        | "APPROVED"
        | "LOCKED";
      membership_status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
      promotion_outcome:
        | "PROMOTED"
        | "PROMOTED_WITH_SUPPORT"
        | "ACADEMIC_REVIEW"
        | "REPEAT_RECOMMENDED"
        | "REPEAT_CONFIRMED"
        | "COMPLETED"
        | "TRANSFERRED"
        | "WITHDRAWN"
        | "NOT_APPLICABLE";
      ranking_basis: "TOTAL" | "AVERAGE" | "AGGREGATE" | "CONFIGURED";
      ranking_tie_method: "DENSE" | "COMPETITION" | "ORDINAL" | "SHARED";
      report_batch_status:
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "PARTIAL"
        | "FAILED"
        | "CANCELLED";
      report_status:
        | "DRAFT"
        | "GENERATING"
        | "GENERATED"
        | "REVIEWED"
        | "PUBLISHED"
        | "WITHDRAWN"
        | "FAILED"
        | "SUPERSEDED";
      staff_role:
        | "SUPER_ADMIN"
        | "SCHOOL_ADMIN"
        | "HEAD_TEACHER"
        | "ACADEMIC_REGISTRAR"
        | "CLASS_TEACHER"
        | "SUBJECT_TEACHER";
      student_status:
        | "ACTIVE"
        | "TRANSFERRED"
        | "WITHDRAWN"
        | "COMPLETED"
        | "DECEASED"
        | "INACTIVE";
      term_status:
        | "DRAFT"
        | "OPEN"
        | "MARKS_ENTRY"
        | "REVIEW"
        | "LOCKED"
        | "REPORTS"
        | "CLOSED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      academic_year_status: ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"],
      app_permission: [
        "DASHBOARD_VIEW",
        "TEACHER_WORKSPACE_VIEW",
        "SCHOOL_SETTINGS_VIEW",
        "SCHOOL_SETTINGS_MANAGE",
        "STAFF_VIEW",
        "STAFF_MANAGE",
        "ACADEMIC_CONFIGURATION_VIEW",
        "ACADEMIC_CONFIGURATION_MANAGE",
        "STUDENTS_VIEW_ALL",
        "STUDENTS_VIEW_ASSIGNED",
        "STUDENTS_MANAGE",
        "ASSIGNMENTS_VIEW_ALL",
        "ASSIGNMENTS_VIEW_OWN",
        "ASSIGNMENTS_MANAGE",
        "MARKS_VIEW_ALL",
        "MARKS_VIEW_ASSIGNED",
        "MARKS_ENTER",
        "MARKS_SUBMIT",
        "MARKS_REVIEW",
        "MARKS_APPROVE",
        "MARKS_LOCK",
        "ATTENDANCE_VIEW_ALL",
        "ATTENDANCE_MANAGE_ASSIGNED",
        "COMMENTS_VIEW_ALL",
        "COMMENTS_MANAGE_ASSIGNED",
        "REPORTS_VIEW_ALL",
        "REPORTS_VIEW_ASSIGNED",
        "REPORTS_GENERATE",
        "REPORTS_REVIEW",
        "REPORTS_PUBLISH",
        "REPORTS_WITHDRAW",
        "ANALYTICS_VIEW",
        "PROMOTION_VIEW",
        "PROMOTION_CONFIRM",
        "AUDIT_VIEW",
      ],
      assessment_attendance_status: [
        "PRESENT",
        "ABSENT",
        "EXEMPTED",
        "NOT_ASSESSED",
      ],
      assessment_scheme_status: ["DRAFT", "ACTIVE", "RETIRED"],
      enrollment_status: [
        "ACTIVE",
        "TRANSFERRED",
        "WITHDRAWN",
        "COMPLETED",
        "REPEATING",
      ],
      mark_sheet_status: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "RETURNED",
        "APPROVED",
        "LOCKED",
      ],
      membership_status: ["INVITED", "ACTIVE", "SUSPENDED", "DISABLED"],
      promotion_outcome: [
        "PROMOTED",
        "PROMOTED_WITH_SUPPORT",
        "ACADEMIC_REVIEW",
        "REPEAT_RECOMMENDED",
        "REPEAT_CONFIRMED",
        "COMPLETED",
        "TRANSFERRED",
        "WITHDRAWN",
        "NOT_APPLICABLE",
      ],
      ranking_basis: ["TOTAL", "AVERAGE", "AGGREGATE", "CONFIGURED"],
      ranking_tie_method: ["DENSE", "COMPETITION", "ORDINAL", "SHARED"],
      report_batch_status: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "PARTIAL",
        "FAILED",
        "CANCELLED",
      ],
      report_status: [
        "DRAFT",
        "GENERATING",
        "GENERATED",
        "REVIEWED",
        "PUBLISHED",
        "WITHDRAWN",
        "FAILED",
        "SUPERSEDED",
      ],
      staff_role: [
        "SUPER_ADMIN",
        "SCHOOL_ADMIN",
        "HEAD_TEACHER",
        "ACADEMIC_REGISTRAR",
        "CLASS_TEACHER",
        "SUBJECT_TEACHER",
      ],
      student_status: [
        "ACTIVE",
        "TRANSFERRED",
        "WITHDRAWN",
        "COMPLETED",
        "DECEASED",
        "INACTIVE",
      ],
      term_status: [
        "DRAFT",
        "OPEN",
        "MARKS_ENTRY",
        "REVIEW",
        "LOCKED",
        "REPORTS",
        "CLOSED",
      ],
    },
  },
} as const;
