# 12 - Database Schema & Data Dictionary

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines the complete data model for the TMS.

It specifies:

- Database structure
- Google Sheet structure
- Relationships
- Data ownership
- Synchronization rules
- Validation rules
- Editable fields
- Read-only fields

This document is the single source of truth for every column used by the application.

---

# Data Architecture

```
Source Sheet 1 (Read Only)
        │
        │
Source Sheet 2 (Read Only)
        │
        ▼
Synchronization Engine
        │
        ▼
Merge Engine
        │
        ▼
TMS Master (Application Database)
        │
        ▼
Entire Application
```

---

# Source Sheet 1

Purpose

Operational Container Information

Permissions

Read Only

Never modify.

---

## Expected Fields

| Field | Type | Required | Editable |
|---------|------|----------|----------|
| Container Number | String | Yes | No |
| Booking Number | String | No | No |
| BL Number | String | No | No |
| SSL | String | Yes | No |
| Terminal | String | Yes | No |
| Vendor | String | No | No |
| Pickup Number | String | No | No |
| Appointment Date | Date | No | No |
| Last Free Day | Date | No | No |
| Gate In Date | Date | No | No |
| Gate Out Date | Date | No | No |
| Empty Return Date | Date | No | No |
| Container Status | String | No | No |
| Size | String | No | No |
| Type | String | No | No |
| Chassis Number | String | No | No |
| Driver | String | No | No |
| Notes | String | No | No |

---

# Source Sheet 2

Purpose

Detention & Demurrage

Permissions

Read Only

---

## Expected Fields

| Field | Type |
|---------|------|
| Invoice Number | String |
| Container Number | String |
| Vendor | String |
| Invoice Date | Date |
| Invoice Amount | Number |
| Currency | String |
| Demurrage | Number |
| Detention | Number |
| Chassis Charges | Number |
| Storage Charges | Number |
| Other Charges | Number |
| Status | String |
| Payment Status | String |

---

# TMS Master

Purpose

Application Database

Permissions

Read / Write

All modules operate from this sheet.

---

# Container Table

Primary Key

```
Container Number
```

---

## Container Information

| Field | Type |
|---------|------|
| Container Number | String |
| Booking Number | String |
| BL Number | String |
| SSL | String |
| Terminal | String |
| Vendor | String |
| Pickup Number | String |
| Appointment Date | Date |
| Last Free Day | Date |
| Gate In Date | Date |
| Gate Out Date | Date |
| Empty Return Date | Date |
| Status | String |
| Size | String |
| Type | String |
| Chassis Number | String |
| Driver | String |

---

# User Generated Fields

These fields belong ONLY to TMS Master.

Never overwrite during synchronization.

| Field |
|--------|
| Internal Notes |
| Dispatch Notes |
| Vendor Notes |
| AI Notes |
| Reminder Status |
| Assigned Dispatcher |
| Priority |
| Tags |
| Flags |

---

# Email Fields

| Field |
|--------|
| Last Email Date |
| Last Email Subject |
| Last Email Sender |
| Conversation ID |
| Email Summary |
| Email Count |
| Vendor Replied |
| Reminder Sent |
| Reminder Date |

---

# Google Drive Fields

| Field |
|--------|
| PU Screenshot ID |
| Invoice PDF ID |
| POD File ID |
| Gate Receipt ID |
| Additional Documents |

Store only Google Drive File IDs.

---

# OCR Fields

| Field |
|--------|
| OCR Status |
| OCR Confidence |
| OCR Result |
| OCR Approved |
| OCR Reviewed By |
| OCR Review Date |

---

# Invoice Fields

| Field |
|--------|
| Invoice Number |
| Invoice Date |
| Invoice Amount |
| Invoice Status |
| Payment Status |
| Invoice Verified |
| Invoice Approved By |

---

# Cost Analysis Fields

| Field |
|--------|
| Estimated Cost |
| Estimated Confidence |
| Actual Cost |
| Variance |
| Cost Difference |
| Chassis Days |
| Demurrage Days |
| Detention Days |
| Storage Days |
| Last Cost Update |

---

# Vendor Fields

| Field |
|--------|
| Vendor Name |
| Vendor Email |
| Vendor Phone |
| Active Containers |
| Average Response Time |
| Average Cost |
| KPI Score |
| Last Contact |

---

# AI Fields

| Field |
|--------|
| Health Score |
| Risk Score |
| AI Recommendation |
| AI Confidence |
| AI Last Updated |

---

# Synchronization Fields

| Field |
|--------|
| Source Sheet |
| Import Date |
| Last Sync |
| Sync Status |
| Conflict Status |
| Last Modified |

---

# Audit Fields

| Field |
|--------|
| Created By |
| Created Date |
| Updated By |
| Updated Date |
| Version |

---

# Relationships

```
Container

↓

Vendor

↓

Emails

↓

Invoices

↓

Documents

↓

Cost Analysis

↓

AI Recommendations
```

Everything revolves around

```
Container Number
```

---

# Validation Rules

Container Number

- Required
- Unique

Vendor

- Cannot be blank once assigned

Invoice

- Must belong to one container

Cost

- Cannot be negative

Dates

- Must be valid

LFD

- Cannot be before Gate In

---

# Synchronization Rules

Read

Source Sheet 1

↓

Read

Source Sheet 2

↓

Merge

↓

Preserve User Fields

↓

Update TMS Master

Never overwrite

- Notes
- AI Fields
- User Assignments
- Reminder Status

---

# Lookup Rules

Container Number is the master lookup key.

Secondary lookups

- Booking Number
- Invoice Number
- PU Number
- Chassis Number

---

# Status Values

Container Status

- Pending
- Pickup Scheduled
- Picked Up
- Delivered
- Empty Returned
- Closed

Invoice Status

- Expected
- Received
- Approved
- Paid
- Disputed

Reminder Status

- Pending
- Sent
- Responded
- Escalated

Synchronization

- Success
- Failed
- Pending

---

# Indexing

Frequently searched fields

- Container Number
- Booking Number
- Vendor
- Invoice Number
- PU Number
- Terminal
- SSL

Cache these values.

---

# Data Retention

Never delete

- Audit History
- Cost History
- Email History
- Reminder History
- AI Recommendations

Archive instead.

---

# Future Expansion

The schema should support future additions without breaking compatibility.

Examples

- Driver Management
- Fleet Management
- GPS Tracking
- Customer Portal
- Multi-Company
- Multi-Warehouse
- PostgreSQL Migration
- SQL Server Migration

---

# Claude Code Instructions

Before implementing any database interaction:

1. Follow this schema exactly.
2. Do not invent additional fields unless necessary.
3. Preserve backward compatibility.
4. Never overwrite protected user-generated fields.
5. Validate imported data before writing.
6. Use **Container Number** as the primary key throughout the application.
7. Ensure every module reads and writes using this schema.

---

# Success Criteria

The TMS Master sheet should function as a structured, reliable application database, providing a single source of truth for all operational, financial, AI, and communication data while preserving the integrity of the original source sheets.

---

**End of Document**
