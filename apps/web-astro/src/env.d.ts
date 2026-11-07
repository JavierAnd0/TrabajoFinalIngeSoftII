/// <reference path="../.astro/types.d.ts" />

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  campusId: string;
  campusName: string;
  campusCode: string;
  studentCode: string | null;
  documentNumber: string;
}

declare namespace App {
  interface Locals {
    user: SessionUser | null;
    token: string | null;
  }
}
