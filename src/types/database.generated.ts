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
      activate_staff_invitation: {
        Args: { expected_membership_ids: string[]; target_profile_id: string };
        Returns: {
          membership_id: string;
        }[];
      };
    };
    Enums: {
      academic_year_status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
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
