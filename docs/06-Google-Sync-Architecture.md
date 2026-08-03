# 06 - Google Synchronization & Data Architecture

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines how data flows between Google Sheets, Google Drive and the TMS.

The objective is to create **one operational database** while preserving the integrity of the original source sheets.

The source sheets are the company's source of operational truth.

The TMS Master sheet is the application's operational database.

---

# Design Philosophy

The TMS must never work directly from the source sheets.

Instead it should synchronize all information into **TMS Master**.

Every module in the application reads from **TMS Master**.

Only the Synchronization Engine communicates with the source sheets.

---

# Data Sources

The application uses four Google resources.

## Source Sheet 1

Purpose

Operational Container Data

Permissions

Read Only

Never modify.

Never delete.

Never append.

---

## Source Sheet 2

Purpose

Detention & Demurrage

Permissions

Read Only

Never modify.

Never delete.

Never append.

---

## Google Drive

Contains

- PU Screenshots
- Invoice PDFs
- POD
- Gate Receipts
- Supporting Documents

---

## TMS Master

Purpose

Application Database

Permissions

Read / Write

Every module writes only to this sheet.

---

# System Architecture

```
                Google Drive
                     │
                     │
                     ▼

Source Sheet 1      Source Sheet 2
        │                  │
        └──────────┬───────┘
                   │
                   ▼
          Synchronization Engine
                   │
                   ▼
            Merge Engine
                   │
                   ▼
             Validation Engine
                   │
                   ▼
              TMS Master
                   │
                   ▼
      Entire TMS Application
```

---

# Synchronization Philosophy

Never update the source sheets.

The application only

Read

↓

Merge

↓

Validate

↓

Write to TMS Master

---

# Synchronization Modes

Support

## Manual

User clicks

```
Refresh Data
```

---

## Automatic

Configurable interval

Examples

5 minutes

10 minutes

15 minutes

30 minutes

60 minutes

---

## Startup

Automatically synchronize when

Application starts.

---

# Synchronization Order

Always process

1.

Source Sheet 1

↓

2.

Source Sheet 2

↓

3.

Google Drive

↓

4.

Outlook Processing

↓

5.

OCR

↓

6.

Invoice Parsing

↓

7.

Merge

↓

8.

Validation

↓

9.

Update TMS Master

---

# Primary Key

Every container is identified by

Container Number

This is the unique record identifier.

Never create duplicate containers.

---

# Merge Rules

When importing

If Container Exists

↓

Update only imported fields.

↓

Preserve user-generated fields.

If Container Does Not Exist

↓

Create new record.

---

# Preserve User Data

Never overwrite

- Internal Notes
- Vendor Notes
- AI Notes
- Cost Overrides
- Dispatch Notes
- User Assignments
- Reminder Status
- Manual Corrections

These belong exclusively to TMS Master.

---

# Data Validation

Validate

Container Number

Vendor

SSL

Appointment

LFD

Invoice Amount

Dates

Duplicates

Missing Required Fields

---

# Conflict Detection

Examples

Different Vendor

Different LFD

Different Appointment

Different Terminal

Different PU

When conflict occurs

Display

Conflict Queue

Allow user to choose

Imported Value

or

Current Value

Never overwrite silently.

---

# Duplicate Detection

Detect

Duplicate Containers

Duplicate Invoices

Duplicate Emails

Duplicate Documents

Flag duplicates.

Never import duplicates automatically.

---

# Google Drive Synchronization

During synchronization

Locate

PU Images

Invoice PDFs

POD

Receipts

Supporting Files

Associate each file using

Container Number

Invoice Number

Booking Number

Manual Assignment (if required)

Store

Google Drive File ID

inside TMS Master.

---

# Attachment Categories

Support

PU Screenshot

Invoice

POD

Gate Receipt

Appointment

Other

---

# Incremental Synchronization

Never import everything again.

Only process

New Records

Changed Records

New Files

New Emails

Deleted references

This improves performance.

---

# Refresh Data Button

When clicked

Run

Source Sheet 1

↓

Source Sheet 2

↓

Google Drive

↓

Outlook

↓

OCR

↓

Invoices

↓

Merge

↓

Validation

↓

Update TMS Master

↓

Refresh Dashboard

Display progress to the user.

---

# Synchronization Log

Record

Start Time

Finish Time

Duration

Imported Records

Updated Records

Skipped Records

Conflicts

Errors

Warnings

User

---

# Synchronization Dashboard

Display

Last Sync

Next Scheduled Sync

Duration

Success Rate

Errors

Warnings

Progress

Status

---

# Error Handling

Handle

Google Unavailable

Sheet Missing

Permission Denied

Rate Limit

Network Failure

Drive Failure

Missing File

Duplicate Record

Corrupt Data

Retry automatically when appropriate.

---

# Caching

Cache

Frequently accessed data.

Refresh cache after synchronization.

Avoid unnecessary Google requests.

---

# Data Relationships

Container

↓

Vendor

↓

Invoice

↓

Documents

↓

Emails

↓

Reminders

↓

Cost Analysis

Every record should remain linked.

---

# Import Queue

Before writing

Validate

↓

Transform

↓

Merge

↓

Write

Never write invalid data.

---

# Synchronization Settings

Allow administrators to configure

Automatic Sync

Sync Interval

Retry Attempts

Maximum Batch Size

Conflict Rules

Logging

Notifications

---

# Future Enhancements

Architecture should support

Google BigQuery

Cloud SQL

PostgreSQL

SQL Server

Azure Storage

AWS S3

without redesigning synchronization.

---

# Claude Code Instructions

Implement synchronization as an independent background service.

Requirements

- Never modify the source sheets.
- Every application module reads from **TMS Master**.
- Synchronization must be incremental.
- Preserve user-generated data.
- Maintain detailed synchronization logs.
- Support manual and scheduled synchronization.
- Handle failures gracefully.
- Keep synchronization independent from the UI.
- The UI should only display synchronization status and trigger refreshes.

---

# Success Criteria

The Synchronization Engine becomes the heart of the application.

Users should trust that **TMS Master** always contains the latest operational information while the original source sheets remain untouched.

Synchronization should be reliable, fast, transparent and fully auditable.

---

**End of Document**