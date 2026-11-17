"use client"

import React from "react"
import { DocumentUploadWizard, DocumentUploadWizardProps } from "./DocumentUploadWizard"

export type DocumentCategory =
  | "commercial_register"
  | "tax_card"
  | "import_card"
  | "export_card"
  | "license"
  | "customs_certificate"
  | "contract"
  | "other"
  | string

export interface MultiFileUploadZoneProps {
  currentCount: number
  maxAllowed?: number
  onUploadComplete?: () => void
  entityId?: string
}

export function MultiFileUploadZone(props: MultiFileUploadZoneProps) {
  return <DocumentUploadWizard {...props} />
}

export { DocumentUploadWizard }
