# Shipping & Customs Clearance Workflow — Implementation Roadmap

## أحدث حزمة متطلبات — 8 نوفمبر 2026

[خطة ربط الطلبات والخدمات والفواتير والإشعارات](request-invoice-workflow/README.md) تضم مهام مستقلة وحالة تنفيذ وسجل استئناف لكل مهمة. هذه الحزمة توثق متطلبات المستخدم الجديدة، وتوضح الموجود فعليًا وما لم يُنفذ بعد. عند استكمال هذه المتطلبات ابدأ بفهرسها؛ الملاحظات القديمة أدناه لا تعكس وحدها حالة نظام الحسابات الحالي.

This directory contains the codebase analysis, requirement mappings, and step-by-step implementation plans for the end-to-end Shipping and Customs Clearance Workflow.

## Table of Contents

1. [00 Codebase Analysis & Architecture Summar](./00_Codebase_Analysis.md)
2. [01 Order & Quotation](./01_Order_and_Quotation.md)
3. [02 Documents & UCR](./02_Documents_and_UCR.md)
4. [03 Booking & Allocation](./03_Booking_and_Allocation.md)
5. [04 Customs Procedures](./04_Customs_Procedures.md)
6. [05 Shipping Documents & Invoicing](./05_Shipping_Docs_and_Invoicing.md)

## Implementation Order

We strongly recommend executing the tasks in the exact sequential order listed above to respect database constraints and data availability (e.g., UCR needs to exist before Booking, Customs depends on Allocations, etc.).

**Note**: Financials (Invoicing/Payment) are currently stubbed in Epic 05 until the standalone Financials Module is finalized.
