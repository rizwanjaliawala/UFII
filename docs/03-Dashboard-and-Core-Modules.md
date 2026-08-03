# 03 - Dashboard & Core Modules

**Project:** Utopia Fulfillment Inc. Transportation Management System (TMS)

**Version:** 1.0

---

# Purpose

This document defines the application's functional modules, dashboard, navigation flow, and operational workflows.

The Dashboard must become the operations team's command center where users can monitor, analyze and manage the entire container lifecycle from one screen.

Every module should communicate with the **TMS Master** database while maintaining synchronization with the source sheets.

---

# Main Navigation

The application sidebar should contain:

```
Dashboard

Container Search

Container 360

PU / LFD

Detention & Demurrage

Cost Analysis

Vendor Management

Reports

Alerts & Reminders

AI Assistant

Synchronization

Administration

Settings
```

Each module must be independently maintainable.

---

# Dashboard

The Dashboard is the first screen users see.

Its purpose is to answer:

- What needs attention?
- Which containers are at risk?
- Which vendors require follow-up?
- What costs are increasing?
- Are there synchronization issues?
- Are there unread emails?

The dashboard should update after every successful synchronization.

---

# Dashboard Layout

```
-------------------------------------------------------

Top KPI Cards

-------------------------------------------------------

Needs Attention

LFD Risk

Today's Operations

Notifications

-------------------------------------------------------

Container Activity

Vendor Performance

Cost Analysis

-------------------------------------------------------

Recent Activity

Synchronization Status

Unread Emails

-------------------------------------------------------
```

---

# KPI Cards

Display:

## Active Containers

- Total Active
- Picked Up
- Delivered
- Empty Returned

---

## Today's Operations

Show

- Containers arriving today
- Appointments today
- Pickups today
- Deliveries today

---

## LFD Status

Display

Safe

Warning

Critical

Overdue

Clicking opens filtered container list.

---

## Vendor Summary

Display

- Active Vendors
- Containers Assigned
- Average Response Time
- Outstanding Updates

---

## Cost Summary

Display

- Expected Cost
- Actual Cost
- Cost Difference
- Pending Invoices

Clicking opens Cost Analysis.

---

## Synchronization Status

Display

- Last Sync
- Sync Duration
- Records Imported
- Errors

---

## Email Summary

Display

- New Emails
- Unprocessed Emails
- OCR Queue
- Invoice Queue

---

# Needs Attention Widget

Highest priority widget.

Display:

- Missing PU
- Missing Vendor
- Missing Appointment
- Missing Invoice
- LFD Today
- Overdue Containers
- Failed OCR
- Failed Sync
- Failed Invoice Parsing

Each item should link directly to the relevant module.

---

# LFD Risk Board

Three sections

Green

Safe

Amber

Within warning period

Red

Overdue

Sorting

Most urgent first.

---

# Recent Activity

Chronological timeline.

Examples

```
Container Updated

Invoice Imported

Reminder Sent

Vendor Replied

PU Confirmed

Appointment Added

Cost Updated

Email Processed

Synchronization Completed
```

---

# Notifications

Display:

- Critical Alerts
- Warning Alerts
- Information

Users should be able to mark notifications as read.

---

# Dashboard Search

Global search available from every page.

Search by

- Container Number
- Booking Number
- Chassis
- Vendor
- Invoice
- PU
- Terminal
- SSL

Search results should appear instantly.

---

# Container Search Module

Purpose

Locate any container within seconds.

---

## Search Fields

Support:

- Container Number
- Booking Number
- Vendor
- SSL
- Terminal
- Appointment Date
- LFD
- Status

---

## Filters

Active

Delivered

Empty Returned

Overdue

Warning

Missing PU

Missing Vendor

Missing Appointment

Missing Invoice

---

## Search Results

Table Columns

Container

Vendor

SSL

Terminal

Appointment

LFD

Status

Cost

Action

---

Clicking a row opens:

Container 360.

---

# Container 360

This is the most important screen in the application.

When a user clicks any container they should see **everything** related to that container.

---

# Container Summary

Display

- Container Number
- Booking Number
- PU
- Vendor
- SSL
- Terminal
- Appointment
- Gate In
- Gate Out
- Empty Return
- LFD
- Status

---

# Timeline

Chronological history

Examples

```
Container Imported

PU Received

Vendor Assigned

Appointment Scheduled

Picked Up

Gate Out

Delivered

Empty Returned

Invoice Imported
```

---

# Email Section

Display

Latest email summaries.

Each record should include:

- Subject
- Sender
- Date
- One-line summary

Button

```
Show Conversation
```

Clicking it opens a drawer.

---

# Conversation Drawer

Show

- Email Subject
- Date
- Participants
- Thread History
- Short AI-generated summary

Do **not** display the full email body unless explicitly requested.

---

# Attachments

Display all linked documents.

Support

- Image Preview
- PDF Preview
- Download

Examples

- PU Screenshot
- Invoice PDF
- POD
- Gate Receipt

---

# Vendor Information

Display

Vendor Name

Phone

Email

Containers Assigned

KPI Score

Average Response Time

Current Performance

---

# Cost Summary

Display

Expected Cost

Actual Cost

Difference

Pending Invoice

Button

```
Open Cost Analysis
```

---

# AI Insights

Generate a short operational summary.

Example

```
Container is approaching LFD in 24 hours.

No vendor response has been received.

Reminder recommended.

Expected D&D risk: High.
```

---

# Quick Actions

Allow

Assign Vendor

Add Appointment

Send Reminder

View Invoice

View Documents

Open Email Conversation

---

# PU / LFD Module

Purpose

Track pickup numbers and LFD.

Display

Container

PU

LFD

Vendor

Terminal

Status

Countdown

---

Support

Search

Filters

Sorting

Export

---

# OCR Review Queue

Every OCR result must require approval.

Display

Original Screenshot

Detected PU

Confidence Score

Manual Edit

Approve

Reject

Never update TMS Master automatically.

---

# Detention & Demurrage Module

Purpose

Manage imported invoices.

---

Display

Invoice Number

Vendor

Container

Invoice Date

Invoice Amount

Status

Actions

---

Support

Search

Filter

Export

Preview

---

Invoice Review

Before saving:

Verify

- Container
- Vendor
- Amount
- Dates

Allow manual correction.

---

# Vendor Management

Display

Vendor List

Containers

KPI

Response Time

Costs

Compliance

---

Vendor Details

Show

Assigned Containers

Recent Emails

Invoices

Performance Trend

Cost Trend

---

# Reports

Generate

Operational Reports

Vendor Reports

Cost Reports

D&D Reports

Container Reports

Synchronization Reports

Email Reports

Export

PDF

Excel

CSV

---

# Alerts & Reminders

Display

Upcoming LFD

Overdue

Missing Vendor Updates

Missing Appointments

Invoice Missing

Synchronization Errors

Support

Send Reminder

Dismiss

View Container

---

# Synchronization Center

Display

Current Status

Last Sync

Duration

Imported Records

Updated Records

Errors

Manual

```
Refresh Data
```

Button.

---

# Administration

Manage

Application Settings

Synchronization

Reminder Rules

Cost Rules

User Management

Feature Flags

---

# Settings

Configure

Theme

Notifications

Refresh Interval

Dashboard Layout

Email Processing

Cost Analysis

Reminder Timing

---

# Navigation Rules

Every major screen should include:

- Breadcrumbs
- Search
- Refresh
- Notifications
- Help

Users should never feel lost.

---

# Performance Requirements

Dashboard should load in under **2 seconds** with cached data.

Large tables should use virtualization.

Search should return results instantly.

---

# Future Expansion

Design modules to support:

- Driver Management
- Fleet Management
- Customer Portal
- Carrier Portal
- Mobile App
- API Integrations

without major refactoring.

---

# Claude Code Instructions

When implementing modules:

1. Build each module independently.
2. Reuse common components.
3. Never duplicate business logic.
4. Every module must communicate only with **TMS Master**.
5. All updates must be logged.
6. Every module must support loading, empty and error states.
7. Ensure responsive layouts.
8. Maintain enterprise UI consistency defined in **02-UI-UX-Design-System.md**.

---

# Success Criteria

The Dashboard and core modules should allow an operations user to complete daily container management without switching between Google Sheets, Outlook, or other external tools.

The application should become the single operational workspace for Utopia Fulfillment Inc.

---

**End of Document**